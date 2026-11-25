// pg returns numeric values (the numeric columns, AVG and SUM) as strings — toNumber() normalizes on
// the way out. Averages are rounded to six decimals over numeric(5,2) and four over bigint, the
// precision the usage API reports, and the hourly rollup stores from.

import {storedUsername} from '#sepal/username'

import {DAY_MS, HOUR_MS} from '../time.js'

export class UsageRepository {
    #db
    #clock

    constructor(db, clock) {
        this.#db = db
        this.#clock = clock
    }

    insertSample(sample) {
        return this.#db.withConnection(async connection => {
            await connection.query(
                `INSERT INTO instance_usage_sample(session_id, username, instance_type, sample_time,
                    cpu_pct, ram_bytes, ram_pct, gpu_pct, gpu_ram_bytes, net_rx_bytes_per_s, net_tx_bytes_per_s)
                    VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                [
                    sample.sessionId, storedUsername(sample.username), sample.instanceType, sample.sampleTime,
                    sample.cpuPct, sample.ramBytes, sample.ramPct, sample.gpuPct, sample.gpuRamBytes,
                    sample.netRxBytesPerS, sample.netTxBytesPerS,
                ]
            )
        })
    }

    latestForSessions(sessionIds) {
        if (!sessionIds || !sessionIds.length) {
            return Promise.resolve(new Map())
        }
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                `SELECT s.session_id, s.sample_time, s.cpu_pct, s.ram_pct, s.gpu_pct,
                    s.net_rx_bytes_per_s + s.net_tx_bytes_per_s AS net_bytes_per_s
                    FROM instance_usage_sample s
                    JOIN (
                        SELECT session_id, MAX(sample_time) AS max_time
                        FROM instance_usage_sample
                        WHERE session_id = ANY($1)
                        GROUP BY session_id
                    ) m ON s.session_id = m.session_id AND s.sample_time = m.max_time`,
                [sessionIds]
            )
            return new Map(rows.map(row => [row.session_id, {
                cpuPct: toNumber(row.cpu_pct),
                ramPct: toNumber(row.ram_pct),
                gpuPct: toNumber(row.gpu_pct),
                netBytesPerS: toNumber(row.net_bytes_per_s),
                sampleTime: new Date(row.sample_time),
            }]))
        })
    }

    // One session's samples since fromTime, averaged into buckets of bucketSeconds counted from
    // fromTime, oldest first. Each bucket is timed by its newest sample, so the last point is the
    // latest reading rather than a bucket boundary still in the future.
    sessionHistory(sessionId, {fromTime, bucketSeconds}) {
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                `SELECT MAX(sample_time) AS sample_time,
                    round(AVG(cpu_pct), 6) AS cpu_pct, round(AVG(ram_pct), 6) AS ram_pct,
                    round(AVG(gpu_pct), 6) AS gpu_pct,
                    round(AVG(net_rx_bytes_per_s + net_tx_bytes_per_s), 4) AS net_bytes_per_s
                    FROM instance_usage_sample
                    WHERE session_id = $1 AND sample_time >= $2
                    GROUP BY floor(extract(epoch FROM sample_time - $2::timestamptz) / $3::integer)
                    ORDER BY sample_time`,
                [sessionId, fromTime, bucketSeconds]
            )
            return rows.map(row => ({
                sampleTime: new Date(row.sample_time),
                cpuPct: toNumber(row.cpu_pct),
                ramPct: toNumber(row.ram_pct),
                gpuPct: toNumber(row.gpu_pct),
                netBytesPerS: toNumber(row.net_bytes_per_s),
            }))
        })
    }

    // Re-running for an hour that already has rows overwrites them with the same aggregates, which
    // is what makes the heal window safe.
    rollupHours(hoursBack = 2) {
        return this.#db.withConnection(async connection => {
            const currentHourStart = Math.floor(this.#clock().getTime() / HOUR_MS) * HOUR_MS
            for (let i = hoursBack; i >= 1; i--) {
                const hourStart = new Date(currentHourStart - i * HOUR_MS)
                const hourEnd = new Date(currentHourStart - (i - 1) * HOUR_MS)
                await connection.query(
                    `INSERT INTO instance_usage_hourly(session_id, username, instance_type, hour, sample_count,
                        cpu_avg, cpu_max, ram_avg, ram_max, gpu_avg, gpu_max, gpu_ram_max, net_avg_bytes_per_s)
                    SELECT session_id, username, instance_type, $1::timestamptz, COUNT(*),
                        round(AVG(cpu_pct), 6), MAX(cpu_pct), round(AVG(ram_pct), 6), MAX(ram_pct),
                        round(AVG(gpu_pct), 6), MAX(gpu_pct), MAX(gpu_ram_bytes),
                        round(AVG(COALESCE(net_rx_bytes_per_s, 0) + COALESCE(net_tx_bytes_per_s, 0)), 4)
                    FROM instance_usage_sample
                    WHERE sample_time >= $1 AND sample_time < $2
                    GROUP BY session_id, username, instance_type
                    ON CONFLICT (session_id, hour) DO UPDATE SET
                        sample_count = EXCLUDED.sample_count,
                        cpu_avg = EXCLUDED.cpu_avg, cpu_max = EXCLUDED.cpu_max,
                        ram_avg = EXCLUDED.ram_avg, ram_max = EXCLUDED.ram_max,
                        gpu_avg = EXCLUDED.gpu_avg, gpu_max = EXCLUDED.gpu_max,
                        gpu_ram_max = EXCLUDED.gpu_ram_max,
                        net_avg_bytes_per_s = EXCLUDED.net_avg_bytes_per_s`,
                    [hourStart, hourEnd]
                )
            }
        })
    }

    pruneSamples(retentionDays) {
        return this.#db.withConnection(async connection => {
            const cutoff = new Date(this.#clock().getTime() - retentionDays * DAY_MS)
            const {rowCount} = await connection.query(
                'DELETE FROM instance_usage_sample WHERE sample_time < $1', [cutoff])
            return rowCount
        })
    }

    pruneHourly(retentionDays) {
        return this.#db.withConnection(async connection => {
            const cutoff = new Date(this.#clock().getTime() - retentionDays * DAY_MS)
            const {rowCount} = await connection.query(
                'DELETE FROM instance_usage_hourly WHERE hour < $1', [cutoff])
            return rowCount
        })
    }

    // `samples` counts rows where cpu_pct was measured — the coverage denominator. Coverage below
    // the floor is NOT a verdict: the caller treats it as busy for a bounded number of ticks
    // (busyVerdict.js), because under a deadline missing data would otherwise close a computing
    // instance.
    busyWindowStats(sessionIds, fromTime) {
        if (!sessionIds || !sessionIds.length) {
            return Promise.resolve(new Map())
        }
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                `SELECT session_id,
                    COUNT(cpu_pct) AS samples,
                    round(AVG(cpu_pct), 6) AS cpu_avg,
                    COUNT(gpu_pct) AS gpu_samples,
                    round(AVG(gpu_pct), 6) AS gpu_avg,
                    round(AVG(COALESCE(net_rx_bytes_per_s, 0) + COALESCE(net_tx_bytes_per_s, 0)), 4) AS net_avg
                    FROM instance_usage_sample
                    WHERE session_id = ANY($1) AND sample_time >= $2
                    GROUP BY session_id`,
                [sessionIds, fromTime]
            )
            return new Map(rows.map(row => [row.session_id, {
                samples: Number(row.samples),
                cpuAvg: toNumber(row.cpu_avg),
                gpuSamples: Number(row.gpu_samples),
                gpuAvg: toNumber(row.gpu_avg),
                netAvg: toNumber(row.net_avg),
            }]))
        })
    }

    // Per-metric weighted sums with per-metric denominators: a metric's weight counts only the
    // sample_counts of rows where that metric was measured, which is what keeps GPU averages
    // weighted over GPU-instance hours alone. A null username rolls up every user.
    userUsageRollup(username, fromTime, toTime) {
        return this.#db.withConnection(async connection => {
            const {rows} = await connection.query(
                `SELECT instance_type,
                    COUNT(*) AS hours,
                    SUM(CASE WHEN cpu_avg IS NOT NULL THEN sample_count END) AS cpu_weight,
                    SUM(cpu_avg * sample_count) AS cpu_sum,
                    MAX(cpu_max) AS cpu_max,
                    SUM(CASE WHEN ram_avg IS NOT NULL THEN sample_count END) AS ram_weight,
                    SUM(ram_avg * sample_count) AS ram_sum,
                    MAX(ram_max) AS ram_max,
                    SUM(CASE WHEN gpu_avg IS NOT NULL THEN sample_count END) AS gpu_weight,
                    SUM(gpu_avg * sample_count) AS gpu_sum,
                    MAX(gpu_max) AS gpu_max,
                    SUM(CASE WHEN net_avg_bytes_per_s IS NOT NULL THEN sample_count END) AS net_weight,
                    SUM(net_avg_bytes_per_s * sample_count) AS net_sum
                    FROM instance_usage_hourly
                    WHERE ${username == null ? 'hour >= $1 AND hour < $2' : 'username = $1 AND hour >= $2 AND hour < $3'}
                    GROUP BY instance_type
                    ORDER BY hours DESC`,
                username == null ? [fromTime, toTime] : [username, fromTime, toTime]
            )
            return rows.map(row => ({
                instanceType: row.instance_type,
                hours: Number(row.hours),
                cpuWeight: Number(row.cpu_weight ?? 0), cpuSum: Number(row.cpu_sum ?? 0), cpuMax: toNumber(row.cpu_max),
                ramWeight: Number(row.ram_weight ?? 0), ramSum: Number(row.ram_sum ?? 0), ramMax: toNumber(row.ram_max),
                gpuWeight: Number(row.gpu_weight ?? 0), gpuSum: Number(row.gpu_sum ?? 0), gpuMax: toNumber(row.gpu_max),
                netWeight: Number(row.net_weight ?? 0), netSum: Number(row.net_sum ?? 0),
            }))
        })
    }
}

const toNumber = value => value == null ? null : Number(value)
