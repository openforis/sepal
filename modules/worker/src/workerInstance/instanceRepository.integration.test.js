// Integration tests for instanceRepository against a scratch MySQL schema.
//
// Requires MYSQL_PASSWORD in the environment (provided by docker-compose.yml). Under
// `sepal npm-test worker` the container receives MYSQL_HOST/USER/PASSWORD, so the suite runs.
//
// Uses createInstanceRepository(pool) — the injectable factory — to exercise PRODUCTION SQL
// against a transient `worker_test_<pid>` scratch schema. The live schemas are never touched.
//
// mysql2/promise is imported as a direct devDependency rather than via #sepal/db/mysql: that
// transitive import does not survive Jest's ESM VM linker when the sepal package is a symlink.
// The pool is injected into the production factory, so the production code still runs.

import mysql from 'mysql2/promise'

const {MYSQL_HOST = 'mysql', MYSQL_USER = 'root', MYSQL_PASSWORD} = process.env
const SCRATCH = `worker_test_${process.pid}`

// Credentials come from the module's docker-compose environment:
//   MYSQL_USER=root, MYSQL_HOST=mysql, MYSQL_PASSWORD=${MYSQL_ROOT_PASSWORD}
const hasCredentials = Boolean(MYSQL_PASSWORD)

const describeIf = (condition, ...args) =>
    condition ? describe(...args) : describe.skip(...args)

