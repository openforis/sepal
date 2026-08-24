// Integration tests for taskRepository against a scratch MySQL schema.
//
// Requires MYSQL_PASSWORD in the environment (provided by docker-compose.yml). Under
// `sepal npm-test worker` the container receives MYSQL_HOST/USER/PASSWORD, so the suite runs.
//
// Uses createTaskRepository(pool, clock) — the injectable factory — to exercise PRODUCTION SQL
// against a transient `worker_task_test_<pid>` scratch schema. The live schemas are never
// touched. mysql2/promise is imported directly (the #sepal/db/mysql transitive import does not
// survive Jest's ESM VM linker with the symlinked sepal package).

import mysql from 'mysql2/promise'

const {MYSQL_HOST = 'mysql', MYSQL_USER = 'root', MYSQL_PASSWORD} = process.env
const SCRATCH = `worker_task_test_${process.pid}`
const hasCredentials = Boolean(MYSQL_PASSWORD)

const describeIf = (condition, ...args) =>
    condition ? describe(...args) : describe.skip(...args)

const MINUTE = 60 * 1000

describeIf(hasCredentials, 'integration — task scratch schema (requires MYSQL_PASSWORD)', () => {
    let createTaskRepository
    let taskDomain
    let adminConn
    let scratchPool
    let clockNow // mutable; the injected clock returns this

    const clock = () => clockNow

    const makeRepo = () => createTaskRepository(scratchPool, clock)

    const newTask = overrides => taskDomain.createTask({
        id: 't-1',
        state: taskDomain.State.PENDING,
        username: 'alice',
        sessionId: 's-1',
        operation: 'some-operation',
        params: {foo: 'bar'},
        statusDescription: taskDomain.StateDescription.PENDING,
        creationTime: new Date('2026-01-01T00:00:00Z'),
        updateTime: new Date('2026-01-01T00:00:00Z'),
        recipeId: null,
        ...overrides,
    })

    beforeAll(async () => {
        ({createTaskRepository} = await import('./taskRepository.js'))
        taskDomain = await import('./task.js')

        adminConn = await mysql.createConnection({
            host: MYSQL_HOST,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: 'mysql',
            multipleStatements: true
        })
        await adminConn.query(`CREATE SCHEMA IF NOT EXISTS \`${SCRATCH}\``)
        await adminConn.query(`
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`task\` (
                \`id\`                 varchar(255)  NOT NULL,
                \`state\`              varchar(255)  NOT NULL,
                \`username\`           varchar(255)  NOT NULL,
                \`session_id\`         varchar(255)  NOT NULL,
                \`operation\`          varchar(255)  NOT NULL,
                \`params\`             longtext      NOT NULL,
                \`status_description\` longtext      NOT NULL,
                \`creation_time\`      timestamp     NOT NULL,
                \`update_time\`        timestamp     NOT NULL,
                \`removed\`            tinyint(1)    NOT NULL,
                \`recipe_id\`          varchar(255)  DEFAULT NULL,
                PRIMARY KEY (\`id\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=latin1
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
        clockNow = new Date('2026-06-01T12:00:00Z')
    })

    afterEach(async () => {
        await scratchPool.query('DELETE FROM task')
    })

    const rawRow = async id => {
        const [rows] = await scratchPool.query('SELECT * FROM task WHERE id = ?', [id])
        return rows[0] || null
    }

    test('insert → getTask round-trips fields; params parsed; recipe_id nullable', async () => {
        const repo = makeRepo()
        await repo.insert(newTask({recipeId: 'r-1', params: {sceneIds: ['a', 'b']}}))
        const t = await repo.getTask('t-1')
        expect(t.id).toBe('t-1')
        expect(t.state).toBe('PENDING')
        expect(t.username).toBe('alice')
        expect(t.sessionId).toBe('s-1')
        expect(t.operation).toBe('some-operation')
        expect(t.params).toEqual({sceneIds: ['a', 'b']})
        expect(t.recipeId).toBe('r-1')
        expect(t.statusDescription).toBe(taskDomain.StateDescription.PENDING)
    })

    test('insert with null recipe_id → getTask recipeId null', async () => {
        const repo = makeRepo()
        await repo.insert(newTask({recipeId: null}))
        expect((await repo.getTask('t-1')).recipeId).toBeNull()
    })

    test('insert defaults status_description to state.description when null', async () => {
        const repo = makeRepo()
        await repo.insert(newTask({statusDescription: null}))
        expect((await repo.getTask('t-1')).statusDescription).toBe(taskDomain.StateDescription.PENDING)
    })

    test('getTask throws for a missing id', async () => {
        const repo = makeRepo()
        await expect(repo.getTask('nope')).rejects.toThrow(/Non-existing task: nope/)
    })

    test('update sets state/status_description/update_time from clock', async () => {
        const repo = makeRepo()
        await repo.insert(newTask())
        clockNow = new Date('2026-06-01T12:34:00Z')
        const active = taskDomain.activate(await repo.getTask('t-1'))
        await repo.update(active)
        const row = await rawRow('t-1')
        expect(row.state).toBe('ACTIVE')
        expect(row.status_description).toBe(taskDomain.StateDescription.ACTIVE)
        expect(new Date(row.update_time).getTime()).toBe(clockNow.getTime())
    })

    test('remove sets removed = TRUE', async () => {
        const repo = makeRepo()
        await repo.insert(newTask())
        await repo.remove(await repo.getTask('t-1'))
        expect((await rawRow('t-1')).removed).toBe(1)
    })

    test('removeNonPendingOrActiveUserTasks removes only non-PENDING/ACTIVE', async () => {
        const repo = makeRepo()
        await repo.insert(newTask({id: 'p', state: taskDomain.State.PENDING}))
        await repo.insert(newTask({id: 'a', state: taskDomain.State.ACTIVE}))
        await repo.insert(newTask({id: 'c', state: taskDomain.State.COMPLETED}))
        await repo.insert(newTask({id: 'f', state: taskDomain.State.FAILED}))
        await repo.removeNonPendingOrActiveUserTasks('alice')
        expect((await rawRow('p')).removed).toBe(0)
        expect((await rawRow('a')).removed).toBe(0)
        expect((await rawRow('c')).removed).toBe(1)
        expect((await rawRow('f')).removed).toBe(1)
    })

    describe('timedOutTasks 3-predicate boundaries', () => {
        test('PENDING older than 10m → returned; fresh PENDING not', async () => {
            const repo = makeRepo()
            await repo.insert(newTask({id: 'pending-old', state: taskDomain.State.PENDING,
                updateTime: new Date(clockNow.getTime() - 10 * MINUTE - 1000)}))
            await repo.insert(newTask({id: 'pending-fresh', state: taskDomain.State.PENDING,
                updateTime: new Date(clockNow.getTime() - 9 * MINUTE)}))
            const ids = (await repo.timedOutTasks()).map(t => t.id)
            expect(ids).toContain('pending-old')
            expect(ids).not.toContain('pending-fresh')
        })

        test('ACTIVE older than 5m → returned; fresh ACTIVE not', async () => {
            const repo = makeRepo()
            await repo.insert(newTask({id: 'active-old', state: taskDomain.State.ACTIVE,
                updateTime: new Date(clockNow.getTime() - 5 * MINUTE - 1000)}))
            await repo.insert(newTask({id: 'active-fresh', state: taskDomain.State.ACTIVE,
                updateTime: new Date(clockNow.getTime() - 4 * MINUTE)}))
            const ids = (await repo.timedOutTasks()).map(t => t.id)
            expect(ids).toContain('active-old')
            expect(ids).not.toContain('active-fresh')
        })

        test('CANCELING older than 2m → returned; fresh CANCELING not', async () => {
            const repo = makeRepo()
            await repo.insert(newTask({id: 'canceling-old', state: taskDomain.State.CANCELING,
                updateTime: new Date(clockNow.getTime() - 2 * MINUTE - 1000)}))
            await repo.insert(newTask({id: 'canceling-fresh', state: taskDomain.State.CANCELING,
                updateTime: new Date(clockNow.getTime() - 1 * MINUTE)}))
            const ids = (await repo.timedOutTasks()).map(t => t.id)
            expect(ids).toContain('canceling-old')
            expect(ids).not.toContain('canceling-fresh')
        })

        test('per-state thresholds are distinct (ACTIVE 6m old returned, PENDING 6m old not)', async () => {
            const repo = makeRepo()
            // 6m ago: past ACTIVE's 5m threshold, but within PENDING's 10m window.
            await repo.insert(newTask({id: 'active-6m', state: taskDomain.State.ACTIVE,
                updateTime: new Date(clockNow.getTime() - 6 * MINUTE)}))
            await repo.insert(newTask({id: 'pending-6m', state: taskDomain.State.PENDING,
                updateTime: new Date(clockNow.getTime() - 6 * MINUTE)}))
            const ids = (await repo.timedOutTasks()).map(t => t.id)
            expect(ids).toContain('active-6m')
            expect(ids).not.toContain('pending-6m')
        })

        test('COMPLETED/CANCELED/FAILED never timed out regardless of age', async () => {
            const repo = makeRepo()
            const old = new Date(clockNow.getTime() - 60 * MINUTE)
            await repo.insert(newTask({id: 'c', state: taskDomain.State.COMPLETED, updateTime: old}))
            await repo.insert(newTask({id: 'x', state: taskDomain.State.CANCELED, updateTime: old}))
            await repo.insert(newTask({id: 'f', state: taskDomain.State.FAILED, updateTime: old}))
            expect((await repo.timedOutTasks()).map(t => t.id)).toEqual([])
        })
    })

    test('pendingOrActiveTasksInSession filters by session_id + state', async () => {
        const repo = makeRepo()
        await repo.insert(newTask({id: 'p', sessionId: 's-x', state: taskDomain.State.PENDING}))
        await repo.insert(newTask({id: 'a', sessionId: 's-x', state: taskDomain.State.ACTIVE}))
        await repo.insert(newTask({id: 'c', sessionId: 's-x', state: taskDomain.State.COMPLETED}))
        await repo.insert(newTask({id: 'o', sessionId: 's-other', state: taskDomain.State.PENDING}))
        const ids = (await repo.pendingOrActiveTasksInSession('s-x')).map(t => t.id).sort()
        expect(ids).toEqual(['a', 'p'])
    })

    test('userTasks excludes removed and orders by creation_time', async () => {
        const repo = makeRepo()
        await repo.insert(newTask({id: 'late', state: taskDomain.State.COMPLETED,
            creationTime: new Date('2026-01-03T00:00:00Z')}))
        await repo.insert(newTask({id: 'early', state: taskDomain.State.COMPLETED,
            creationTime: new Date('2026-01-01T00:00:00Z')}))
        await repo.insert(newTask({id: 'mid', state: taskDomain.State.COMPLETED,
            creationTime: new Date('2026-01-02T00:00:00Z')}))
        await repo.insert(newTask({id: 'gone', state: taskDomain.State.COMPLETED,
            creationTime: new Date('2026-01-04T00:00:00Z')}))
        await repo.remove(await repo.getTask('gone'))
        const ids = (await repo.userTasks('alice')).map(t => t.id)
        expect(ids).toEqual(['early', 'mid', 'late'])
    })

    test('pendingOrActiveUserTasks filters by username + state', async () => {
        const repo = makeRepo()
        await repo.insert(newTask({id: 'p', username: 'alice', state: taskDomain.State.PENDING}))
        await repo.insert(newTask({id: 'a', username: 'alice', state: taskDomain.State.ACTIVE}))
        await repo.insert(newTask({id: 'c', username: 'alice', state: taskDomain.State.COMPLETED}))
        await repo.insert(newTask({id: 'other', username: 'bob', state: taskDomain.State.PENDING}))
        const ids = (await repo.pendingOrActiveUserTasks('alice')).map(t => t.id).sort()
        expect(ids).toEqual(['a', 'p'])
    })
})
