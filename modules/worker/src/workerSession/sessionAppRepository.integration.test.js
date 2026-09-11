import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {SessionAppRepository} from './sessionAppRepository.js'
import {createWorkerSession, State} from './workerSession.js'
import {WorkerSessionRepository} from './workerSessionRepository.js'

// The (username, app_path) key that makes an app permanent for the life of a session is MySQL's own.

describe('SessionAppRepository', () => {
    let testDb
    let repository
    let workerSessionRepository
    let now

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'worker_session_app', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        now = new Date('2026-07-01T00:00:00Z')
        repository = new SessionAppRepository(testDb.db, () => now)
        workerSessionRepository = new WorkerSessionRepository(testDb.db, () => now, repository)
    })

    afterAll(() => testDb?.remove())

    describe('associate', () => {
        test('associates an app with a session, recording the client that owns the tab', async () => {
            await givenSession(SESSION_ID)

            await repository.associate(anAssociation())

            const associated = await repository.userAppSessions(USERNAME)
            const owner = await repository.dissociate({username: USERNAME, appPath: APP_PATH})
            expect(associated).toEqual([{
                path: APP_PATH, label: 'Some app', sessionId: SESSION_ID,
                host: HOST, status: State.PENDING, instanceType: INSTANCE_TYPE,
            }])
            expect(owner).toEqual({sessionId: SESSION_ID, clientId: CLIENT_ID})
        })

        // The column compares without regard to case, so only the stored string shows the
        // normalization: everything reading it back as data gets one spelling.
        test('stores the username in lowercase', async () => {
            await givenSession(SESSION_ID)

            await repository.associate(anAssociation({username: 'Bob'}))

            const stored = await storedUsernames()
            expect(stored).toEqual([USERNAME])
        })

        test('leaves an association without an owning client', async () => {
            await givenSession(SESSION_ID)

            await repository.associate(anAssociation({clientId: undefined}))

            const dissociated = await repository.dissociate({username: USERNAME, appPath: APP_PATH})
            expect(dissociated).toEqual({sessionId: SESSION_ID, clientId: null})
        })

        // One app, one session: re-associating moves the app rather than adding a second row.
        test('moves the app to the session it is associated with next', async () => {
            await givenSession(SESSION_ID)
            await givenSession(ANOTHER_SESSION_ID)
            await repository.associate(anAssociation())

            await repository.associate(anAssociation({sessionId: ANOTHER_SESSION_ID, label: 'Moved'}))

            const associated = await repository.userAppSessions(USERNAME)
            expect(associated).toHaveLength(1)
            expect(associated[0].sessionId).toBe(ANOTHER_SESSION_ID)
            expect(associated[0].label).toBe('Moved')
        })
    })

    describe('setClient', () => {
        test('hands the association to another client without moving the session', async () => {
            await givenSession(SESSION_ID)
            await repository.associate(anAssociation())

            await repository.setClient({username: USERNAME, appPath: APP_PATH, clientId: ANOTHER_CLIENT_ID})

            const dissociated = await repository.dissociate({username: USERNAME, appPath: APP_PATH})
            expect(dissociated).toEqual({sessionId: SESSION_ID, clientId: ANOTHER_CLIENT_ID})
        })
    })

    describe('userAppSessions', () => {
        test('reports only associations whose session is still open', async () => {
            await givenSession(SESSION_ID)
            await givenSession(ANOTHER_SESSION_ID, {state: State.CLOSED})
            await repository.associate(anAssociation())
            await repository.associate(anAssociation({appPath: ANOTHER_APP_PATH, sessionId: ANOTHER_SESSION_ID}))

            const associated = await repository.userAppSessions(USERNAME)

            expect(associated.map(({path}) => path)).toEqual([APP_PATH])
        })

        test('reports only the given user\'s associations', async () => {
            await givenSession(SESSION_ID)
            await givenSession(ANOTHER_SESSION_ID, {username: ANOTHER_USERNAME})
            await repository.associate(anAssociation())
            await repository.associate(anAssociation({username: ANOTHER_USERNAME, sessionId: ANOTHER_SESSION_ID}))

            const associated = await repository.userAppSessions(USERNAME)

            expect(associated.map(({sessionId}) => sessionId)).toEqual([SESSION_ID])
        })
    })

    describe('appsForSessions', () => {
        test('groups the apps of each session by session id', async () => {
            await givenSession(SESSION_ID)
            await givenSession(ANOTHER_SESSION_ID)
            await repository.associate(anAssociation({appPath: APP_PATH, label: 'First'}))
            await repository.associate(anAssociation({appPath: ANOTHER_APP_PATH, label: 'Second'}))
            await repository.associate(anAssociation({
                username: ANOTHER_USERNAME, appPath: APP_PATH, sessionId: ANOTHER_SESSION_ID, label: 'Other'
            }))

            const apps = await repository.appsForSessions([SESSION_ID, ANOTHER_SESSION_ID])

            expect(apps.get(SESSION_ID)).toEqual([
                {path: APP_PATH, label: 'First'},
                {path: ANOTHER_APP_PATH, label: 'Second'},
            ])
            expect(apps.get(ANOTHER_SESSION_ID)).toEqual([{path: APP_PATH, label: 'Other'}])
        })

        // Answered while the suite's only connection is held: with no session ids there is nothing to
        // ask the database, so nothing is asked.
        test('reports nothing for no sessions at all, without reaching the database', async () => {
            const apps = await testDb.db.withConnection(() => repository.appsForSessions([]))

            expect(apps.size).toBe(0)
        })
    })

    describe('deleteForSession', () => {
        test('removes every association with the session', async () => {
            await givenSession(SESSION_ID)
            await givenSession(ANOTHER_SESSION_ID)
            await repository.associate(anAssociation())
            await repository.associate(anAssociation({appPath: ANOTHER_APP_PATH, sessionId: ANOTHER_SESSION_ID}))

            await repository.deleteForSession(SESSION_ID)

            const associated = await repository.userAppSessions(USERNAME)
            expect(associated.map(({sessionId}) => sessionId)).toEqual([ANOTHER_SESSION_ID])
        })
    })

    describe('dissociate', () => {
        test('removes the association and reports the session and owner it had', async () => {
            await givenSession(SESSION_ID)
            await repository.associate(anAssociation())

            const dissociated = await repository.dissociate({username: USERNAME, appPath: APP_PATH})

            const associated = await repository.userAppSessions(USERNAME)
            expect(dissociated).toEqual({sessionId: SESSION_ID, clientId: CLIENT_ID})
            expect(associated).toEqual([])
        })

        test('reports nothing for an app that was never associated', async () => {
            const dissociated = await repository.dissociate({username: USERNAME, appPath: APP_PATH})

            expect(dissociated).toBeNull()
        })
    })

    describe('dissociateForClient', () => {
        test('removes every association the client owned, and reports them', async () => {
            await givenSession(SESSION_ID)
            await repository.associate(anAssociation({appPath: APP_PATH}))
            await repository.associate(anAssociation({appPath: ANOTHER_APP_PATH}))
            await repository.associate(anAssociation({appPath: '/apps/kept', clientId: ANOTHER_CLIENT_ID}))

            const dissociated = await repository.dissociateForClient({username: USERNAME, clientId: CLIENT_ID})

            const associated = await repository.userAppSessions(USERNAME)
            expect(dissociated.map(({appPath}) => appPath).sort()).toEqual([ANOTHER_APP_PATH, APP_PATH].sort())
            expect(dissociated.every(({sessionId}) => sessionId === SESSION_ID)).toBe(true)
            expect(associated.map(({path}) => path)).toEqual(['/apps/kept'])
        })

        test('reports nothing when the client owned no association', async () => {
            await givenSession(SESSION_ID)
            await repository.associate(anAssociation())

            const dissociated = await repository.dissociateForClient({username: USERNAME, clientId: ANOTHER_CLIENT_ID})

            const associated = await repository.userAppSessions(USERNAME)
            expect(dissociated).toEqual([])
            expect(associated).toHaveLength(1)
        })
    })

    // The one column a read returns only after a case-insensitive comparison has already matched it.
    const storedUsernames = async () => {
        const [rows] = await testDb.query('SELECT username FROM session_app ORDER BY username')
        return rows.map(({username}) => username)
    }

    const givenSession = (sessionId, over = {}) => workerSessionRepository.insert(createWorkerSession({
        id: sessionId, state: State.PENDING, username: USERNAME, workerType: 'SANDBOX',
        instanceType: INSTANCE_TYPE, instance: {id: `i-${sessionId}`, host: HOST},
        creationTime: now, updateTime: now, ...over,
    }))

    const anAssociation = (over = {}) => ({
        username: USERNAME, appPath: APP_PATH, sessionId: SESSION_ID, label: 'Some app',
        clientId: CLIENT_ID, ...over,
    })

    const USERNAME = 'bob'
    const ANOTHER_USERNAME = 'alice'
    const SESSION_ID = 's-1'
    const ANOTHER_SESSION_ID = 's-2'
    const APP_PATH = '/apps/first'
    const ANOTHER_APP_PATH = '/apps/second'
    const CLIENT_ID = 'client-1'
    const ANOTHER_CLIENT_ID = 'client-2'
    const INSTANCE_TYPE = 'T3aSmall'
    const HOST = 'host-1'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../../migrations')
})
