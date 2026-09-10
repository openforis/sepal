import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {OpenSessionUseRepository} from './openSessionUse.js'

// Session use against the real schema, where the upserts these operations rely on are MySQL's rather than
// an interpretation of them. Restricted SQL appears only for the columns no public read returns: the
// username, instance type and times a placeholder row must end up carrying.

describe('OpenSessionUseRepository', () => {
    let testDb
    let repository

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'budget_session_use', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new OpenSessionUseRepository(testDb.db)
    })

    afterAll(() => testDb?.remove())

    describe('openSession', () => {
        test('records one session however often it is delivered', async () => {
            await repository.openSession(aSession())

            await repository.openSession(aSession())

            const count = await repository.count()
            expect(count).toBe(1)
        })
    })

    describe('closeSession', () => {
        test('closes a session that was opened', async () => {
            await repository.openSession(aSession())

            await repository.closeSession({sessionId: SESSION_ID, to: at('07-03')})

            const open = await repository.openSessionIds()
            const stored = await storedSession(SESSION_ID)
            expect(open).toEqual([])
            expect(stored.to_time.getTime()).toBe(at('07-03').getTime())
        })

        test('leaves the user and instance type of the session it closes', async () => {
            await repository.openSession(aSession())

            await repository.closeSession({sessionId: SESSION_ID, to: at('07-03')})

            const stored = await storedSession(SESSION_ID)
            const count = await repository.count()
            expect(stored).toMatchObject({username: USERNAME, instance_type: INSTANCE_TYPE})
            expect(count).toBe(1)
        })

        // WorkerSessionClosed can arrive before WorkerSessionActivated.
        test('records a close for a session it has never seen opened', async () => {
            await repository.closeSession({sessionId: SESSION_ID, to: at('07-02')})

            const count = await repository.count()
            const open = await repository.openSessionIds()
            const stored = await storedSession(SESSION_ID)
            expect(count).toBe(1)
            expect(open).toEqual([])
            expect(stored.to_time.getTime()).toBe(at('07-02').getTime())
        })

        test('keeps that close to one session however often it is delivered', async () => {
            await repository.closeSession({sessionId: SESSION_ID, to: at('07-04')})

            await repository.closeSession({sessionId: SESSION_ID, to: at('07-04')})

            const count = await repository.count()
            const stored = await storedSession(SESSION_ID)
            expect(count).toBe(1)
            expect(stored.to_time.getTime()).toBe(at('07-04').getTime())
        })

        test('lets a later open fill in the session it closed, keeping the close time', async () => {
            await repository.closeSession({sessionId: SESSION_ID, to: at('07-02')})

            await repository.openSession(aSession({from: at('07-01')}))

            const count = await repository.count()
            const stored = await storedSession(SESSION_ID)
            expect(count).toBe(1)
            expect(stored).toMatchObject({username: USERNAME, instance_type: INSTANCE_TYPE})
            expect(stored.from_time.getTime()).toBe(at('07-01').getTime())
            expect(stored.to_time.getTime()).toBe(at('07-02').getTime())
        })
    })

    describe('count', () => {
        test('counts sessions whether they are open or closed', async () => {
            await repository.openSession(aSession({sessionId: 'open'}))
            await repository.openSession(aSession({sessionId: 'closed'}))
            await repository.closeSession({sessionId: 'closed', to: at('07-03')})

            const count = await repository.count()

            expect(count).toBe(2)
        })

        test('counts nothing when nothing has been recorded', async () => {
            const count = await repository.count()

            expect(count).toBe(0)
        })
    })

    describe('openSessionIds', () => {
        test('reports the sessions that have not been closed', async () => {
            await repository.openSession(aSession({sessionId: 'still-open'}))
            await repository.openSession(aSession({sessionId: 'closed'}))
            await repository.closeSession({sessionId: 'closed', to: at('07-03')})

            const open = await repository.openSessionIds()

            expect(open).toEqual(['still-open'])
        })
    })

    describe('removeUser', () => {
        test('removes only that user\'s sessions', async () => {
            await repository.openSession(aSession({sessionId: 'owned'}))
            await repository.openSession(aSession({sessionId: 'another', username: 'bob'}))

            await repository.removeUser(USERNAME)

            const open = await repository.openSessionIds()
            expect(open).toEqual(['another'])
        })
    })

    // Only for the columns no operation returns: who the session belonged to, what it ran on, and when it
    // started and ended.
    const storedSession = async sessionId => {
        const [rows] = await testDb.query('SELECT * FROM open_session_use WHERE session_id = ?', [sessionId])
        return rows[0]
    }

    const aSession = (over = {}) => ({
        sessionId: SESSION_ID, username: USERNAME, instanceType: INSTANCE_TYPE, from: at('07-01'), ...over,
    })

    const at = monthDay => new Date(`2026-${monthDay}T00:00:00Z`)

    const SESSION_ID = 's1'
    const USERNAME = 'alice'
    const INSTANCE_TYPE = 'T3aSmall'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
