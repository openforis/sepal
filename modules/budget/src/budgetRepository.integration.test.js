import mysql from 'mysql2/promise'

const {MYSQL_HOST = 'mysql', MYSQL_USER = 'root', MYSQL_PASSWORD} = process.env
const SCRATCH = `budget_test_${process.pid}`
const hasCredentials = Boolean(MYSQL_PASSWORD)

const describeIf = (condition, ...args) =>
    condition ? describe(...args) : describe.skip(...args)

describeIf(hasCredentials, 'integration — budget scratch schema (requires MYSQL_PASSWORD)', () => {
    let createBudgetRepository
    let dto
    let adminConn
    let scratchPool
    let clockNow // mutable; the injected clock returns this

    const clock = () => clockNow
    const makeRepo = () => createBudgetRepository(scratchPool, clock)

    beforeAll(async () => {
        ({createBudgetRepository} = await import('./budgetRepository.js'))
        dto = await import('./dto.js')

        adminConn = await mysql.createConnection({
            host: MYSQL_HOST,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: 'mysql',
            multipleStatements: true
        })
        await adminConn.query(`CREATE SCHEMA IF NOT EXISTS \`${SCRATCH}\``)
        await adminConn.query(`
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`open_session_use\` (
                \`session_id\`    varchar(255) NOT NULL,
                \`username\`      varchar(255) NOT NULL,
                \`instance_type\` varchar(255) NOT NULL,
                \`from_time\`     timestamp    NOT NULL,
                \`to_time\`       timestamp    NULL DEFAULT NULL,
                PRIMARY KEY (\`session_id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`user_budget\` (
                \`username\`         varchar(255) NOT NULL,
                \`monthly_instance\` int(11)      NOT NULL,
                \`monthly_storage\`  int(11)      NOT NULL,
                \`storage_quota\`    int(11)      NOT NULL,
                PRIMARY KEY (\`username\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`default_user_budget\` (
                \`monthly_instance\` int(11) NOT NULL,
                \`monthly_storage\`  int(11) NOT NULL,
                \`storage_quota\`    int(11) NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`user_monthly_storage\` (
                \`username\`     varchar(255) NOT NULL,
                \`year\`         int(11)      NOT NULL,
                \`month\`        int(11)      NOT NULL,
                \`gb_hours\`     double       NOT NULL,
                \`storage_used\` double       NOT NULL,
                \`update_time\`  timestamp    NOT NULL,
                PRIMARY KEY (\`username\`, \`year\`, \`month\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`user_spending\` (
                \`username\`          varchar(255) NOT NULL,
                \`instance_spending\` double NOT NULL DEFAULT '0',
                \`storage_spending\`  double NOT NULL DEFAULT '0',
                \`storage_usage\`     double NOT NULL DEFAULT '0',
                PRIMARY KEY (\`username\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`budget_update_request\` (
                \`id\`                         varchar(255) NOT NULL,
                \`username\`                   varchar(255) NOT NULL,
                \`state\`                      varchar(255) NOT NULL,
                \`message\`                    text NOT NULL,
                \`initial_monthly_instance\`   int(11) NOT NULL,
                \`initial_monthly_storage\`    int(11) NOT NULL,
                \`initial_storage_quota\`      int(11) NOT NULL,
                \`requested_monthly_instance\` int(11) NOT NULL,
                \`requested_monthly_storage\`  int(11) NOT NULL,
                \`requested_storage_quota\`    int(11) NOT NULL,
                \`final_monthly_instance\`     int(11) DEFAULT NULL,
                \`final_monthly_storage\`      int(11) DEFAULT NULL,
                \`final_storage_quota\`        int(11) DEFAULT NULL,
                \`creation_time\`              timestamp NOT NULL,
                \`update_time\`                timestamp NOT NULL,
                PRIMARY KEY (\`id\`),
                KEY \`idx_bur_1\` (\`username\`, \`state\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=latin1;
        `)

        scratchPool = await mysql.createPool({
            host: MYSQL_HOST,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: SCRATCH,
            connectionLimit: 5,
            timezone: 'Z' // read/write timestamps as UTC so Date comparisons are stable
        })
    })

    afterAll(async () => {
        if (scratchPool) await scratchPool.end()
        if (adminConn) {
            await adminConn.query(`DROP SCHEMA IF EXISTS \`${SCRATCH}\``)
            await adminConn.end()
        }
    })

    beforeEach(() => {
        clockNow = new Date('2026-06-15T12:00:00Z')
    })

    afterEach(async () => {
        await scratchPool.query('DELETE FROM open_session_use')
        await scratchPool.query('DELETE FROM user_budget')
        await scratchPool.query('DELETE FROM default_user_budget')
        await scratchPool.query('DELETE FROM user_monthly_storage')
        await scratchPool.query('DELETE FROM user_spending')
        await scratchPool.query('DELETE FROM budget_update_request')
    })

    const insertOpenSessionUse = (sessionId, {username = 'alice', instanceType = 't2.small', fromTime, toTime = null}) =>
        scratchPool.query(
            `INSERT INTO open_session_use(session_id, username, instance_type, from_time, to_time)
                VALUES(?, ?, ?, ?, ?)`,
            [sessionId, username, instanceType, fromTime, toTime]
        )

    describe('userBudget', () => {
        test('falls back to default_user_budget when no per-user row', async () => {
            await scratchPool.query(
                'INSERT INTO default_user_budget(monthly_instance, monthly_storage, storage_quota) VALUES(?, ?, ?)',
                [1, 20, 30]
            )
            expect(await makeRepo().userBudget('alice')).toEqual({
                instanceSpending: 1, storageSpending: 20, storageQuota: 30,
            })
        })

        test('per-user row wins over default', async () => {
            await scratchPool.query(
                'INSERT INTO default_user_budget(monthly_instance, monthly_storage, storage_quota) VALUES(?, ?, ?)',
                [1, 20, 30]
            )
            await scratchPool.query(
                'INSERT INTO user_budget(username, monthly_instance, monthly_storage, storage_quota) VALUES(?, ?, ?, ?)',
                ['alice', 5, 50, 500]
            )
            expect(await makeRepo().userBudget('alice')).toEqual({
                instanceSpending: 5, storageSpending: 50, storageQuota: 500,
            })
        })
    })

    describe('userInstanceUses', () => {
        test('closed row → to = to_time; open row (to_time NULL) → to = now (clock)', async () => {
            await insertOpenSessionUse('closed', {
                fromTime: new Date('2026-06-02T00:00:00Z'), toTime: new Date('2026-06-03T00:00:00Z')})
            await insertOpenSessionUse('open', {
                fromTime: new Date('2026-06-04T00:00:00Z')})
            const uses = await makeRepo().userInstanceUses('alice', 2026, 6)
            const closed = uses.find(u => u.from.getTime() === new Date('2026-06-02T00:00:00Z').getTime())
            const open = uses.find(u => u.from.getTime() === new Date('2026-06-04T00:00:00Z').getTime())
            expect(closed.to.getTime()).toBe(new Date('2026-06-03T00:00:00Z').getTime())
            expect(open.to.getTime()).toBe(clockNow.getTime())
        })

        test('returns only the rows overlapping the requested month', async () => {
            const may = new Date('2026-05-10T00:00:00Z')
            const june = new Date('2026-06-10T00:00:00Z')
            const spanning = new Date('2026-05-28T00:00:00Z')
            await insertOpenSessionUse('may', {fromTime: may, toTime: new Date('2026-05-11T00:00:00Z')})
            await insertOpenSessionUse('june', {fromTime: june, toTime: new Date('2026-06-11T00:00:00Z')})
            await insertOpenSessionUse('spanning', {fromTime: spanning, toTime: new Date('2026-06-02T00:00:00Z')})

            const fromTimes = async (year, month) =>
                (await makeRepo().userInstanceUses('alice', year, month))
                    .map(use => use.from.toISOString()).sort()

            expect(await fromTimes(2026, 5)).toEqual([may, spanning].map(d => d.toISOString()).sort())
            expect(await fromTimes(2026, 6)).toEqual([june, spanning].map(d => d.toISOString()).sort())
            expect(await fromTimes(2026, 4)).toEqual([])
            expect(await fromTimes(2026, 12)).toEqual([])
        })

        test('an open row (to_time NULL) counts from its start month onwards', async () => {
            await insertOpenSessionUse('open', {fromTime: new Date('2026-05-10T00:00:00Z')})
            expect(await makeRepo().userInstanceUses('alice', 2026, 4)).toHaveLength(0)
            expect(await makeRepo().userInstanceUses('alice', 2026, 5)).toHaveLength(1)
            expect(await makeRepo().userInstanceUses('alice', 2026, 6)).toHaveLength(1)
        })

        test('filters by username', async () => {
            await insertOpenSessionUse('a', {username: 'alice',
                fromTime: new Date('2026-06-01T00:00:00Z'), toTime: new Date('2026-06-02T00:00:00Z')})
            await insertOpenSessionUse('b', {username: 'bob',
                fromTime: new Date('2026-06-01T00:00:00Z'), toTime: new Date('2026-06-02T00:00:00Z')})
            const uses = await makeRepo().userInstanceUses('alice', 2026, 6)
            expect(uses).toHaveLength(1)
            expect(uses[0].instanceType).toBe('t2.small')
        })
    })

    describe('user_monthly_storage', () => {
        test('userStorageUse no-row default: gbHours 0, gb 0, updateTime now', async () => {
            const s = await makeRepo().userStorageUse('alice', 2026, 6)
            expect(s.gbHours).toBe(0)
            expect(s.gb).toBe(0)
            expect(s.updateTime.getTime()).toBe(clockNow.getTime())
        })

        test('updateUserStorageUse INSERTs then UPDATEs (year/month from updateTime)', async () => {
            const repo = makeRepo()
            const t1 = new Date('2026-06-10T00:00:00Z')
            await repo.updateUserStorageUse('alice', dto.storageUse({gbHours: 12, gb: 3, updateTime: t1}))
            let s = await repo.userStorageUse('alice', 2026, 6)
            expect(s.gbHours).toBe(12)
            expect(s.gb).toBe(3)
            const t2 = new Date('2026-06-20T00:00:00Z')
            await repo.updateUserStorageUse('alice', dto.storageUse({gbHours: 30, gb: 5, updateTime: t2}))
            s = await repo.userStorageUse('alice', 2026, 6)
            expect(s.gbHours).toBe(30)
            expect(s.gb).toBe(5)
            expect(s.updateTime.getTime()).toBe(t2.getTime())
            const [rows] = await scratchPool.query('SELECT COUNT(*) c FROM user_monthly_storage')
            expect(rows[0].c).toBe(1)
        })

        test('lastUserStorageUse returns the latest year/month row', async () => {
            const repo = makeRepo()
            await repo.updateUserStorageUse('alice', dto.storageUse({gbHours: 1, gb: 1, updateTime: new Date('2026-05-10T00:00:00Z')}))
            await repo.updateUserStorageUse('alice', dto.storageUse({gbHours: 2, gb: 2, updateTime: new Date('2026-06-10T00:00:00Z')}))
            const s = await repo.lastUserStorageUse('alice')
            expect(s.gbHours).toBe(2)
        })
    })

    describe('user_spending', () => {
        const report = entry => dto.userSpendingReport({
            username: entry.username, instanceSpending: entry.instanceSpending,
            storageSpending: entry.storageSpending, storageUsage: entry.storageUsage,
            instanceBudget: 0, storageBudget: 0, storageQuota: 0, costPerGbMonth: 0,
            budgetUpdateRequest: null,
        })

        test('saveSpendingReport DELETEs all + batch INSERTs the map', async () => {
            const repo = makeRepo()
            await scratchPool.query('INSERT INTO user_spending(username) VALUES(?)', ['stale'])
            await repo.saveSpendingReport({
                alice: report({username: 'alice', instanceSpending: 1, storageSpending: 2, storageUsage: 3}),
                bob: report({username: 'bob', instanceSpending: 4, storageSpending: 5, storageUsage: 6}),
            })
            const [rows] = await scratchPool.query('SELECT * FROM user_spending ORDER BY username')
            expect(rows.map(r => r.username)).toEqual(['alice', 'bob'])
            expect(rows[0].instance_spending).toBe(1)
            expect(rows[1].storage_usage).toBe(6)
        })

        test('updateSpendingReport UPDATEs an existing row only (no insert)', async () => {
            const repo = makeRepo()
            await scratchPool.query(
                'INSERT INTO user_spending(username, instance_spending, storage_spending, storage_usage) VALUES(?, 0, 0, 0)',
                ['alice']
            )
            await repo.updateSpendingReport('alice', report({username: 'alice', instanceSpending: 9, storageSpending: 8, storageUsage: 7}))
            const [rows] = await scratchPool.query('SELECT * FROM user_spending')
            expect(rows[0].instance_spending).toBe(9)
            expect(rows[0].storage_usage).toBe(7)
            await repo.updateSpendingReport('ghost', report({username: 'ghost', instanceSpending: 1, storageSpending: 1, storageUsage: 1}))
            const [count] = await scratchPool.query('SELECT COUNT(*) c FROM user_spending')
            expect(count[0].c).toBe(1)
        })
    })

    describe('budget_update_request', () => {
        const budget = b => dto.budget(b)

        test('requestBudgetUpdate INSERT captures initial_* from current budget', async () => {
            const repo = makeRepo()
            await scratchPool.query(
                'INSERT INTO user_budget(username, monthly_instance, monthly_storage, storage_quota) VALUES(?, ?, ?, ?)',
                ['alice', 5, 50, 500]
            )
            await repo.requestBudgetUpdate('alice', 'please more',
                budget({instanceSpending: 10, storageSpending: 100, storageQuota: 1000}))
            const [rows] = await scratchPool.query('SELECT * FROM budget_update_request WHERE username = ?', ['alice'])
            expect(rows).toHaveLength(1)
            expect(rows[0].state).toBe('PENDING')
            expect(rows[0].initial_monthly_instance).toBe(5)
            expect(rows[0].initial_storage_quota).toBe(500)
            expect(rows[0].requested_monthly_instance).toBe(10)
            expect(rows[0].message).toBe('please more')
        })

        test('requestBudgetUpdate existing PENDING → UPDATE (no new row)', async () => {
            const repo = makeRepo()
            await scratchPool.query(
                'INSERT INTO default_user_budget(monthly_instance, monthly_storage, storage_quota) VALUES(1, 1, 1)'
            )
            await repo.requestBudgetUpdate('alice', 'first', budget({instanceSpending: 2, storageSpending: 2, storageQuota: 2}))
            await repo.requestBudgetUpdate('alice', 'second', budget({instanceSpending: 9, storageSpending: 9, storageQuota: 9}))
            const [rows] = await scratchPool.query('SELECT * FROM budget_update_request WHERE username = ?', ['alice'])
            expect(rows).toHaveLength(1)
            expect(rows[0].message).toBe('second')
            expect(rows[0].requested_monthly_instance).toBe(9)
        })

        test('budgetUpdateRequest returns the PENDING request', async () => {
            const repo = makeRepo()
            await scratchPool.query('INSERT INTO default_user_budget(monthly_instance, monthly_storage, storage_quota) VALUES(1, 1, 1)')
            await repo.requestBudgetUpdate('alice', 'give me', budget({instanceSpending: 7, storageSpending: 8, storageQuota: 9}))
            const req = await repo.budgetUpdateRequest('alice')
            expect(req.message).toBe('give me')
            expect(req.instanceSpending).toBe(7)
            expect(req.storageQuota).toBe(9)
        })

        test('budgetUpdateRequest returns null when no PENDING request', async () => {
            expect(await makeRepo().budgetUpdateRequest('nobody')).toBeNull()
        })

        test('updateBudget UPDATE-else-INSERT + closes PENDING request (state CLOSED + final_*)', async () => {
            const repo = makeRepo()
            await scratchPool.query('INSERT INTO default_user_budget(monthly_instance, monthly_storage, storage_quota) VALUES(1, 1, 1)')
            await repo.requestBudgetUpdate('alice', 'want', budget({instanceSpending: 9, storageSpending: 9, storageQuota: 9}))
            await repo.updateBudget('alice', budget({instanceSpending: 6, storageSpending: 60, storageQuota: 600}))
            const [b] = await scratchPool.query('SELECT * FROM user_budget WHERE username = ?', ['alice'])
            expect(b[0].monthly_instance).toBe(6)
            expect(b[0].storage_quota).toBe(600)
            const [r] = await scratchPool.query('SELECT * FROM budget_update_request WHERE username = ?', ['alice'])
            expect(r[0].state).toBe('CLOSED')
            expect(r[0].final_monthly_instance).toBe(6)
            expect(r[0].final_storage_quota).toBe(600)
            expect(await repo.budgetUpdateRequest('alice')).toBeNull()
        })
    })

    describe('updateDefaultBudget', () => {
        test('INSERTs when empty, then UPDATEs the single row', async () => {
            const repo = makeRepo()
            await repo.updateDefaultBudget(dto.budget({instanceSpending: 1, storageSpending: 2, storageQuota: 3}))
            let [rows] = await scratchPool.query('SELECT * FROM default_user_budget')
            expect(rows).toHaveLength(1)
            expect(rows[0].monthly_instance).toBe(1)
            await repo.updateDefaultBudget(dto.budget({instanceSpending: 10, storageSpending: 20, storageQuota: 30}))
            ;[rows] = await scratchPool.query('SELECT * FROM default_user_budget')
            expect(rows).toHaveLength(1)
            expect(rows[0].monthly_instance).toBe(10)
            expect(rows[0].storage_quota).toBe(30)
        })
    })

    describe('spendingReport', () => {
        test('UNIONs usernames + prefers per-user budget (IFNULL b.*, d.*) + attaches request', async () => {
            const repo = makeRepo()
            await scratchPool.query('INSERT INTO default_user_budget(monthly_instance, monthly_storage, storage_quota) VALUES(1, 10, 100)')
            await scratchPool.query(
                'INSERT INTO user_spending(username, instance_spending, storage_spending, storage_usage) VALUES(?, ?, ?, ?)',
                ['alice', 3, 4, 5]
            )
            await scratchPool.query(
                'INSERT INTO user_budget(username, monthly_instance, monthly_storage, storage_quota) VALUES(?, ?, ?, ?)',
                ['alice', 7, 70, 700]
            )
            await repo.requestBudgetUpdate('bob', 'more', dto.budget({instanceSpending: 2, storageSpending: 2, storageQuota: 2}))

            const report = await repo.spendingReport()
            expect(Object.keys(report).sort()).toEqual(['alice', 'bob'])
            expect(report.alice.instanceSpending).toBe(3)
            expect(report.alice.instanceBudget).toBe(7)
            expect(report.alice.storageQuota).toBe(700)
            expect(report.alice.budgetUpdateRequest).toBeUndefined()
            expect(report.alice.costPerGbMonth).toBe(0)
            expect(report.bob.costPerGbMonth).toBe(0)
            expect(report.bob.instanceSpending).toBe(0)
            expect(report.bob.instanceBudget).toBe(1)
            expect(report.bob.storageQuota).toBe(100)
            expect(report.bob.budgetUpdateRequest.message).toBe('more')
        })
    })
})
