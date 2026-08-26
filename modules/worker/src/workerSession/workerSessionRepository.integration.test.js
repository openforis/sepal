// Integration tests for workerSessionRepository against a scratch MySQL schema.
//
// Requires MYSQL_PASSWORD in the environment (provided by docker-compose.yml). Under
// `sepal npm-test worker` the container receives MYSQL_HOST/USER/PASSWORD, so the suite runs.
//
// Uses createWorkerSessionRepository(pool, clock) — the injectable factory — to exercise
// PRODUCTION SQL against a transient `worker_test_<pid>` scratch schema. The live schemas are
// never touched. mysql2/promise is imported directly (the #sepal/db/mysql transitive import
// does not survive Jest's ESM VM linker with the symlinked sepal package).
//
// What is proven:
//   • insert → getSession round-trips all fields (instance{id,host}, username lowercased)
//   • update PENDING→ACTIVE keeps api_key; sets update_time from clock
//   • update →CLOSED sets api_key = NULL
//   • update →CLOSED cascades a delete of the session's session_app rows
//   • the ratchet's monotonicity, its cap, and its atomic notification reset — against REAL MySQL,
//     because GREATEST/LEAST/COALESCE over TIMESTAMPs is exactly the kind of semantics a mocked
//     pool cannot prove
//   • the guarded close and the guarded notification transitions
//   • timedOutSessions is PENDING-only
//   • findUsernameByApiKey: PENDING/ACTIVE only, username lowercased
//   • sessionOnInstance filters by instance_id + state
//   • userSessions dynamic filters
//   • mostRecentlyClosedSession(ByUser)

import mysql from 'mysql2/promise'

const {MYSQL_HOST = 'mysql', MYSQL_USER = 'root', MYSQL_PASSWORD} = process.env
const SCRATCH = `worker_test_${process.pid}`
const hasCredentials = Boolean(MYSQL_PASSWORD)

const describeIf = (condition, ...args) =>
    condition ? describe(...args) : describe.skip(...args)

const TEN_MIN = 10 * 60 * 1000

