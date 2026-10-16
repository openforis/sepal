import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, before, beforeEach, describe, test} from 'node:test'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {UsageRepository} from './usageRepository.js'

// The clock is pinned, so the rollup and retention windows are exact. Hourly rows are written directly
// only for hours the rollup can no longer reach — it heals the last few hours and nothing older.

describe('UsageRepository', () => {
    let testDb
    let repository

    before(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'worker_usage', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new UsageRepository(testDb.db, () => NOW)
    })

    after(() => testDb?.remove())

    describe('latestForSessions', () => {
        test('reports the newest sample of each session', async () => {
            await repository.insertSample(aSample({sampleTime: at('09:10'), cpuPct: 10}))
            await repository.insertSample(aSample({sampleTime: at('09:11'), cpuPct: 20}))
            await repository.insertSample(aSample({sessionId: ANOTHER_SESSION_ID, cpuPct: 99}))

            const latest = await repository.latestForSessions([SESSION_ID, ANOTHER_SESSION_ID])

            assert.equal(latest.get(SESSION_ID).cpuPct, 20)
            assert.deepEqual(latest.get(SESSION_ID).sampleTime, at('09:11'))
            assert.equal(latest.get(ANOTHER_SESSION_ID).cpuPct, 99)
        })

        // The report shows rx+tx summed, matching what the busy verdict thresholds. A sample with no
        // network counters at all (a first tick, or a container without a network) is null, not 0:
        // "not measured" and "measured as idle" are different claims.
        test('sums the network counters, and reports nothing when neither was measured', async () => {
            await repository.insertSample(aSample({netRxBytesPerS: 100, netTxBytesPerS: 200}))
            await repository.insertSample(aSample({
                sessionId: ANOTHER_SESSION_ID, netRxBytesPerS: null, netTxBytesPerS: null,
            }))

            const latest = await repository.latestForSessions([SESSION_ID, ANOTHER_SESSION_ID])

            assert.equal(latest.get(SESSION_ID).netBytesPerS, 300)
            assert.equal(latest.get(ANOTHER_SESSION_ID).netBytesPerS, null)
        })

        test('reports nothing for no sessions at all', async () => {
            const latest = await repository.latestForSessions([])

            assert.equal(latest.size, 0)
        })
    })

    describe('rollupHours', () => {
        test('aggregates each whole hour in the window, and rerunning it changes nothing', async () => {
            await repository.insertSample(aSample({sampleTime: at('09:10'), cpuPct: 10, gpuPct: 40}))
            await repository.insertSample(aSample({sampleTime: at('09:20'), cpuPct: 30, gpuPct: 60}))

            await repository.rollupHours(2)
            await repository.rollupHours(2)

            const rows = await storedHourlyRows()
            assert.equal(rows.length, 1)
            assert.equal(rows[0].session_id, SESSION_ID)
            assert.deepEqual(new Date(rows[0].hour), at('09:00'))
            assert.equal(rows[0].sample_count, 2)
            assert.equal(Number(rows[0].cpu_avg), 20)
            assert.equal(Number(rows[0].cpu_max), 30)
            assert.equal(Number(rows[0].gpu_max), 60)
            assert.equal(Number(rows[0].net_avg_bytes_per_s), 300)
        })

        test('leaves out samples from outside the window it heals', async () => {
            await repository.insertSample(aSample({sampleTime: at('09:10')}))
            await repository.insertSample(aSample({sampleTime: at('06:10')}))

            await repository.rollupHours(2)

            const rows = await storedHourlyRows()
            assert.deepEqual(
                rows.map(row => new Date(row.hour).toISOString()),
                [at('09:00').toISOString()]
            )
        })
    })

    describe('userUsageRollup', () => {
        // Weighted by sample_count, with a denominator per metric: a GPU average must be weighted over
        // the GPU hours alone, not over every hour the user ran. Two samples in one hour against one in
        // the next is enough to tell a weighted sum from a plain one.
        test('weights each metric over the hours in which it was measured', async () => {
            await repository.insertSample(aSample({sampleTime: at('08:10'), cpuPct: 10}))
            await repository.insertSample(aSample({sampleTime: at('08:20'), cpuPct: 10}))
            await repository.insertSample(aSample({sampleTime: at('09:10'), cpuPct: 40}))
            await repository.insertSample(gpuSample({sampleTime: at('08:10'), gpuPct: null}))
            await repository.insertSample(gpuSample({sampleTime: at('08:20'), gpuPct: null}))
            await repository.insertSample(gpuSample({sampleTime: at('09:10'), gpuPct: 80}))
            await repository.rollupHours(2)

            const rollup = await repository.userUsageRollup(USERNAME, FROM_TIME)

            const cpuOnly = rollup.find(({instanceType}) => instanceType === INSTANCE_TYPE)
            const withGpu = rollup.find(({instanceType}) => instanceType === GPU_INSTANCE_TYPE)
            assert.equal(cpuOnly.hours, 2)
            assert.equal(cpuOnly.cpuWeight, 3)
            assert.equal(cpuOnly.cpuSum, 2 * 10 + 1 * 40)
            assert.equal(cpuOnly.cpuMax, 40)
            assert.equal(withGpu.hours, 2)
            assert.equal(withGpu.gpuWeight, 1)
            assert.equal(withGpu.gpuSum, 1 * 80)
            assert.equal(withGpu.gpuMax, 80)
        })

        test('leaves out hours before the window and hours of other users', async () => {
            await givenRolledUpHour({hour: at('09:00')})
            await givenRolledUpHour({sessionId: 'old', hour: new Date('2026-06-01T00:00:00Z')})
            await givenRolledUpHour({sessionId: 'x', username: ANOTHER_USERNAME, hour: at('09:00')})

            const rollup = await repository.userUsageRollup(USERNAME, FROM_TIME)

            assert.equal(rollup.length, 1)
            assert.partialDeepStrictEqual(rollup, [{instanceType: INSTANCE_TYPE, hours: 1}])
        })

        test('reports nothing for a user with no recorded hours', async () => {
            const rollup = await repository.userUsageRollup('nobody', FROM_TIME)

            assert.deepEqual(rollup, [])
        })
    })

    describe('busyWindowStats', () => {
        // `samples` counts the rows where cpu was actually measured — the coverage denominator the
        // busy verdict needs to tell "idle" from "not measured".
        test('aggregates each session over the window, counting only measured samples', async () => {
            await repository.insertSample(aSample({
                sampleTime: at('09:40'), cpuPct: 2, gpuPct: 1, netRxBytesPerS: 100, netTxBytesPerS: 50
            }))
            await repository.insertSample(aSample({
                sampleTime: at('09:41'), cpuPct: 4, gpuPct: 3, netRxBytesPerS: 300, netTxBytesPerS: 150
            }))
            await repository.insertSample(aSample({sampleTime: at('09:00'), cpuPct: 99}))
            await repository.insertSample(aSample({
                sessionId: ANOTHER_SESSION_ID, sampleTime: at('09:41'), cpuPct: null
            }))

            const stats = await repository.busyWindowStats([SESSION_ID, ANOTHER_SESSION_ID], at('09:35'))

            assert.deepEqual(
                stats.get(SESSION_ID),
                {samples: 2, cpuAvg: 3, gpuSamples: 2, gpuAvg: 2, netAvg: 300}
            )
            assert.equal(stats.get(ANOTHER_SESSION_ID).samples, 0)
        })

        test('reports nothing for no sessions at all', async () => {
            const stats = await repository.busyWindowStats([], NOW)

            assert.equal(stats.size, 0)
        })
    })

    describe('pruneSamples', () => {
        test('removes only the samples older than the retention it is given', async () => {
            await repository.insertSample(aSample({sampleTime: new Date('2026-06-01T00:00:00Z')}))
            await repository.insertSample(aSample({sampleTime: new Date('2026-07-31T00:00:00Z')}))

            const deleted = await repository.pruneSamples(30)

            const latest = await repository.latestForSessions([SESSION_ID])
            assert.equal(deleted, 1)
            assert.deepEqual(latest.get(SESSION_ID).sampleTime, new Date('2026-07-31T00:00:00Z'))
        })
    })

    describe('pruneHourly', () => {
        test('removes only the hours older than the retention it is given', async () => {
            await givenRolledUpHour({hour: new Date('2025-06-01T00:00:00Z')})
            await givenRolledUpHour({sessionId: 'recent', hour: at('09:00')})

            const deleted = await repository.pruneHourly(365)

            const rows = await storedHourlyRows()
            assert.equal(deleted, 1)
            assert.deepEqual(rows.map(({session_id}) => session_id), ['recent'])
        })
    })

    // Hours the rollup already completed and will never revisit: it only ever heals the last few hours,
    // so an hour from months ago cannot be produced through it.
    const givenRolledUpHour = async over => {
        const row = {
            sessionId: 'h1', username: USERNAME, instanceType: INSTANCE_TYPE, sampleCount: 60,
            cpuAvg: 10, cpuMax: 50, ramAvg: 20, ramMax: 40,
            gpuAvg: null, gpuMax: null, gpuRamMax: null, netAvg: 1000, ...over,
        }
        await testDb.query(
            `INSERT INTO instance_usage_hourly(session_id, username, instance_type, hour, sample_count,
                cpu_avg, cpu_max, ram_avg, ram_max, gpu_avg, gpu_max, gpu_ram_max, net_avg_bytes_per_s)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [row.sessionId, row.username, row.instanceType, row.hour, row.sampleCount,
                row.cpuAvg, row.cpuMax, row.ramAvg, row.ramMax, row.gpuAvg, row.gpuMax,
                row.gpuRamMax, row.netAvg]
        )
    }

    // The rollup writes columns no read returns whole — the counts and maxima the admin report is built
    // from — so they are read back directly.
    const storedHourlyRows = async () => {
        const [rows] = await testDb.query('SELECT * FROM instance_usage_hourly ORDER BY hour')
        return rows
    }

    const gpuSample = (over = {}) =>
        aSample({sessionId: GPU_SESSION_ID, instanceType: GPU_INSTANCE_TYPE, ...over})

    const aSample = (over = {}) => ({
        sessionId: SESSION_ID, username: USERNAME, instanceType: INSTANCE_TYPE,
        sampleTime: at('09:10'),
        cpuPct: 12.34, ramBytes: 1024, ramPct: 50, gpuPct: null, gpuRamBytes: null,
        netRxBytesPerS: 100, netTxBytesPerS: 200, ...over,
    })

    const at = hourMinute => new Date(`2026-08-01T${hourMinute}:00Z`)

    // 2026-08-01T10:05:00Z — the rollup's two-hour heal window then covers 08:00 and 09:00.
    const NOW = new Date('2026-08-01T10:05:00Z')
    const FROM_TIME = new Date('2026-07-02T00:00:00Z')
    const SESSION_ID = 's1'
    const GPU_SESSION_ID = 'g1'
    const ANOTHER_SESSION_ID = 's2'
    const USERNAME = 'alice'
    const ANOTHER_USERNAME = 'bob'
    const INSTANCE_TYPE = 'T3aSmall'
    const GPU_INSTANCE_TYPE = 'G5Xlarge'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../../migrations')
})
