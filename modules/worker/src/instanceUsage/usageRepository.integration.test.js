// Integration tests for usageRepository against a scratch MySQL schema.
//
// Requires MYSQL_PASSWORD in the environment (provided by docker-compose.yml). Under
// `sepal npm-test worker` the container receives MYSQL_HOST/USER/PASSWORD, so the suite runs.
//
// Uses createUsageRepository(pool, clock) — the injectable factory — to exercise PRODUCTION SQL
// against a transient `worker_usage_test_<pid>` scratch schema whose DDL mirrors
// migrations/003.do.instance-usage.sql. The live schemas are never touched. mysql2/promise is
// imported directly for the same Jest ESM symlink reason documented in
// instanceRepository.integration.test.js.

import mysql from 'mysql2/promise'

const {MYSQL_HOST = 'mysql', MYSQL_USER = 'root', MYSQL_PASSWORD} = process.env
const SCRATCH = `worker_usage_test_${process.pid}`

const hasCredentials = Boolean(MYSQL_PASSWORD)

const describeIf = (condition, ...args) =>
    condition ? describe(...args) : describe.skip(...args)

describeIf(hasCredentials, 'integration — usageRepository (requires MYSQL_PASSWORD)', () => {
    let repo
    let adminConn
    let scratchPool
    // Fixed clock: 2026-08-01T10:05:00Z — makes rollup/prune windows deterministic.
    const NOW = new Date('2026-08-01T10:05:00Z')

    beforeAll(async () => {
        const {createUsageRepository} = await import('./usageRepository.js')
        adminConn = await mysql.createConnection({
            host: MYSQL_HOST, user: MYSQL_USER, password: MYSQL_PASSWORD,
            database: 'mysql', multipleStatements: true
        })
        await adminConn.query(`CREATE SCHEMA IF NOT EXISTS \`${SCRATCH}\``)
        // DDL mirrors migrations/003.do.instance-usage.sql (scratch-schema copy).
        await adminConn.query(`
            CREATE TABLE \`${SCRATCH}\`.\`instance_usage_sample\` (
                \`session_id\` varchar(255) NOT NULL,
                \`username\` varchar(255) NOT NULL,
                \`instance_type\` varchar(255) NOT NULL,
                \`sample_time\` timestamp NOT NULL,
                \`cpu_pct\` decimal(5,2) DEFAULT NULL,
                \`ram_bytes\` bigint DEFAULT NULL,
                \`ram_pct\` decimal(5,2) DEFAULT NULL,
                \`gpu_pct\` decimal(5,2) DEFAULT NULL,
                \`gpu_ram_bytes\` bigint DEFAULT NULL,
                \`net_rx_bytes_per_s\` bigint DEFAULT NULL,
                \`net_tx_bytes_per_s\` bigint DEFAULT NULL,
                PRIMARY KEY (\`session_id\`, \`sample_time\`),
                KEY \`i1\` (\`username\`, \`sample_time\`),
                KEY \`i2\` (\`sample_time\`)
            ) ENGINE=InnoDB`)
        await adminConn.query(`
            CREATE TABLE \`${SCRATCH}\`.\`instance_usage_hourly\` (
                \`session_id\` varchar(255) NOT NULL,
                \`username\` varchar(255) NOT NULL,
                \`instance_type\` varchar(255) NOT NULL,
                \`hour\` timestamp NOT NULL,
                \`sample_count\` int NOT NULL,
                \`cpu_avg\` decimal(5,2) DEFAULT NULL,
                \`cpu_max\` decimal(5,2) DEFAULT NULL,
                \`ram_avg\` decimal(5,2) DEFAULT NULL,
                \`ram_max\` decimal(5,2) DEFAULT NULL,
                \`gpu_avg\` decimal(5,2) DEFAULT NULL,
                \`gpu_max\` decimal(5,2) DEFAULT NULL,
                \`gpu_ram_max\` bigint DEFAULT NULL,
                \`net_avg_bytes_per_s\` bigint DEFAULT NULL,
                PRIMARY KEY (\`session_id\`, \`hour\`),
                KEY \`h1\` (\`username\`, \`hour\`),
                KEY \`h2\` (\`hour\`)
            ) ENGINE=InnoDB`)
        scratchPool = mysql.createPool({
            host: MYSQL_HOST, user: MYSQL_USER, password: MYSQL_PASSWORD,
            database: SCRATCH, connectionLimit: 2, timezone: 'Z'
        })
        repo = createUsageRepository(scratchPool, () => NOW)
    })

    afterAll(async () => {
        await scratchPool?.end()
        await adminConn?.query(`DROP SCHEMA IF EXISTS \`${SCRATCH}\``)
        await adminConn?.end()
    })

    beforeEach(async () => {
        await scratchPool.query('DELETE FROM instance_usage_sample')
        await scratchPool.query('DELETE FROM instance_usage_hourly')
    })

    const sample = overrides => ({
        sessionId: 's1', username: 'alice', instanceType: 'T3aSmall',
        sampleTime: new Date('2026-08-01T09:10:00Z'),
        cpuPct: 12.34, ramBytes: 1024, ramPct: 50, gpuPct: null, gpuRamBytes: null,
        netRxBytesPerS: 100, netTxBytesPerS: 200,
        ...overrides
    })

    it('insertSample + latestForSessions returns the newest sample per session', async () => {
        await repo.insertSample(sample({sampleTime: new Date('2026-08-01T09:10:00Z'), cpuPct: 10}))
        await repo.insertSample(sample({sampleTime: new Date('2026-08-01T09:11:00Z'), cpuPct: 20}))
        await repo.insertSample(sample({sessionId: 's2', cpuPct: 99}))
        const latest = await repo.latestForSessions(['s1', 's2'])
        expect(latest.get('s1').cpuPct).toBe(20)
        expect(typeof latest.get('s1').cpuPct).toBe('number') // DECIMAL must not come back as string
        expect(latest.get('s1').sampleTime).toEqual(new Date('2026-08-01T09:11:00Z'))
        expect(latest.get('s2').cpuPct).toBe(99)
    })

    // The report shows rx+tx summed, matching what the busy verdict thresholds. A sample with no
    // network counters at all (a first tick, or a container without a network) is null, not 0:
    // "not measured" and "measured as idle" are different claims.
    it('latestForSessions sums the network counters', async () => {
        await repo.insertSample(sample({netRxBytesPerS: 100, netTxBytesPerS: 200}))
        await repo.insertSample(sample({
            sessionId: 's2', netRxBytesPerS: null, netTxBytesPerS: null,
        }))
        const latest = await repo.latestForSessions(['s1', 's2'])
        expect(latest.get('s1').netBytesPerS).toBe(300)
        expect(latest.get('s2').netBytesPerS).toBeNull()
    })

    it('latestForSessions with empty input returns an empty Map without querying', async () => {
        expect((await repo.latestForSessions([])).size).toBe(0)
    })

    it('rollupHours aggregates the previous hours and is idempotent', async () => {
        // Two samples in the 09:00 hour (NOW is 10:05 → window covers 08:00 and 09:00).
        await repo.insertSample(sample({sampleTime: new Date('2026-08-01T09:10:00Z'), cpuPct: 10, gpuPct: 40}))
        await repo.insertSample(sample({sampleTime: new Date('2026-08-01T09:20:00Z'), cpuPct: 30, gpuPct: 60}))
        await repo.rollupHours(2)
        await repo.rollupHours(2) // idempotent — upsert, no duplicate-key error
        const [rows] = await scratchPool.query('SELECT * FROM instance_usage_hourly')
        expect(rows).toHaveLength(1)
        expect(rows[0].session_id).toBe('s1')
        expect(new Date(rows[0].hour)).toEqual(new Date('2026-08-01T09:00:00Z'))
        expect(rows[0].sample_count).toBe(2)
        expect(Number(rows[0].cpu_avg)).toBe(20)
        expect(Number(rows[0].cpu_max)).toBe(30)
        expect(Number(rows[0].gpu_max)).toBe(60)
        expect(Number(rows[0].net_avg_bytes_per_s)).toBe(300) // rx+tx
    })

    const hourly = overrides => ({
        sessionId: 'h1', username: 'alice', instanceType: 'T3aSmall',
        hour: new Date('2026-08-01T08:00:00Z'), sampleCount: 60,
        cpuAvg: 10, cpuMax: 50, ramAvg: 20, ramMax: 40,
        gpuAvg: null, gpuMax: null, gpuRamMax: null, netAvg: 1000,
        ...overrides
    })

    const insertHourly = async row =>
        await scratchPool.query(
            `INSERT INTO instance_usage_hourly(session_id, username, instance_type, hour, sample_count,
                cpu_avg, cpu_max, ram_avg, ram_max, gpu_avg, gpu_max, gpu_ram_max, net_avg_bytes_per_s)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [row.sessionId, row.username, row.instanceType, row.hour, row.sampleCount,
                row.cpuAvg, row.cpuMax, row.ramAvg, row.ramMax, row.gpuAvg, row.gpuMax,
                row.gpuRamMax, row.netAvg])

    it('userUsageRollup weights by sample_count with per-metric denominators', async () => {
        // 60-sample hour at cpu 10 + 30-sample hour at cpu 40 → weighted avg (600+1200)/90 = 20.
        await insertHourly(hourly({hour: new Date('2026-08-01T08:00:00Z'), sampleCount: 60, cpuAvg: 10, cpuMax: 30}))
        await insertHourly(hourly({sessionId: 'h2', hour: new Date('2026-08-01T09:00:00Z'), sampleCount: 30, cpuAvg: 40, cpuMax: 90}))
        // GPU measured only in the second hour → gpuWeight must be 30, not 90.
        await insertHourly(hourly({sessionId: 'g1', instanceType: 'G5Xlarge', hour: new Date('2026-08-01T08:00:00Z'), sampleCount: 60, gpuAvg: null}))
        await insertHourly(hourly({sessionId: 'g1', instanceType: 'G5Xlarge', hour: new Date('2026-08-01T09:00:00Z'), sampleCount: 30, gpuAvg: 80, gpuMax: 100}))
        // Outside the window → excluded.
        await insertHourly(hourly({sessionId: 'old', hour: new Date('2026-06-01T00:00:00Z'), cpuAvg: 99}))
        // Other user → excluded.
        await insertHourly(hourly({sessionId: 'x', username: 'bob', hour: new Date('2026-08-01T09:00:00Z')}))

        const rows = await repo.userUsageRollup('alice', new Date('2026-07-02T00:00:00Z'))
        expect(rows).toHaveLength(2)
        const t3 = rows.find(({instanceType}) => instanceType === 'T3aSmall')
        expect(t3.hours).toBe(2)
        expect(t3.cpuWeight).toBe(90)
        expect(t3.cpuSum).toBe(60 * 10 + 30 * 40)
        expect(t3.cpuMax).toBe(90)
        const g5 = rows.find(({instanceType}) => instanceType === 'G5Xlarge')
        expect(g5.hours).toBe(2)
        expect(g5.gpuWeight).toBe(30)
        expect(g5.gpuSum).toBe(30 * 80)
        expect(g5.gpuMax).toBe(100)
    })

    it('userUsageRollup returns [] for a user without data', async () => {
        expect(await repo.userUsageRollup('nobody', new Date('2026-07-02T00:00:00Z'))).toEqual([])
    })

    it('busyWindowStats aggregates the window per session', async () => {
        await repo.insertSample(sample({sampleTime: new Date('2026-08-01T09:40:00Z'), cpuPct: 2, gpuPct: 1, netRxBytesPerS: 100, netTxBytesPerS: 50}))
        await repo.insertSample(sample({sampleTime: new Date('2026-08-01T09:41:00Z'), cpuPct: 4, gpuPct: 3, netRxBytesPerS: 300, netTxBytesPerS: 150}))
        await repo.insertSample(sample({sampleTime: new Date('2026-08-01T09:00:00Z'), cpuPct: 99})) // before window
        await repo.insertSample(sample({sessionId: 'noCpu', sampleTime: new Date('2026-08-01T09:41:00Z'), cpuPct: null}))
        const stats = await repo.busyWindowStats(['s1', 'noCpu'], new Date('2026-08-01T09:35:00Z'))
        expect(stats.get('s1')).toEqual({samples: 2, cpuAvg: 3, gpuSamples: 2, gpuAvg: 2, netAvg: 300})
        expect(stats.get('noCpu').samples).toBe(0)
    })

    it('busyWindowStats with empty input returns an empty Map', async () => {
        expect((await repo.busyWindowStats([], new Date())).size).toBe(0)
    })

    it('pruneSamples deletes only rows older than retention', async () => {
        await repo.insertSample(sample({sampleTime: new Date('2026-06-01T00:00:00Z')})) // 61 days old
        await repo.insertSample(sample({sampleTime: new Date('2026-07-31T00:00:00Z')})) // 1 day old
        const deleted = await repo.pruneSamples(30)
        expect(deleted).toBe(1)
        const [rows] = await scratchPool.query('SELECT * FROM instance_usage_sample')
        expect(rows).toHaveLength(1)
    })
})