describeIf(hasCredentials, 'integration — worker_session scratch schema (requires MYSQL_PASSWORD)', () => {
    let createWorkerSessionRepository
    let workerSession
    let adminConn
    let scratchPool
    let clockNow // mutable; the injected clock returns this

    const clock = () => clockNow

    const makeRepo = () => createWorkerSessionRepository(scratchPool, clock)

    const newSession = overrides => workerSession.createWorkerSession({
        id: 's-1',
        state: workerSession.State.PENDING,
        username: 'alice',
        workerType: 'SANDBOX',
        instanceType: 'T3aSmall',
        instance: {id: 'i-1', host: 'host-1'},
        creationTime: new Date('2026-01-01T00:00:00Z'),
        updateTime: new Date('2026-01-01T00:00:00Z'),
        timeoutTime: null,
        apiKey: null,
        ...overrides,
    })

    beforeAll(async () => {
        ({createWorkerSessionRepository} = await import('./workerSessionRepository.js'))
        workerSession = await import('./workerSession.js')

        adminConn = await mysql.createConnection({
            host: MYSQL_HOST,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: 'mysql',
            multipleStatements: true
        })
        await adminConn.query(`CREATE SCHEMA IF NOT EXISTS \`${SCRATCH}\``)
        await adminConn.query(`
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`worker_session\` (
                \`id\`                     varchar(255)  NOT NULL,
                \`state\`                  varchar(255)  NOT NULL,
                \`username\`               varchar(255)  NOT NULL,
                \`worker_type\`            varchar(255)  NOT NULL,
                \`instance_type\`          varchar(255)  NOT NULL,
                \`instance_id\`            varchar(255)  NOT NULL,
                \`host\`                   varchar(255)  NOT NULL,
                \`creation_time\`          timestamp     NOT NULL,
                \`update_time\`            timestamp     NOT NULL,
                \`api_key\`                varchar(64)   DEFAULT NULL,
                \`timeout_time\`           timestamp     NULL DEFAULT NULL,
                \`last_interaction_time\`  timestamp     NULL DEFAULT NULL,
                \`active_time\`            timestamp     NULL DEFAULT NULL,
                \`notification_state\`     enum('NONE','NOTIFIED','DISMISSED','EMAILED') NOT NULL DEFAULT 'NONE',
                \`notified_time\`          timestamp     NULL DEFAULT NULL,
                PRIMARY KEY (\`id\`),
                UNIQUE KEY \`idx_worker_session_api_key\` (\`api_key\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=latin1
        `)
        // task — the expiry sweep's candidate selection and its guarded close both check for a
        // PENDING/ACTIVE task, so the scratch schema needs the table even though these tests
        // never insert one through the task repository.
        await adminConn.query(`
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`task\` (
                \`id\`         varchar(255) NOT NULL,
                \`state\`      varchar(255) NOT NULL,
                \`username\`   varchar(255) NOT NULL,
                \`session_id\` varchar(255) NOT NULL,
                PRIMARY KEY (\`id\`),
                KEY \`idx_task_2\` (\`session_id\`, \`state\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=latin1
        `)
        // session_app — mirrors migrations/002.do.session-app.sql. Needed because
        // workerSessionRepository.update's CLOSED branch cascades sessionAppRepo.deleteForSession,
        // which defaults to a real createSessionAppRepository(pool, clock) querying this table.
        await adminConn.query(`
            CREATE TABLE IF NOT EXISTS \`${SCRATCH}\`.\`session_app\` (
                \`username\`      varchar(255) NOT NULL,
                \`app_path\`      varchar(255) NOT NULL,
                \`session_id\`    varchar(255) NOT NULL,
                \`label\`         varchar(255) DEFAULT NULL,
                \`creation_time\` timestamp    NOT NULL,
                PRIMARY KEY (\`username\`, \`app_path\`),
                KEY \`idx_session_app_1\` (\`session_id\`)
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
        await scratchPool.query('DELETE FROM worker_session')
        await scratchPool.query('DELETE FROM session_app')
        await scratchPool.query('DELETE FROM task')
    })

    const rawRow = async id => {
        const [rows] = await scratchPool.query('SELECT * FROM worker_session WHERE id = ?', [id])
        return rows[0] || null
    }

    // -----------------------------------------------------------------------
    // the ratchet, against real MySQL
    //
    // These are here rather than in the unit tests because the properties being proven are
    // properties of MySQL's GREATEST/LEAST/COALESCE over TIMESTAMP values — a mocked pool can
    // only confirm the SQL was written, not that it behaves.
    // -----------------------------------------------------------------------

    const activeSession = overrides =>
        newSession({state: workerSession.State.ACTIVE, ...overrides})

    const secondsFromNow = async seconds => {
        const [rows] = await scratchPool.query('SELECT NOW() + INTERVAL ? SECOND AS t', [seconds])
        return new Date(rows[0].t)
    }

    describe('extendSession', () => {
        test('sets a deadline on a session that had none', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession())
            expect(await repo.extendSession({sessionId: 's-1', minutes: 15})).toBe(true)
            const {timeoutTime} = await repo.getSession('s-1')
            expect(timeoutTime.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000)
        })

        // Events arriving out of order, or a small extension landing after a large one, can never
        // shorten a session.
        test('is monotonic — a smaller extension after a larger one is a no-op', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession())
            await repo.extendSession({sessionId: 's-1', minutes: 120})
            const far = (await repo.getSession('s-1')).timeoutTime
            await repo.extendSession({sessionId: 's-1', minutes: 1})
            expect((await repo.getSession('s-1')).timeoutTime).toEqual(far)
        })

        test('only ACTIVE sessions ratchet', async () => {
            const repo = makeRepo()
            await repo.insert(newSession()) // PENDING
            expect(await repo.extendSession({sessionId: 's-1', minutes: 15})).toBe(false)
            expect((await repo.getSession('s-1')).timeoutTime).toBeNull()
        })

        test('interaction=true stamps last_interaction_time; false leaves it alone', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession())
            await repo.extendSession({sessionId: 's-1', minutes: 15, interaction: false})
            expect((await repo.getSession('s-1')).lastInteractionTime).toBeNull()
            await repo.extendSession({sessionId: 's-1', minutes: 15, interaction: true})
            expect((await repo.getSession('s-1')).lastInteractionTime).not.toBeNull()
        })

        // "Any extension cancels the expiry cycle" is a claim about interleaving, and it only
        // holds because the reset happens in the SAME statement as the ratchet.
        test('clears the notification state atomically with the ratchet', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession({timeoutTime: await secondsFromNow(-60)}))
            await repo.notifyExpiry('s-1')
            expect((await repo.getSession('s-1')).notificationState).toBe('NOTIFIED')
            await repo.extendSession({sessionId: 's-1', minutes: 15})
            const rescued = await repo.getSession('s-1')
            expect(rescued.notificationState).toBe('NONE')
            expect(rescued.notifiedTime).toBeNull()
        })
    })

    describe('setSessionTimeout — the keep-alive slider', () => {
        // Against real MySQL, because "replaces" is a claim about what the statement does to a
        // stored timestamp, and the ratchet's GREATEST is the thing it must NOT do.
        test('shortens a deadline that the ratchet could only have lengthened', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession())
            await repo.extendSession({sessionId: 's-1', minutes: 240})
            const long = (await repo.getSession('s-1')).timeoutTime

            expect(await repo.setSessionTimeout({sessionId: 's-1', minutes: 30})).toBe(true)
            const short = (await repo.getSession('s-1')).timeoutTime
            expect(short.getTime()).toBeLessThan(long.getTime())
            expect(short.getTime()).toBeLessThanOrEqual(Date.now() + 31 * 60_000)
        })

        test('lengthens just as readily', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession())
            await repo.setSessionTimeout({sessionId: 's-1', minutes: 120})
            const {timeoutTime} = await repo.getSession('s-1')
            expect(timeoutTime.getTime()).toBeGreaterThan(Date.now() + 119 * 60_000)
        })

        // A person restating what they want earns the reset in either direction.
        test('cancels a notification even while shortening', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession({timeoutTime: await secondsFromNow(-60)}))
            await repo.notifyExpiry('s-1')
            expect((await repo.getSession('s-1')).notificationState).toBe('NOTIFIED')

            await repo.setSessionTimeout({sessionId: 's-1', minutes: 1})
            const after = await repo.getSession('s-1')
            expect(after.notificationState).toBe('NONE')
            expect(after.notifiedTime).toBeNull()
            expect(after.lastInteractionTime).not.toBeNull()
        })

        test('only ACTIVE sessions are settable', async () => {
            const repo = makeRepo()
            await repo.insert(newSession()) // PENDING
            expect(await repo.setSessionTimeout({sessionId: 's-1', minutes: 60})).toBe(false)
        })
    })

    describe('the unattended cap', () => {
        test('a busy verdict cannot push past anchor + cap', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession({timeoutTime: await secondsFromNow(60)}))
            // Anchor the cap 1 hour ago and set it to 1 hour: the ceiling is NOW.
            await scratchPool.query(
                'UPDATE worker_session SET last_interaction_time = NOW() - INTERVAL 1 HOUR WHERE id = ?', ['s-1'])
            const before = (await repo.getSession('s-1')).timeoutTime
            await repo.extendSession({sessionId: 's-1', minutes: 15, interaction: false, capHours: 1})
            // The clamped candidate is already in the past, so GREATEST keeps the deadline —
            // clamping subsumes refusal, with no separate rule.
            expect((await repo.getSession('s-1')).timeoutTime).toEqual(before)
        })

        // Refusing once now is past the boundary would let a verdict landing one second before it
        // push the deadline a whole extension past the cap.
        test('a verdict just inside the boundary lands ON the cap, not past it', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession())
            await scratchPool.query(
                'UPDATE worker_session SET last_interaction_time = NOW() - INTERVAL 3599 SECOND WHERE id = ?', ['s-1'])
            await repo.extendSession({sessionId: 's-1', minutes: 15, interaction: false, capHours: 1})
            const {timeoutTime} = await repo.getSession('s-1')
            expect(timeoutTime.getTime()).toBeLessThanOrEqual(Date.now() + 2000)
        })

        test('a human extension is never capped', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession())
            await scratchPool.query(
                'UPDATE worker_session SET last_interaction_time = NOW() - INTERVAL 1 HOUR WHERE id = ?', ['s-1'])
            await repo.extendSession({sessionId: 's-1', minutes: 60, interaction: true})
            const {timeoutTime} = await repo.getSession('s-1')
            expect(timeoutTime.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000)
        })

        // now − NULL is NULL in SQL, which would make the comparison false and the busy ratchet
        // UNBOUNDED — in exactly the cases the cap exists for.
        test('the cap still applies when nobody has ever interacted', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession())
            await scratchPool.query(
                `UPDATE worker_session
                    SET last_interaction_time = NULL, active_time = NOW() - INTERVAL 1 HOUR
                  WHERE id = ?`, ['s-1'])
            await repo.extendSession({sessionId: 's-1', minutes: 15, interaction: false, capHours: 1})
            const {timeoutTime} = await repo.getSession('s-1')
            expect(timeoutTime).not.toBeNull()
            expect(timeoutTime.getTime()).toBeLessThanOrEqual(Date.now() + 2000)
        })
    })

    describe('the expiry sweep against real rows', () => {
        const expired = async () => {
            const repo = makeRepo()
            await repo.insert(activeSession({timeoutTime: await secondsFromNow(-60)}))
            return repo
        }

        // notifyExpiry stamps notified_time = NOW(), so the grace has not elapsed by definition.
        // Backdating it is what lets a close be attempted at all, and keeps the guard tests
        // failing for the reason they name rather than for want of elapsed time.
        const ageNotification = minutes => scratchPool.query(
            'UPDATE worker_session SET notified_time = notified_time - INTERVAL ? MINUTE WHERE id = ?',
            [minutes, 's-1'])

        test('expiredSessions finds a session past its deadline', async () => {
            const repo = await expired()
            expect((await repo.expiredSessions()).map(s => s.id)).toEqual(['s-1'])
        })

        test('a session with a running task is never a candidate', async () => {
            const repo = await expired()
            await scratchPool.query(
                'INSERT INTO task(id, state, username, session_id) VALUES(?, ?, ?, ?)',
                ['t-1', 'ACTIVE', 'alice', 's-1'])
            expect(await repo.expiredSessions()).toEqual([])
        })

        test('a NULL deadline never expires', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession())
            expect(await repo.expiredSessions()).toEqual([])
        })

        test('notifyExpiry transitions exactly once', async () => {
            const repo = await expired()
            expect(await repo.notifyExpiry('s-1')).toBe(true)
            expect(await repo.notifyExpiry('s-1')).toBe(false)
        })

        test('markEmailed is spent by its notified_time', async () => {
            const repo = await expired()
            await repo.notifyExpiry('s-1')
            const {notifiedTime} = await repo.getSession('s-1')
            expect(await repo.markEmailed('s-1', notifiedTime)).toBe(true)
            expect(await repo.markEmailed('s-1', notifiedTime)).toBe(false)
        })

        // Selecting candidates and then closing them is a lost update waiting to happen.
        test('an extension between selection and close leaves the session open', async () => {
            const repo = await expired()
            await repo.notifyExpiry('s-1')
            await ageNotification(61)
            const observed = await repo.getSession('s-1')
            await repo.extendSession({sessionId: 's-1', minutes: 15}) // the rescue
            expect(await repo.closeExpiredSession({
                sessionId: 's-1',
                notificationState: observed.notificationState,
                notifiedTime: observed.notifiedTime,
                graceMinutes: 60,
            })).toBe(false)
            expect((await repo.getSession('s-1')).state).toBe('ACTIVE')
        })

        test('a task starting during the grace period cancels the close', async () => {
            const repo = await expired()
            await repo.notifyExpiry('s-1')
            await ageNotification(61)
            const observed = await repo.getSession('s-1')
            await scratchPool.query(
                'INSERT INTO task(id, state, username, session_id) VALUES(?, ?, ?, ?)',
                ['t-1', 'PENDING', 'alice', 's-1'])
            expect(await repo.closeExpiredSession({
                sessionId: 's-1',
                notificationState: observed.notificationState,
                notifiedTime: observed.notifiedTime,
                graceMinutes: 60,
            })).toBe(false)
        })

        test('a close before the grace has elapsed changes nothing', async () => {
            const repo = await expired()
            await repo.notifyExpiry('s-1')
            const observed = await repo.getSession('s-1')
            expect(await repo.closeExpiredSession({
                sessionId: 's-1',
                notificationState: observed.notificationState,
                notifiedTime: observed.notifiedTime,
                graceMinutes: 60,
            })).toBe(false)
            expect((await repo.getSession('s-1')).state).toBe('ACTIVE')
        })

        test('an undisturbed close CLOSES and nulls the api key', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession({timeoutTime: await secondsFromNow(-60), apiKey: 'the-key'}))
            await repo.notifyExpiry('s-1')
            await ageNotification(61)
            const observed = await repo.getSession('s-1')
            expect(await repo.closeExpiredSession({
                sessionId: 's-1',
                notificationState: observed.notificationState,
                notifiedTime: observed.notifiedTime,
                graceMinutes: 60,
            })).toBe(true)
            const closed = await repo.getSession('s-1')
            expect(closed.state).toBe('CLOSED')
            expect(closed.apiKey).toBeNull()
        })

        test('the terminate link CLOSES, exactly once', async () => {
            const repo = await expired()
            await repo.notifyExpiry('s-1')
            const {notifiedTime} = await repo.getSession('s-1')
            expect(await repo.redeemTermination({sessionId: 's-1', notifiedTime})).toBe(true)
            expect((await repo.getSession('s-1')).state).toBe('CLOSED')
            expect(await repo.redeemTermination({sessionId: 's-1', notifiedTime})).toBe(false)
        })

        // The rescue must win: the user went back to typing, the ratchet cleared notified_time,
        // and the terminate link they never clicked must not be able to kill the instance later.
        test('the terminate link is spent by any extension', async () => {
            const repo = await expired()
            await repo.notifyExpiry('s-1')
            const {notifiedTime} = await repo.getSession('s-1')
            await repo.extendSession({sessionId: 's-1', minutes: 15})
            expect(await repo.redeemTermination({sessionId: 's-1', notifiedTime})).toBe(false)
            expect((await repo.getSession('s-1')).state).toBe('ACTIVE')
        })

        test('the email link is redeemable exactly once', async () => {
            const repo = await expired()
            await repo.notifyExpiry('s-1')
            const {notifiedTime} = await repo.getSession('s-1')
            expect(await repo.redeemExtension({sessionId: 's-1', notifiedTime, minutes: 15})).toBe(true)
            expect(await repo.redeemExtension({sessionId: 's-1', notifiedTime, minutes: 15})).toBe(false)
        })
    })

    describe('activateSession', () => {
        test('stamps active_time and gives the full lease from activation', async () => {
            const repo = makeRepo()
            await repo.insert(newSession({timeoutTime: new Date(Date.now() + 60_000)}))
            const activated = await repo.activateSession('s-1', 30)
            expect(activated.state).toBe('ACTIVE')
            expect(activated.activeTime).not.toBeNull()
            expect(activated.timeoutTime.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000)
        })

        test('is guarded on PENDING', async () => {
            const repo = makeRepo()
            await repo.insert(activeSession())
            expect(await repo.activateSession('s-1', 30)).toBeNull()
        })
    })

    test('insert → getSession round-trips fields; username lowercased; instance mapped', async () => {
        const repo = makeRepo()
        await repo.insert(newSession({username: 'Alice', apiKey: 'the-key'}))
        const s = await repo.getSession('s-1')
        expect(s.id).toBe('s-1')
        expect(s.state).toBe('PENDING')
        expect(s.username).toBe('alice')
        expect(s.workerType).toBe('SANDBOX')
        expect(s.instanceType).toBe('T3aSmall')
        expect(s.instance).toEqual({id: 'i-1', host: 'host-1'})
        expect(s.host).toBe('host-1')
        expect(s.apiKey).toBe('the-key')
    })

    test('getSession throws for a missing id', async () => {
        const repo = makeRepo()
        await expect(repo.getSession('nope')).rejects.toThrow(/Non-existing worker session: nope/)
    })

    test('update PENDING→ACTIVE sets update_time from clock and keeps api_key', async () => {
        const repo = makeRepo()
        await repo.insert(newSession({apiKey: 'keep-me'}))
        clockNow = new Date('2026-06-01T12:34:00Z')
        const active = workerSession.activate(await repo.getSession('s-1'))
        await repo.update(active)
        const row = await rawRow('s-1')
        expect(row.state).toBe('ACTIVE')
        expect(row.api_key).toBe('keep-me')
        expect(new Date(row.update_time).getTime()).toBe(clockNow.getTime())
    })

    test('update →CLOSED sets api_key = NULL (parity risk #4)', async () => {
        const repo = makeRepo()
        await repo.insert(newSession({apiKey: 'to-be-nulled'}))
        const closed = workerSession.close(await repo.getSession('s-1'))
        await repo.update(closed)
        const row = await rawRow('s-1')
        expect(row.state).toBe('CLOSED')
        expect(row.api_key).toBeNull()
    })

    test('update →CLOSED cascades a delete of the session\'s session_app rows', async () => {
        const repo = makeRepo()
        await repo.insert(newSession())
        await repo.insert(newSession({id: 's-2', instance: {id: 'i-2', host: 'host-2'}}))
        await scratchPool.query(
            `INSERT INTO session_app(username, app_path, session_id, label, creation_time)
                VALUES(?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`,
            [
                'alice', '/app-one', 's-1', 'App One', clockNow,
                'alice', '/app-two', 's-1', 'App Two', clockNow,
                'bob', '/app-one', 's-2', 'App One', clockNow, // other session — must survive
            ]
        )
        const closed = workerSession.close(await repo.getSession('s-1'))
        await repo.update(closed)
        const [closedRows] = await scratchPool.query(
            'SELECT * FROM session_app WHERE session_id = ?', ['s-1'])
        expect(closedRows).toEqual([])
        const [survivingRows] = await scratchPool.query(
            'SELECT * FROM session_app WHERE session_id = ?', ['s-2'])
        expect(survivingRows).toHaveLength(1)
    })

    // PENDING only: an ACTIVE session's lifetime is the stored deadline, swept by ExpireSessions.
    // Sweeping ACTIVE rows on update_time freshness is exactly the derived timeout this replaced.
    describe('timedOutSessions', () => {
        test('old PENDING → returned', async () => {
            const repo = makeRepo()
            await repo.insert(newSession({
                id: 'old-pending', state: workerSession.State.PENDING,
                updateTime: new Date(clockNow.getTime() - TEN_MIN - 60000),
            }))
            expect((await repo.timedOutSessions()).map(s => s.id)).toContain('old-pending')
        })

        test('an old ACTIVE session is NOT returned, whatever its update_time', async () => {
            const repo = makeRepo()
            await repo.insert(newSession({
                id: 'old-active', state: workerSession.State.ACTIVE,
                updateTime: new Date(clockNow.getTime() - 24 * 60 * 60_000),
            }))
            expect((await repo.timedOutSessions()).map(s => s.id)).not.toContain('old-active')
        })

        test('recent PENDING → NOT returned (within the timeout window)', async () => {
            const repo = makeRepo()
            await repo.insert(newSession({
                id: 'fresh', state: workerSession.State.PENDING,
                updateTime: new Date(clockNow.getTime() - 60000),
            }))
            expect((await repo.timedOutSessions()).map(s => s.id)).not.toContain('fresh')
        })

        test('CLOSED with an old update_time → NOT returned (state guard)', async () => {
            const repo = makeRepo()
            await repo.insert(newSession({
                id: 'closed', state: workerSession.State.CLOSED,
                updateTime: new Date(clockNow.getTime() - TEN_MIN - 60000),
            }))
            expect((await repo.timedOutSessions()).map(s => s.id)).not.toContain('closed')
        })
    })

    describe('findUsernameByApiKey', () => {
        test('returns username lowercased for a PENDING/ACTIVE session', async () => {
            const repo = makeRepo()
            await repo.insert(newSession({id: 'a', username: 'Bob', state: workerSession.State.ACTIVE, apiKey: 'live-key'}))
            expect(await repo.findUsernameByApiKey('live-key')).toBe('bob')
        })

        test('does NOT match CLOSED sessions', async () => {
            const repo = makeRepo()
            await repo.insert(newSession({id: 'c', state: workerSession.State.CLOSED, apiKey: 'dead-key'}))
            expect(await repo.findUsernameByApiKey('dead-key')).toBeNull()
        })

        test('null apiKey → null', async () => {
            const repo = makeRepo()
            expect(await repo.findUsernameByApiKey(null)).toBeNull()
        })
    })

    test('sessionOnInstance filters by instance_id + state', async () => {
        const repo = makeRepo()
        await repo.insert(newSession({id: 'a', instance: {id: 'i-a', host: 'h'}, state: workerSession.State.ACTIVE}))
        await repo.insert(newSession({id: 'b', instance: {id: 'i-b', host: 'h'}, state: workerSession.State.ACTIVE}))
        const found = await repo.sessionOnInstance('i-a', [workerSession.State.PENDING, workerSession.State.ACTIVE])
        expect(found.id).toBe('a')
        const none = await repo.sessionOnInstance('i-a', [workerSession.State.CLOSED])
        expect(none).toBeNull()
    })

    test('sessions(states) returns rows matching any of the states', async () => {
        const repo = makeRepo()
        await repo.insert(newSession({id: 'p', state: workerSession.State.PENDING}))
        await repo.insert(newSession({id: 'a', state: workerSession.State.ACTIVE}))
        await repo.insert(newSession({id: 'c', state: workerSession.State.CLOSED}))
        const ids = (await repo.sessions([workerSession.State.PENDING, workerSession.State.ACTIVE])).map(s => s.id).sort()
        expect(ids).toEqual(['a', 'p'])
    })

    test('userSessions dynamic filters (username + state + workerType + instanceType)', async () => {
        const repo = makeRepo()
        await repo.insert(newSession({id: 'm', username: 'carol', workerType: 'SANDBOX', instanceType: 'T3aSmall', state: workerSession.State.ACTIVE}))
        await repo.insert(newSession({id: 'x', username: 'carol', workerType: 'TASK_EXECUTOR', instanceType: 'T3aSmall', state: workerSession.State.ACTIVE}))
        await repo.insert(newSession({id: 'y', username: 'carol', workerType: 'SANDBOX', instanceType: 'T3aLarge', state: workerSession.State.CLOSED}))
        const all = (await repo.userSessions('carol')).map(s => s.id).sort()
        expect(all).toEqual(['m', 'x', 'y'])
        const filtered = (await repo.userSessions('carol', [workerSession.State.ACTIVE], 'SANDBOX', 'T3aSmall')).map(s => s.id)
        expect(filtered).toEqual(['m'])
    })

    test('mostRecentlyClosedSessionByUser returns latest CLOSED update_time per user', async () => {
        const repo = makeRepo()
        // two closed sessions for dave; expect the later update_time
        clockNow = new Date('2026-06-01T10:00:00Z')
        await repo.insert(newSession({id: 'd1', username: 'Dave', state: workerSession.State.PENDING}))
        await repo.update(workerSession.close(await repo.getSession('d1')))
        clockNow = new Date('2026-06-01T11:00:00Z')
        await repo.insert(newSession({id: 'd2', username: 'Dave', state: workerSession.State.PENDING, apiKey: null}))
        await repo.update(workerSession.close(await repo.getSession('d2')))
        // a non-closed session must be ignored
        await repo.insert(newSession({id: 'd3', username: 'Dave', state: workerSession.State.ACTIVE}))

        const byUser = await repo.mostRecentlyClosedSessionByUser()
        expect(Object.keys(byUser)).toEqual(['dave'])
        expect(byUser.dave.getTime()).toBe(new Date('2026-06-01T11:00:00Z').getTime())

        const single = await repo.mostRecentlyClosedSession('Dave')
        expect(single.timestamp.getTime()).toBe(new Date('2026-06-01T11:00:00Z').getTime())
    })

    test('mostRecentlyClosedSession returns {} when the user has no closed sessions', async () => {
        const repo = makeRepo()
        await repo.insert(newSession({id: 'e1', username: 'erin', state: workerSession.State.ACTIVE}))
        expect(await repo.mostRecentlyClosedSession('erin')).toEqual({})
    })
})