describeIf(hasCredentials, 'integration — scratch schema (requires MYSQL_PASSWORD)', () => {
    let repo
    let adminConn
    let scratchPool

    beforeAll(async () => {
        const {createInstanceRepository} = await import('./instanceRepository.js')

        // Admin connection for DDL (CREATE/DROP SCHEMA) — targets the `mysql` system DB
        adminConn = await mysql.createConnection({
            host: MYSQL_HOST,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: 'mysql',
            multipleStatements: true
        })
        await adminConn.query(`CREATE SCHEMA IF NOT EXISTS \`${SCRATCH}\``)
        await adminConn.query(`
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`instance\` (
                \`id\`          varchar(255) NOT NULL,
                \`type\`        varchar(63)  NOT NULL,
                \`worker_type\` varchar(63)  DEFAULT NULL,
                PRIMARY KEY (\`id\`),
                KEY \`idx_instance_1\` (\`type\`, \`worker_type\`) USING BTREE
            ) ENGINE=InnoDB DEFAULT CHARSET=latin1
        `)

        // Pool scoped to the scratch schema; injected into the PRODUCTION factory
        scratchPool = await mysql.createPool({
            host: MYSQL_HOST,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: SCRATCH,
            connectionLimit: 5
        })
        repo = createInstanceRepository(scratchPool)
    })

    afterAll(async () => {
        if (scratchPool) await scratchPool.end()
        if (adminConn) {
            await adminConn.query(`DROP SCHEMA IF EXISTS \`${SCRATCH}\``)
            await adminConn.end()
        }
    })

    afterEach(async () => {
        await scratchPool.query('DELETE FROM instance')
    })

    const getRow = async id => {
        const [rows] = await scratchPool.query(
            'SELECT id, type, worker_type FROM instance WHERE id = ?',
            [id]
        )
        return rows[0] || null
    }

    test('launched inserts row; idleInstances returns its id; worker_type is NULL', async () => {
        await repo.launched({id: 'i-100', type: 'm4.xlarge'})
        const row = await getRow('i-100')
        expect(row).toBeTruthy()
        expect(row.id).toBe('i-100')
        expect(row.type).toBe('m4.xlarge')
        expect(row.worker_type).toBeNull()

        const ids = await repo.idleInstances('m4.xlarge')
        expect(ids).toContain('i-100')
    })

    test('launched with reservation sets worker_type; excluded from idleInstances', async () => {
        await repo.launched({id: 'i-101', type: 'm4.xlarge', reservation: {workerType: 'SANDBOX'}})
        const row = await getRow('i-101')
        expect(row.worker_type).toBe('SANDBOX')
        const ids = await repo.idleInstances('m4.xlarge')
        expect(ids).not.toContain('i-101')
    })

    test('launched array inserts multiple rows', async () => {
        await repo.launched([
            {id: 'i-200', type: 'c5.xlarge'},
            {id: 'i-201', type: 'c5.xlarge'},
        ])
        const ids = await repo.idleInstances('c5.xlarge')
        expect(ids).toContain('i-200')
        expect(ids).toContain('i-201')
    })

    test('reserved returns true and sets worker_type', async () => {
        await repo.launched({id: 'i-300', type: 'm4.xlarge'})
        const result = await repo.reserved('i-300', 'SANDBOX')
        expect(result).toBe(true)
        const row = await getRow('i-300')
        expect(row.worker_type).toBe('SANDBOX')
        const ids = await repo.idleInstances('m4.xlarge')
        expect(ids).not.toContain('i-300')
    })

    test('reserved returns false on non-existent id', async () => {
        const result = await repo.reserved('no-such-id', 'SANDBOX')
        expect(result).toBe(false)
    })

    // Two concurrent reserved() calls against the same idle instance must result in exactly one
    // returning true. MySQL's row-level locking on the UPDATE guarantees this via
    // WHERE worker_type IS NULL (compare-and-swap semantics).

    test('race-safe: two concurrent reserved() calls — exactly one wins', async () => {
        await repo.launched({id: 'i-400', type: 'm4.xlarge'})

        const [r1, r2] = await Promise.all([
            repo.reserved('i-400', 'SANDBOX'),
            repo.reserved('i-400', 'TASK_EXECUTOR'),
        ])

        const wins = [r1, r2].filter(Boolean)
        expect(wins).toHaveLength(1)

        const row = await getRow('i-400')
        expect(['SANDBOX', 'TASK_EXECUTOR']).toContain(row.worker_type)
    })

    test('race-safe: second reserved() after first wins returns false', async () => {
        await repo.launched({id: 'i-401', type: 'm4.xlarge'})
        const first = await repo.reserved('i-401', 'SANDBOX')
        expect(first).toBe(true)

        const second = await repo.reserved('i-401', 'TASK_EXECUTOR')
        expect(second).toBe(false)

        const row = await getRow('i-401')
        expect(row.worker_type).toBe('SANDBOX')
    })

    test('released nulls worker_type; instance becomes idle again', async () => {
        await repo.launched({id: 'i-500', type: 'm4.xlarge', reservation: {workerType: 'SANDBOX'}})
        const ok = await repo.released('i-500')
        expect(ok).toBe(true)
        const row = await getRow('i-500')
        expect(row.worker_type).toBeNull()
        const ids = await repo.idleInstances('m4.xlarge')
        expect(ids).toContain('i-500')
    })

    test('released returns false for non-existent id', async () => {
        const ok = await repo.released('no-such-id')
        expect(ok).toBe(false)
    })

    test('double-release returns false (changedRows parity — Fix 1)', async () => {
        // Row exists; first release sets worker_type = NULL (changed → true).
        // Second release finds the row but worker_type is already NULL → changedRows=0 → false.
        // This is the race-condition sentinel used by ReleaseInstance to gate undeploy.
        await repo.launched({id: 'i-501', type: 'm4.xlarge', reservation: {workerType: 'SANDBOX'}})
        const first = await repo.released('i-501')
        expect(first).toBe(true)

        const second = await repo.released('i-501')
        expect(second).toBe(false)    // must be false — Java parity via changedRows
    })

    test('reconciled adopts unknown instances as idle, and only those', async () => {
        await repo.launched({id: 'i-800', type: 'm4.xlarge', reservation: {workerType: 'SANDBOX'}})

        const adopted = await repo.reconciled([
            {id: 'i-800', type: 'm4.xlarge'},
            {id: 'i-801', type: 'm4.xlarge'},
        ])

        expect(adopted).toBe(1)
        expect((await getRow('i-801')).worker_type).toBeNull()
        // INSERT IGNORE, never UPDATE: the existing row may have been reserved a microsecond ago.
        expect((await getRow('i-800')).worker_type).toBe('SANDBOX')
    })

    test('reconciled with nothing to adopt returns 0', async () => {
        expect(await repo.reconciled([])).toBe(0)
    })

    test('forgotten deletes idle rows not in knownIds, keeping reserved ones', async () => {
        await repo.launched({id: 'i-810', type: 'm4.xlarge'})
        await repo.launched({id: 'i-811', type: 'm4.xlarge'})
        await repo.launched({id: 'i-812', type: 'm4.xlarge', reservation: {workerType: 'SANDBOX'}})

        const dropped = await repo.forgotten(['i-810'])

        expect(dropped).toBe(1)
        expect(await getRow('i-810')).toBeTruthy()
        expect(await getRow('i-811')).toBeNull()
        // A reserved row survives even when the provider never reported the instance: dropping it
        // would make ReleaseInstance read its own release as a lost race and skip the undeploy.
        expect(await getRow('i-812')).toBeTruthy()
    })

    test('forgotten with an empty knownIds drops every idle row', async () => {
        await repo.launched({id: 'i-820', type: 'm4.xlarge'})
        await repo.launched({id: 'i-821', type: 'm4.xlarge', reservation: {workerType: 'SANDBOX'}})

        const dropped = await repo.forgotten([])

        expect(dropped).toBe(1)
        expect(await getRow('i-820')).toBeNull()
        expect(await getRow('i-821')).toBeTruthy()
    })

    test('terminated deletes the row', async () => {
        await repo.launched({id: 'i-600', type: 'm4.xlarge'})
        await repo.terminated('i-600')
        const row = await getRow('i-600')
        expect(row).toBeNull()
    })

    test('terminated on non-existent id does not throw', async () => {
        await expect(repo.terminated('no-such-id')).resolves.toBeUndefined()
    })

    test('idleInstances only returns ids for the requested type', async () => {
        await repo.launched({id: 'i-700', type: 'm4.xlarge'})
        await repo.launched({id: 'i-701', type: 'c5.xlarge'})
        const m4ids = await repo.idleInstances('m4.xlarge')
        expect(m4ids).toContain('i-700')
        expect(m4ids).not.toContain('i-701')
    })
})
