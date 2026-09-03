// Usage repository — persists resource-usage samples and hourly rollups to
// worker.instance_usage_sample / worker.instance_usage_hourly (migration 003).
// Injectable factory mirroring workerSessionRepository.js (pool defaults to the
// shared worker pool; clock injectable for deterministic rollup/prune windows).
//
// mysql2 returns DECIMAL columns as strings — toNumber() normalizes on the way out.

import {getPool} from '../db.js'

const placeholders = count => Array(count).fill('?').join(', ')

const toNumber = value => value == null ? null : Number(value)

const HOUR_MS = 3600_000
const DAY_MS = 24 * HOUR_MS

const createUsageRepository = (pool = null, clock = () => new Date()) => {
    const resolvePool = () => pool ?? getPool()

    const insertSample = async sample => {
        const p = resolvePool()
        await p.query(
            `INSERT INTO instance_usage_sample(session_id, username, instance_type, sample_time,
                cpu_pct, ram_bytes, ram_pct, gpu_pct, gpu_ram_bytes, net_rx_bytes_per_s, net_tx_bytes_per_s)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sample.sessionId, sample.username, sample.instanceType, sample.sampleTime,
                sample.cpuPct, sample.ramBytes, sample.ramPct, sample.gpuPct, sample.gpuRamBytes,
                sample.netRxBytesPerS, sample.netTxBytesPerS,
            ]
        )
    }

    const latestForSessions = async sessionIds => {
        if (!sessionIds || !sessionIds.length) {
            return new Map()
        }
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT s.session_id, s.sample_time, s.cpu_pct, s.ram_pct, s.gpu_pct,
                s.net_rx_bytes_per_s + s.net_tx_bytes_per_s AS net_bytes_per_s
                FROM instance_usage_sample s
                JOIN (
                    SELECT session_id, MAX(sample_time) AS max_time
                    FROM instance_usage_sample
                    WHERE session_id IN (${placeholders(sessionIds.length)})
                    GROUP BY session_id
                ) m ON s.session_id = m.session_id AND s.sample_time = m.max_time`,
            sessionIds
        )
        return new Map(rows.map(row => [row.session_id, {
            cpuPct: toNumber(row.cpu_pct),
            ramPct: toNumber(row.ram_pct),
            gpuPct: toNumber(row.gpu_pct),
            netBytesPerS: toNumber(row.net_bytes_per_s),
            sampleTime: new Date(row.sample_time),
        }]))
    }

    // rollupHours — one INSERT…SELECT…ON DUPLICATE KEY UPDATE per whole hour in the window.
    // Re-running for an hour that already has rows just overwrites them with the same
    // aggregates (idempotent), which is what makes the 2-hour heal window safe.
    const rollupHours = async (hoursBack = 2) => {
        const p = resolvePool()
        const currentHourStart = Math.floor(clock().getTime() / HOUR_MS) * HOUR_MS
        for (let i = hoursBack; i >= 1; i--) {
            const hourStart = new Date(currentHourStart - i * HOUR_MS)
            const hourEnd = new Date(currentHourStart - (i - 1) * HOUR_MS)
            await p.query(
                `INSERT INTO instance_usage_hourly(session_id, username, instance_type, hour, sample_count,
                    cpu_avg, cpu_max, ram_avg, ram_max, gpu_avg, gpu_max, gpu_ram_max, net_avg_bytes_per_s)
                SELECT session_id, username, instance_type, ?, COUNT(*),
                    AVG(cpu_pct), MAX(cpu_pct), AVG(ram_pct), MAX(ram_pct),
                    AVG(gpu_pct), MAX(gpu_pct), MAX(gpu_ram_bytes),
                    AVG(COALESCE(net_rx_bytes_per_s, 0) + COALESCE(net_tx_bytes_per_s, 0))
                FROM instance_usage_sample
                WHERE sample_time >= ? AND sample_time < ?
                GROUP BY session_id, username, instance_type
                ON DUPLICATE KEY UPDATE
                    sample_count = VALUES(sample_count),
                    cpu_avg = VALUES(cpu_avg), cpu_max = VALUES(cpu_max),
                    ram_avg = VALUES(ram_avg), ram_max = VALUES(ram_max),
                    gpu_avg = VALUES(gpu_avg), gpu_max = VALUES(gpu_max),
                    gpu_ram_max = VALUES(gpu_ram_max),
                    net_avg_bytes_per_s = VALUES(net_avg_bytes_per_s)`,
                [hourStart, hourStart, hourEnd]
            )
        }
    }

    const pruneSamples = async retentionDays => {
        const p = resolvePool()
        const cutoff = new Date(clock().getTime() - retentionDays * DAY_MS)
        const [result] = await p.query(
            'DELETE FROM instance_usage_sample WHERE sample_time < ?', [cutoff])
        return result.affectedRows
    }

    const pruneHourly = async retentionDays => {
        const p = resolvePool()
        const cutoff = new Date(clock().getTime() - retentionDays * DAY_MS)
        const [result] = await p.query(
            'DELETE FROM instance_usage_hourly WHERE hour < ?', [cutoff])
        return result.affectedRows
    }

    // busyWindowStats — per-session aggregates over the busy-verdict window.
    // `samples` counts rows where cpu_pct was measured — the coverage denominator. Coverage below
    // the floor is NOT a verdict: the caller treats it as busy for a bounded number of ticks
    // (busyVerdict.js), because under a deadline missing data would otherwise close a computing
    // instance.
    const busyWindowStats = async (sessionIds, fromTime) => {
        if (!sessionIds || !sessionIds.length) {
            return new Map()
        }
        const p = resolvePool()
        const [rows] = await p.query(
            `SELECT session_id,
                COUNT(cpu_pct) AS samples,
                AVG(cpu_pct) AS cpu_avg,
                COUNT(gpu_pct) AS gpu_samples,
                AVG(gpu_pct) AS gpu_avg,
                AVG(COALESCE(net_rx_bytes_per_s, 0) + COALESCE(net_tx_bytes_per_s, 0)) AS net_avg
                FROM instance_usage_sample
                WHERE session_id IN (${placeholders(sessionIds.length)}) AND sample_time >= ?
                GROUP BY session_id`,
            [...sessionIds, fromTime]
        )
        return new Map(rows.map(row => [row.session_id, {
            samples: Number(row.samples),
            cpuAvg: toNumber(row.cpu_avg),
            gpuSamples: Number(row.gpu_samples),
            gpuAvg: toNumber(row.gpu_avg),
            netAvg: toNumber(row.net_avg),
        }]))
    }

    // userUsageRollup — per-instance-type aggregation of instance_usage_hourly for one user
    // (phase-4 admin usage report). Per-metric weighted sums with per-metric denominators:
    // a metric's weight only counts sample_counts of rows where that metric was measured,
    // which is what keeps GPU averages weighted over GPU-instance hours only.
    const userUsageRollup = async (username, fromTime) => {
        const p = resolvePool()
        const [rows] = await p.query(
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
                WHERE username = ? AND hour >= ?
                GROUP BY instance_type
                ORDER BY hours DESC`,
            [username, fromTime]
        )
        return rows.map(row => ({
            instanceType: row.instance_type,
            hours: Number(row.hours),
            cpuWeight: Number(row.cpu_weight ?? 0), cpuSum: Number(row.cpu_sum ?? 0), cpuMax: toNumber(row.cpu_max),
            ramWeight: Number(row.ram_weight ?? 0), ramSum: Number(row.ram_sum ?? 0), ramMax: toNumber(row.ram_max),
            gpuWeight: Number(row.gpu_weight ?? 0), gpuSum: Number(row.gpu_sum ?? 0), gpuMax: toNumber(row.gpu_max),
            netWeight: Number(row.net_weight ?? 0), netSum: Number(row.net_sum ?? 0),
        }))
    }

    return {busyWindowStats, insertSample, latestForSessions, rollupHours, pruneSamples, pruneHourly, userUsageRollup}
}

export {createUsageRepository}
