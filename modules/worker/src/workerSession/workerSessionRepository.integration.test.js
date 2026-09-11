import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {createTask, State as TaskState, StateDescription} from '../task/task.js'
import {TaskRepository} from '../task/taskRepository.js'
import {SessionAppRepository} from './sessionAppRepository.js'
import {activate, close, createWorkerSession, NotificationState, State} from './workerSession.js'
import {WorkerSessionRepository} from './workerSessionRepository.js'

// Session lifetime against real MySQL. Every deadline this repository writes comes from the database's
// own NOW() through GREATEST/LEAST/COALESCE, so what the ratchet, the cap and the guarded transitions
// actually do to a stored TIMESTAMP is only observable here.
//
// The tasks and app associations these statements look for are arranged through the repositories that
// own them. Rows are written directly only for the two things no operation can produce: a notification
// that was raised in the past, and an interaction that happened an hour ago.

describe('WorkerSessionRepository', () => {
    let testDb
    let repository
    let sessionAppRepository
    let taskRepository
    let now

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'worker_session', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        now = new Date('2026-06-01T12:00:00Z')
        sessionAppRepository = new SessionAppRepository(testDb.db, () => now)
        repository = new WorkerSessionRepository(testDb.db, () => now, sessionAppRepository)
        taskRepository = new TaskRepository(testDb.db, () => now)
    })

    afterAll(() => testDb?.remove())

    describe('insert', () => {
        test('stores a session with the instance it runs on', async () => {
            await repository.insert(aSession({apiKey: 'the-key'}))

            const stored = await repository.getSession(SESSION_ID)
            expect(stored.id).toBe(SESSION_ID)
            expect(stored.state).toBe(State.PENDING)
            expect(stored.username).toBe(USERNAME)
            expect(stored.workerType).toBe('SANDBOX')
            expect(stored.instanceType).toBe(INSTANCE_TYPE)
            expect(stored.instance).toEqual({id: INSTANCE_ID, host: HOST})
            expect(stored.host).toBe(HOST)
            expect(stored.apiKey).toBe('the-key')
        })

        test('stores the username in lowercase', async () => {
            await repository.insert(aSession({username: 'Alice'}))

            const stored = await repository.getSession(SESSION_ID)
            expect(stored.username).toBe(USERNAME)
        })

        test('carries the startup lease the session was requested with', async () => {
            const lease = new Date('2026-06-01T12:30:00Z')

            await repository.insert(aSession({timeoutTime: lease}))

            const stored = await repository.getSession(SESSION_ID)
            expect(stored.timeoutTime).toEqual(lease)
        })
    })

    describe('getSession', () => {
        test('refuses to answer for a session that does not exist', async () => {
            await expect(repository.getSession('nope')).rejects.toThrow('Non-existing worker session: nope')
        })
    })

    describe('update', () => {
        test('records the state, stamped with the current time, keeping the api key of an open session', async () => {
            await repository.insert(aSession({apiKey: 'keep-me'}))
            now = new Date('2026-06-01T12:34:00Z')

            await repository.update(activate(await repository.getSession(SESSION_ID)))

            const stored = await repository.getSession(SESSION_ID)
            expect(stored.state).toBe(State.ACTIVE)
            expect(stored.apiKey).toBe('keep-me')
            expect(stored.updateTime.getTime()).toBe(now.getTime())
        })

        test('withdraws the api key of a session it closes', async () => {
            await repository.insert(aSession({apiKey: 'to-be-nulled'}))

            await repository.update(close(await repository.getSession(SESSION_ID)))

            const stored = await repository.getSession(SESSION_ID)
            expect(stored.state).toBe(State.CLOSED)
            expect(stored.apiKey).toBeNull()
        })

        // The deadline moves through extendSession and nowhere else, so a stale in-memory session
        // cannot undo a ratchet that landed while it was held.
        test('never writes the deadline back from the session it is given', async () => {
            await repository.insert(activeSession())
            await repository.extendSession({sessionId: SESSION_ID, minutes: 120})
            const ratcheted = await repository.getSession(SESSION_ID)

            await repository.update({...ratcheted, timeoutTime: new Date('2026-06-01T12:01:00Z')})

            const stored = await repository.getSession(SESSION_ID)
            expect(stored.timeoutTime).toEqual(ratcheted.timeoutTime)
        })

        test('gives up the app associations of the session it closes, keeping every other session\'s', async () => {
            await repository.insert(aSession())
            await repository.insert(aSession({id: ANOTHER_SESSION_ID, instance: {id: 'i-2', host: HOST}}))
            await sessionAppRepository.associate({username: USERNAME, appPath: '/app-one', sessionId: SESSION_ID, label: 'One'})
            await sessionAppRepository.associate({username: USERNAME, appPath: '/app-two', sessionId: SESSION_ID, label: 'Two'})
            await sessionAppRepository.associate({
                username: ANOTHER_USERNAME, appPath: '/app-one', sessionId: ANOTHER_SESSION_ID, label: 'One'
            })

            await repository.update(close(await repository.getSession(SESSION_ID)))

            const apps = await sessionAppRepository.appsForSessions([SESSION_ID, ANOTHER_SESSION_ID])
            expect(apps.get(SESSION_ID)).toBeUndefined()
            expect(apps.get(ANOTHER_SESSION_ID)).toHaveLength(1)
        })

        test('leaves the app associations of a session it only activates', async () => {
            await repository.insert(aSession())
            await sessionAppRepository.associate({username: USERNAME, appPath: '/app-one', sessionId: SESSION_ID, label: 'One'})

            await repository.update(activate(await repository.getSession(SESSION_ID)))

            const apps = await sessionAppRepository.appsForSessions([SESSION_ID])
            expect(apps.get(SESSION_ID)).toHaveLength(1)
        })
    })

    describe('activateSession', () => {
        test('stamps when the session became active and gives it the full lease from then', async () => {
            await repository.insert(aSession({timeoutTime: await secondsFromNow(60)}))

            const activated = await repository.activateSession(SESSION_ID, 30)

            const deadline = await secondsFromNow(29 * 60)
            expect(activated.state).toBe(State.ACTIVE)
            expect(activated.activeTime).not.toBeNull()
            expect(activated.timeoutTime.getTime()).toBeGreaterThan(deadline.getTime())
        })

        test('activates a pending session once, and reports nothing to the caller that lost', async () => {
            await repository.insert(aSession())

            const first = await repository.activateSession(SESSION_ID, 30)
            const second = await repository.activateSession(SESSION_ID, 30)

            expect(first.state).toBe(State.ACTIVE)
            expect(second).toBeNull()
        })
    })

    describe('extendSession — the ratchet', () => {
        test('sets a deadline on a session that had none', async () => {
            await repository.insert(activeSession())

            const extended = await repository.extendSession({sessionId: SESSION_ID, minutes: 15})

            const floor = await secondsFromNow(14 * 60)
            const {timeoutTime} = await repository.getSession(SESSION_ID)
            expect(extended).toBe(true)
            expect(timeoutTime.getTime()).toBeGreaterThan(floor.getTime())
        })

        // Events arriving out of order, or a small extension landing after a large one, can never
        // shorten a session.
        test('never shortens a deadline a larger extension already set', async () => {
            await repository.insert(activeSession())
            await repository.extendSession({sessionId: SESSION_ID, minutes: 120})
            const far = (await repository.getSession(SESSION_ID)).timeoutTime

            await repository.extendSession({sessionId: SESSION_ID, minutes: 1})

            const {timeoutTime} = await repository.getSession(SESSION_ID)
            expect(timeoutTime).toEqual(far)
        })

        test('leaves a session that is not active alone', async () => {
            await repository.insert(aSession())

            const extended = await repository.extendSession({sessionId: SESSION_ID, minutes: 15})

            const {timeoutTime} = await repository.getSession(SESSION_ID)
            expect(extended).toBe(false)
            expect(timeoutTime).toBeNull()
        })

        // That a busy verdict does NOT stamp the interaction is the whole mechanism of the cap.
        test('records only a human extension as an interaction', async () => {
            await repository.insert(activeSession())

            await repository.extendSession({sessionId: SESSION_ID, minutes: 15, interaction: false})
            const afterVerdict = await repository.getSession(SESSION_ID)
            await repository.extendSession({sessionId: SESSION_ID, minutes: 15, interaction: true})
            const afterInteraction = await repository.getSession(SESSION_ID)

            expect(afterVerdict.lastInteractionTime).toBeNull()
            expect(afterInteraction.lastInteractionTime).not.toBeNull()
        })

        // "Any extension cancels the expiry cycle" is a claim about interleaving, and it holds only
        // because the reset happens in the SAME statement as the ratchet.
        test('cancels the expiry cycle of the session it extends', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)
            const notified = await repository.getSession(SESSION_ID)

            await repository.extendSession({sessionId: SESSION_ID, minutes: 15})

            const rescued = await repository.getSession(SESSION_ID)
            expect(notified.notificationState).toBe(NotificationState.NOTIFIED)
            expect(rescued.notificationState).toBe(NotificationState.NONE)
            expect(rescued.notifiedTime).toBeNull()
        })

        // A ratchet the cap clamped into the past moves nothing, and cancelling the cycle on the
        // strength of a no-op let a session under continuous load re-notify on every sweep and never
        // reach the end of its grace. Load stopped buying time, and then bought it back through the
        // reset. Three hours since the last interaction against a one-hour cap puts the clamped
        // candidate behind the deadline that is already past.
        test('leaves the expiry cycle of a session whose deadline it could not move', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)
            const notified = await repository.getSession(SESSION_ID)
            await givenLastInteractionHoursAgo(3)

            await repository.extendSession({sessionId: SESSION_ID, minutes: 15, interaction: false, capHours: 1})

            const after = await repository.getSession(SESSION_ID)
            expect(after.notificationState).toBe(NotificationState.NOTIFIED)
            expect(after.notifiedTime).toEqual(notified.notifiedTime)
            expect(after.timeoutTime).toEqual(notified.timeoutTime)
        })
    })

    describe('extendSession — the unattended cap', () => {
        test('cannot push a busy session past its cap from the last interaction', async () => {
            await repository.insert(activeSession({timeoutTime: await secondsFromNow(60)}))
            await givenLastInteractionHoursAgo(1)
            const before = (await repository.getSession(SESSION_ID)).timeoutTime

            await repository.extendSession({sessionId: SESSION_ID, minutes: 15, interaction: false, capHours: 1})

            const {timeoutTime} = await repository.getSession(SESSION_ID)
            expect(timeoutTime).toEqual(before)
        })

        // Refusing once now is past the boundary would let a verdict landing a second before it push
        // the deadline a whole extension beyond the cap; clamping subsumes refusal.
        test('lands a verdict just inside the boundary on the cap rather than past it', async () => {
            await repository.insert(activeSession())
            await givenLastInteractionSecondsAgo(3599)

            await repository.extendSession({sessionId: SESSION_ID, minutes: 15, interaction: false, capHours: 1})

            const ceiling = await secondsFromNow(2)
            const {timeoutTime} = await repository.getSession(SESSION_ID)
            expect(timeoutTime.getTime()).toBeLessThanOrEqual(ceiling.getTime())
        })

        test('never caps a human extension', async () => {
            await repository.insert(activeSession())
            await givenLastInteractionHoursAgo(1)

            await repository.extendSession({sessionId: SESSION_ID, minutes: 60, interaction: true})

            const floor = await secondsFromNow(59 * 60)
            const {timeoutTime} = await repository.getSession(SESSION_ID)
            expect(timeoutTime.getTime()).toBeGreaterThan(floor.getTime())
        })

        // now − NULL is NULL in SQL, which would make the comparison false and the busy ratchet
        // UNBOUNDED — in exactly the cases the cap exists for.
        test('caps a session nobody has ever interacted with, from when it became active', async () => {
            await repository.insert(activeSession())
            await givenNeverInteractedActiveHoursAgo(1)

            await repository.extendSession({sessionId: SESSION_ID, minutes: 15, interaction: false, capHours: 1})

            const ceiling = await secondsFromNow(2)
            const {timeoutTime} = await repository.getSession(SESSION_ID)
            expect(timeoutTime).not.toBeNull()
            expect(timeoutTime.getTime()).toBeLessThanOrEqual(ceiling.getTime())
        })

        // MySQL takes only a whole number of units in INTERVAL n HOUR and quietly rounds anything
        // else, so a fractional cap has to reach SQL as minutes.
        test('honours a cap of less than an hour', async () => {
            await repository.insert(activeSession())
            await givenLastInteractionSecondsAgo(60)

            await repository.extendSession({sessionId: SESSION_ID, minutes: 60, interaction: false, capHours: 0.5})

            const ceiling = await secondsFromNow(29 * 60 + 2)
            const {timeoutTime} = await repository.getSession(SESSION_ID)
            expect(timeoutTime.getTime()).toBeLessThanOrEqual(ceiling.getTime())
        })
    })

    describe('setSessionTimeout — the keep-alive slider', () => {
        // The one write that is not a ratchet: the last thing a person said is what they meant.
        test('shortens a deadline the ratchet could only have lengthened', async () => {
            await repository.insert(activeSession())
            await repository.extendSession({sessionId: SESSION_ID, minutes: 240})
            const long = (await repository.getSession(SESSION_ID)).timeoutTime

            const applied = await repository.setSessionTimeout({sessionId: SESSION_ID, minutes: 30})

            const ceiling = await secondsFromNow(31 * 60)
            const short = (await repository.getSession(SESSION_ID)).timeoutTime
            expect(applied).toBe(true)
            expect(short.getTime()).toBeLessThan(long.getTime())
            expect(short.getTime()).toBeLessThanOrEqual(ceiling.getTime())
        })

        test('lengthens just as readily', async () => {
            await repository.insert(activeSession())

            await repository.setSessionTimeout({sessionId: SESSION_ID, minutes: 120})

            const floor = await secondsFromNow(119 * 60)
            const {timeoutTime} = await repository.getSession(SESSION_ID)
            expect(timeoutTime.getTime()).toBeGreaterThan(floor.getTime())
        })

        // A person restating what they want earns the reset in either direction.
        test('cancels the expiry cycle even while shortening', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)

            await repository.setSessionTimeout({sessionId: SESSION_ID, minutes: 1})

            const after = await repository.getSession(SESSION_ID)
            expect(after.notificationState).toBe(NotificationState.NONE)
            expect(after.notifiedTime).toBeNull()
            expect(after.lastInteractionTime).not.toBeNull()
        })

        test('leaves a session that is not active alone', async () => {
            await repository.insert(aSession())

            const applied = await repository.setSessionTimeout({sessionId: SESSION_ID, minutes: 60})

            expect(applied).toBe(false)
        })
    })

    describe('expiredSessions', () => {
        test('reports a session that is past its deadline', async () => {
            await givenExpiredSession()

            const expired = await repository.expiredSessions()

            expect(expired.map(({id}) => id)).toEqual([SESSION_ID])
        })

        test('never reports a session that is running a task', async () => {
            await givenExpiredSession()
            await givenTask(TaskState.ACTIVE)

            const expired = await repository.expiredSessions()

            expect(expired).toEqual([])
        })

        test('never reports a session with no deadline at all', async () => {
            await repository.insert(activeSession())

            const expired = await repository.expiredSessions()

            expect(expired).toEqual([])
        })
    })

    describe('the notification transitions', () => {
        // Each is guarded on what the sweep observed, so exactly one sweep sees it and the event
        // fires once even if a sweep overruns its minute.
        test('raises the notification exactly once', async () => {
            await givenExpiredSession()

            const first = await repository.notifyExpiry(SESSION_ID)
            const second = await repository.notifyExpiry(SESSION_ID)

            expect(first).toBe(true)
            expect(second).toBe(false)
        })

        test('sends the email exactly once for the notification it was raised against', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)
            const {notifiedTime} = await repository.getSession(SESSION_ID)

            const first = await repository.markEmailed(SESSION_ID, notifiedTime)
            const second = await repository.markEmailed(SESSION_ID, notifiedTime)

            const stored = await repository.getSession(SESSION_ID)
            expect(first).toBe(true)
            expect(second).toBe(false)
            expect(stored.notificationState).toBe(NotificationState.EMAILED)
        })

        // "I saw it, don't email me": an easy misclick must not read as consent to close early.
        test('silences the email without moving the deadline', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)
            const notified = await repository.getSession(SESSION_ID)

            const dismissed = await repository.dismissNotification(SESSION_ID, USERNAME)

            const stored = await repository.getSession(SESSION_ID)
            expect(dismissed).toBe(true)
            expect(stored.notificationState).toBe(NotificationState.DISMISSED)
            expect(stored.timeoutTime).toEqual(notified.timeoutTime)
        })

        test('refuses to silence another user\'s notification', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)

            const dismissed = await repository.dismissNotification(SESSION_ID, ANOTHER_USERNAME)

            const stored = await repository.getSession(SESSION_ID)
            expect(dismissed).toBe(false)
            expect(stored.notificationState).toBe(NotificationState.NOTIFIED)
        })

        // Notify mode must not accumulate warned sessions: resetting alone would re-notify on the
        // very next minute, so the reset also buys one more grace period.
        test('restarting the cycle both clears the notification and moves the deadline out', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)
            const {notifiedTime, timeoutTime} = await repository.getSession(SESSION_ID)

            const restarted = await repository.restartExpiryCycle(SESSION_ID, notifiedTime, 60)

            const stored = await repository.getSession(SESSION_ID)
            expect(restarted).toBe(true)
            expect(stored.notificationState).toBe(NotificationState.NONE)
            expect(stored.notifiedTime).toBeNull()
            expect(stored.timeoutTime.getTime()).toBeGreaterThan(timeoutTime.getTime())
        })
    })

    describe('closeExpiredSession', () => {
        test('closes an undisturbed session and withdraws its api key', async () => {
            await givenExpiredSession({apiKey: 'the-key'})
            const observed = await givenNotificationRaisedMinutesAgo(61)

            const closed = await repository.closeExpiredSession({...observed, graceMinutes: 60})

            const stored = await repository.getSession(SESSION_ID)
            expect(closed).toBe(true)
            expect(stored.state).toBe(State.CLOSED)
            expect(stored.apiKey).toBeNull()
        })

        // Selecting candidates and then closing them is a lost update waiting to happen: an
        // interaction landing in between would lose to a decision made before it arrived.
        test('leaves a session that was extended after the sweep observed it', async () => {
            await givenExpiredSession()
            const observed = await givenNotificationRaisedMinutesAgo(61)
            await repository.extendSession({sessionId: SESSION_ID, minutes: 15})

            const closed = await repository.closeExpiredSession({...observed, graceMinutes: 60})

            const stored = await repository.getSession(SESSION_ID)
            expect(closed).toBe(false)
            expect(stored.state).toBe(State.ACTIVE)
        })

        test('leaves a session that started a task during its grace period', async () => {
            await givenExpiredSession()
            const observed = await givenNotificationRaisedMinutesAgo(61)
            await givenTask(TaskState.PENDING)

            const closed = await repository.closeExpiredSession({...observed, graceMinutes: 60})

            const stored = await repository.getSession(SESSION_ID)
            expect(closed).toBe(false)
            expect(stored.state).toBe(State.ACTIVE)
        })

        test('leaves a session whose grace has not elapsed', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)
            const observed = await observedNotification()

            const closed = await repository.closeExpiredSession({...observed, graceMinutes: 60})

            const stored = await repository.getSession(SESSION_ID)
            expect(closed).toBe(false)
            expect(stored.state).toBe(State.ACTIVE)
        })

        test('gives up the app associations of the session it closes', async () => {
            await givenExpiredSession()
            await sessionAppRepository.associate({username: USERNAME, appPath: '/app-one', sessionId: SESSION_ID, label: 'One'})
            const observed = await givenNotificationRaisedMinutesAgo(61)

            await repository.closeExpiredSession({...observed, graceMinutes: 60})

            const apps = await sessionAppRepository.appsForSessions([SESSION_ID])
            expect(apps.get(SESSION_ID)).toBeUndefined()
        })
    })

    describe('the expiry email links', () => {
        test('extends the session once for the notification the token was signed against', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)
            const {notifiedTime} = await repository.getSession(SESSION_ID)

            const first = await repository.redeemExtension({sessionId: SESSION_ID, notifiedTime, minutes: 15})
            const second = await repository.redeemExtension({sessionId: SESSION_ID, notifiedTime, minutes: 15})

            expect(first).toBe(true)
            expect(second).toBe(false)
        })

        test('terminates the session once', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)
            const {notifiedTime} = await repository.getSession(SESSION_ID)

            const first = await repository.redeemTermination({sessionId: SESSION_ID, notifiedTime})
            const second = await repository.redeemTermination({sessionId: SESSION_ID, notifiedTime})

            const stored = await repository.getSession(SESSION_ID)
            expect(first).toBe(true)
            expect(second).toBe(false)
            expect(stored.state).toBe(State.CLOSED)
        })

        // The rescue must win: the user went back to typing, and a terminate link left sitting in an
        // inbox must not be able to kill the instance later.
        test('refuses to terminate a session that has since been extended', async () => {
            await givenExpiredSession()
            await repository.notifyExpiry(SESSION_ID)
            const {notifiedTime} = await repository.getSession(SESSION_ID)
            await repository.extendSession({sessionId: SESSION_ID, minutes: 15})

            const terminated = await repository.redeemTermination({sessionId: SESSION_ID, notifiedTime})

            const stored = await repository.getSession(SESSION_ID)
            expect(terminated).toBe(false)
            expect(stored.state).toBe(State.ACTIVE)
        })

        test('gives up the app associations of a session it terminates', async () => {
            await givenExpiredSession()
            await sessionAppRepository.associate({username: USERNAME, appPath: '/app-one', sessionId: SESSION_ID, label: 'One'})
            await repository.notifyExpiry(SESSION_ID)
            const {notifiedTime} = await repository.getSession(SESSION_ID)

            await repository.redeemTermination({sessionId: SESSION_ID, notifiedTime})

            const apps = await sessionAppRepository.appsForSessions([SESSION_ID])
            expect(apps.get(SESSION_ID)).toBeUndefined()
        })

        test('leaves the app associations of a session it fails to terminate', async () => {
            await givenExpiredSession()
            await sessionAppRepository.associate({username: USERNAME, appPath: '/app-one', sessionId: SESSION_ID, label: 'One'})
            await repository.notifyExpiry(SESSION_ID)
            const {notifiedTime} = await repository.getSession(SESSION_ID)
            await repository.extendSession({sessionId: SESSION_ID, minutes: 15})

            await repository.redeemTermination({sessionId: SESSION_ID, notifiedTime})

            const apps = await sessionAppRepository.appsForSessions([SESSION_ID])
            expect(apps.get(SESSION_ID)).toHaveLength(1)
        })
    })

    // PENDING only: an ACTIVE session's lifetime is its stored deadline, swept by ExpireSessions.
    // Sweeping ACTIVE rows on update_time freshness is exactly the derived timeout this replaced.
    describe('timedOutSessions', () => {
        test('reports a pending session whose provisioning has hung', async () => {
            await repository.insert(aSession({id: 'stale', updateTime: minutesAgo(11)}))
            await repository.insert(aSession({id: 'fresh', instance: {id: 'i-2', host: HOST}, updateTime: minutesAgo(1)}))

            const timedOut = await repository.timedOutSessions()

            expect(timedOut.map(({id}) => id)).toEqual(['stale'])
        })

        test('never reports a session that is no longer pending, whatever its age', async () => {
            await repository.insert(aSession({id: 'active', state: State.ACTIVE, updateTime: minutesAgo(24 * 60)}))
            await repository.insert(aSession({
                id: 'closed', state: State.CLOSED, instance: {id: 'i-2', host: HOST}, updateTime: minutesAgo(24 * 60)
            }))

            const timedOut = await repository.timedOutSessions()

            expect(timedOut).toEqual([])
        })
    })

    describe('findUsernameByApiKey', () => {
        test('names the owner of an open session', async () => {
            await repository.insert(activeSession({apiKey: 'live-key'}))

            const username = await repository.findUsernameByApiKey('live-key')

            expect(username).toBe(USERNAME)
        })

        test('names nobody for a session that has closed', async () => {
            await repository.insert(aSession({state: State.CLOSED, apiKey: 'dead-key'}))

            const username = await repository.findUsernameByApiKey('dead-key')

            expect(username).toBeNull()
        })

        // Answered while the suite's only connection is held: with no key there is nothing to look up,
        // so nothing is looked up.
        test('names nobody when there is no key, without reaching the database', async () => {
            const username = await testDb.db.withConnection(() => repository.findUsernameByApiKey(null))

            expect(username).toBeNull()
        })
    })

    describe('sessionOnInstance', () => {
        test('finds the session occupying the instance', async () => {
            await repository.insert(activeSession({id: 'a', instance: {id: 'i-a', host: HOST}}))
            await repository.insert(activeSession({id: 'b', instance: {id: 'i-b', host: HOST}}))

            const found = await repository.sessionOnInstance('i-a', [State.PENDING, State.ACTIVE])

            expect(found.id).toBe('a')
        })

        test('finds nothing when no session in those states is on it', async () => {
            await repository.insert(activeSession({instance: {id: 'i-a', host: HOST}}))

            const found = await repository.sessionOnInstance('i-a', [State.CLOSED])

            expect(found).toBeNull()
        })
    })

    describe('sessions', () => {
        test('reports every session in any of the given states', async () => {
            await repository.insert(aSession({id: 'p', state: State.PENDING}))
            await repository.insert(aSession({id: 'a', state: State.ACTIVE, instance: {id: 'i-2', host: HOST}}))
            await repository.insert(aSession({id: 'c', state: State.CLOSED, instance: {id: 'i-3', host: HOST}}))

            const found = await repository.sessions([State.PENDING, State.ACTIVE])

            expect(found.map(({id}) => id).sort()).toEqual(['a', 'p'])
        })
    })

    describe('allOpenSessions', () => {
        test('reports every open session of every user, as the budget module needs them', async () => {
            await repository.insert(aSession({id: 'p', creationTime: minutesAgo(5)}))
            await repository.insert(activeSession({
                id: 'a', username: ANOTHER_USERNAME, instance: {id: 'i-2', host: HOST}
            }))
            await repository.insert(aSession({id: 'c', state: State.CLOSED, instance: {id: 'i-3', host: HOST}}))

            const open = await repository.allOpenSessions()

            expect(open.map(({sessionId}) => sessionId).sort()).toEqual(['a', 'p'])
            expect(open.find(({sessionId}) => sessionId === 'p')).toEqual({
                sessionId: 'p', username: USERNAME, instanceType: INSTANCE_TYPE, creationTime: minutesAgo(5),
            })
        })

        test('reports nothing when every session has closed', async () => {
            await repository.insert(aSession({state: State.CLOSED}))

            const open = await repository.allOpenSessions()

            expect(open).toEqual([])
        })
    })

    describe('userSessions', () => {
        test('reports all of the user\'s sessions, oldest first', async () => {
            await repository.insert(aSession({id: 'later', creationTime: minutesAgo(1)}))
            await repository.insert(aSession({
                id: 'earlier', instance: {id: 'i-2', host: HOST}, creationTime: minutesAgo(10)
            }))
            await repository.insert(aSession({
                id: 'other-user', username: ANOTHER_USERNAME, instance: {id: 'i-3', host: HOST}
            }))

            const found = await repository.userSessions(USERNAME)

            expect(found.map(({id}) => id)).toEqual(['earlier', 'later'])
        })

        test('narrows to the state, worker type and instance type it is given', async () => {
            await repository.insert(activeSession({id: 'match'}))
            await repository.insert(activeSession({
                id: 'other-type', workerType: 'TASK_EXECUTOR', instance: {id: 'i-2', host: HOST}
            }))
            await repository.insert(aSession({
                id: 'other-state', state: State.CLOSED, instance: {id: 'i-3', host: HOST}
            }))
            await repository.insert(activeSession({
                id: 'other-instance-type', instanceType: 'T3aLarge', instance: {id: 'i-4', host: HOST}
            }))

            const found = await repository.userSessions(USERNAME, [State.ACTIVE], 'SANDBOX', INSTANCE_TYPE)

            expect(found.map(({id}) => id)).toEqual(['match'])
        })
    })

    describe('mostRecentlyClosedSession', () => {
        test('reports when each user last closed a session', async () => {
            now = new Date('2026-06-01T10:00:00Z')
            await repository.insert(aSession({id: 'd1'}))
            await repository.update(close(await repository.getSession('d1')))
            now = new Date('2026-06-01T11:00:00Z')
            await repository.insert(aSession({id: 'd2', instance: {id: 'i-2', host: HOST}}))
            await repository.update(close(await repository.getSession('d2')))
            await repository.insert(activeSession({id: 'd3', instance: {id: 'i-3', host: HOST}}))

            const byUser = await repository.mostRecentlyClosedSessionByUser()
            const single = await repository.mostRecentlyClosedSession(USERNAME)

            expect(Object.keys(byUser)).toEqual([USERNAME])
            expect(byUser[USERNAME]).toEqual(new Date('2026-06-01T11:00:00Z'))
            expect(single.timestamp).toEqual(new Date('2026-06-01T11:00:00Z'))
        })

        test('reports nothing for a user who has closed none', async () => {
            await repository.insert(activeSession())

            const single = await repository.mostRecentlyClosedSession(USERNAME)

            expect(single).toEqual({})
        })
    })

    const givenExpiredSession = async (over = {}) =>
        await repository.insert(activeSession({timeoutTime: await secondsFromNow(-60), ...over}))

    const givenTask = state => taskRepository.insert(createTask({
        id: 't-1', state, username: USERNAME, sessionId: SESSION_ID, operation: 'some-operation',
        params: {}, statusDescription: StateDescription[state], creationTime: now, updateTime: now,
        recipeId: null,
    }))

    // notifyExpiry stamps notified_time with NOW(), so a grace period has not elapsed by definition.
    // Backdating it is what lets a close be attempted at all, and keeps the guard tests failing for the
    // reason they name rather than for want of elapsed time.
    const givenNotificationRaisedMinutesAgo = async minutes => {
        await repository.notifyExpiry(SESSION_ID)
        await testDb.query(
            'UPDATE worker_session SET notified_time = notified_time - INTERVAL ? MINUTE WHERE id = ?',
            [minutes, SESSION_ID]
        )
        return await observedNotification()
    }

    const observedNotification = async () => {
        const {notificationState, notifiedTime} = await repository.getSession(SESSION_ID)
        return {sessionId: SESSION_ID, notificationState, notifiedTime}
    }

    // The cap is anchored on times only the database writes, and only ever as NOW().
    const givenLastInteractionHoursAgo = hours => testDb.query(
        'UPDATE worker_session SET last_interaction_time = NOW() - INTERVAL ? HOUR WHERE id = ?',
        [hours, SESSION_ID]
    )

    const givenLastInteractionSecondsAgo = seconds => testDb.query(
        'UPDATE worker_session SET last_interaction_time = NOW() - INTERVAL ? SECOND WHERE id = ?',
        [seconds, SESSION_ID]
    )

    const givenNeverInteractedActiveHoursAgo = hours => testDb.query(
        `UPDATE worker_session
            SET last_interaction_time = NULL, active_time = NOW() - INTERVAL ? HOUR
            WHERE id = ?`,
        [hours, SESSION_ID]
    )

    // Deadlines are compared against the database's clock, never the suite's.
    const secondsFromNow = async seconds => {
        const [rows] = await testDb.query('SELECT NOW() + INTERVAL ? SECOND AS t', [seconds])
        return new Date(rows[0].t)
    }

    const minutesAgo = minutes => new Date(now.getTime() - minutes * 60 * 1000)

    const activeSession = (over = {}) => aSession({state: State.ACTIVE, ...over})

    const aSession = (over = {}) => createWorkerSession({
        id: SESSION_ID,
        state: State.PENDING,
        username: USERNAME,
        workerType: 'SANDBOX',
        instanceType: INSTANCE_TYPE,
        instance: {id: INSTANCE_ID, host: HOST},
        creationTime: now,
        updateTime: now,
        timeoutTime: null,
        apiKey: null,
        ...over,
    })

    const SESSION_ID = 's-1'
    const ANOTHER_SESSION_ID = 's-2'
    const INSTANCE_ID = 'i-1'
    const INSTANCE_TYPE = 'T3aSmall'
    const HOST = 'host-1'
    const USERNAME = 'alice'
    const ANOTHER_USERNAME = 'bob'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../../migrations')
})
