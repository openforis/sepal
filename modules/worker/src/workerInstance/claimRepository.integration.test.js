// Integration tests for claimRepository against a scratch MySQL schema.
//
// Requires MYSQL_PASSWORD in the environment (provided by docker-compose.yml). Under
// `sepal npm-test worker` the container receives MYSQL_HOST/USER/PASSWORD, so the suite runs.
//
// The concurrency test is the point of this file: the claim is the allocation arbiter, and a
// mock cannot show that two simultaneous claims for one instance produce exactly one winner.
//
// mysql2/promise is imported as a direct devDependency rather than via #sepal/db/mysql: that
// transitive import does not survive Jest's ESM VM linker when the sepal package is a symlink.

import mysql from 'mysql2/promise'

const {MYSQL_HOST = 'mysql', MYSQL_USER = 'root', MYSQL_PASSWORD} = process.env
const SCRATCH = `worker_test_claim_${process.pid}`

const hasCredentials = Boolean(MYSQL_PASSWORD)

const describeIf = (condition, ...args) =>
    condition ? describe(...args) : describe.skip(...args)

describeIf(hasCredentials, 'integration — scratch schema (requires MYSQL_PASSWORD)', () => {
    let repo
    let adminConn
    let scratchPool

    beforeAll(async () => {
        const {createClaimRepository} = await import('./claimRepository.js')

        adminConn = await mysql.createConnection({
            host: MYSQL_HOST,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: 'mysql',
            multipleStatements: true
        })
        await adminConn.query(`CREATE SCHEMA IF NOT EXISTS \`${SCRATCH}\``)
        await adminConn.query(`
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`instance_claim\` (
                \`instance_id\` varchar(255) NOT NULL,
                \`session_id\`  varchar(36)  NOT NULL,
                \`claimed_at\`  timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (\`instance_id\`),
                KEY \`idx_instance_claim_1\` (\`claimed_at\`)
            ) ENGINE=InnoDB
        `)

        scratchPool = await mysql.createPool({
            host: MYSQL_HOST,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: SCRATCH,
            connectionLimit: 5
        })
        repo = createClaimRepository(scratchPool)
    })

    afterAll(async () => {
        if (scratchPool) await scratchPool.end()
        if (adminConn) {
            await adminConn.query(`DROP SCHEMA IF EXISTS \`${SCRATCH}\``)
            await adminConn.end()
        }
    })

    afterEach(async () => {
        await scratchPool.query('DELETE FROM instance_claim')
    })

    test('claim wins once, then loses on the same instance', async () => {
        expect(await repo.claim('i-100', 's-a')).toBe(true)
        expect(await repo.claim('i-100', 's-b')).toBe(false)
    })

    // The multi-process-safety requirement: separate pool connections, one winner.
    test('two concurrent claims for one instance produce exactly one winner', async () => {
        const results = await Promise.all([
            repo.claim('i-200', 's-a'),
            repo.claim('i-200', 's-b'),
        ])
        expect(results.filter(Boolean)).toHaveLength(1)
    })

    test('release frees the instance for a later claim', async () => {
        await repo.claim('i-300', 's-a')
        expect(await repo.release('i-300')).toBe(true)
        expect(await repo.release('i-300')).toBe(false)
        expect(await repo.claim('i-300', 's-b')).toBe(true)
    })

    test('all returns every claim with a Date claimedAt', async () => {
        await repo.claim('i-400', 's-a')
        const [claim] = await repo.all()
        expect(claim.instanceId).toBe('i-400')
        expect(claim.sessionId).toBe('s-a')
        expect(claim.claimedAt).toBeInstanceOf(Date)
    })
})
