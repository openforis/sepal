import assert from 'node:assert/strict'
import {describe, it, mock, test} from 'node:test'

import {ClientException} from '#sepal/exception'
import {callsOf} from '#sepal/testSupport/mock'

import {instanceName} from '../instanceName.js'
import {SANDBOX} from '../workerInstance/workerTypes.js'
import {InstanceBudgetExceeded, StorageBudgetExceeded, StorageQuotaExceeded} from './budgetErrors.js'
import {createMissingInstanceTracker} from './missingInstanceTracker.js'
import {createSessionManager} from './sessionManager.js'
import {createWorkerSession, State} from './workerSession.js'

describe('requestSession', () => {
    test('SANDBOX: budget checked, api_key generated, instance requested, row inserted PENDING with instance', async () => {
        const {mgr, repo, instanceManager, budgetClient} = build()

        const result = await mgr.requestSession({username: 'Alice', workerType: SANDBOX, instanceType: 'T3aSmall'})

        assert.deepEqual(callsOf(budgetClient.check), [['Alice']])
        assert.equal(instanceManager.requestInstance.mock.callCount(), 1)
        assert.equal(repo.insert.mock.callCount(), 1)
        const inserted = repo.insert.mock.calls[0].arguments[0]
        assert.equal(inserted.state, State.PENDING)
        assert.equal(inserted.username, 'alice') // lowercased
        assert.equal(inserted.apiKey, 'generated-key')
        assert.deepEqual(inserted.instance, {id: 'i-1', host: 'host-1'})
        assert.deepEqual(inserted.creationTime, fixedClock())
        assert.deepEqual(inserted.updateTime, fixedClock())
        assert.equal(result.id, inserted.id)
    })

    test('emits WorkerSessionRequested with the api_key stripped, so budget bills from creationTime', async () => {
        const {mgr, events, repo} = build()

        await mgr.requestSession({username: 'Alice', workerType: SANDBOX, instanceType: 'T3aSmall'})

        assert.equal(events.emitWorkerSessionRequested.mock.callCount(), 1)
        const {username, session} = events.emitWorkerSessionRequested.mock.calls[0].arguments[0]
        assert.equal(username, 'alice')
        assert.equal(session.id, repo.insert.mock.calls[0].arguments[0].id)
        assert.equal(session.instanceType, 'T3aSmall')
        assert.deepEqual(session.creationTime, fixedClock())
        assert.equal(session.apiKey, null)
    })

    test('does not emit WorkerSessionRequested when the session was refused', async () => {
        const budgetClient = makeBudgetClient({check: mock.fn(async () => ({exceeded: true, reason: 'INSTANCE_BUDGET'}))})
        const {mgr, events} = build({budgetClient})

        await assert.rejects(
            mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 'T3aSmall'})
        )

        assert.equal(events.emitWorkerSessionRequested.mock.callCount(), 0)
    })

    test('requestInstance runs BEFORE insert (api-key ordering, parity risk #3)', async () => {
        const order = []
        const instanceManager = makeInstanceManager({
            requestInstance: mock.fn(async () => {order.push('requestInstance'); return {id: 'i-1', host: 'h'}}),
        })
        const repo = makeRepo()
        repo.insert = mock.fn(async () => {order.push('insert')})
        const {mgr} = build({repo, instanceManager})
        await mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 'T3aSmall'})
        assert.deepEqual(order, ['requestInstance', 'insert'])
    })

    test('the live budget verdict wins over a stale locked-set — locked there, under budget here → session granted', async () => {
        const lockedUsers = makeLockedUsers(['a'])
        const {mgr, repo} = build({lockedUsers})
        assert.notEqual(
            await mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 'T3aSmall'}),
            undefined
        )
        assert.equal(repo.insert.mock.callCount(), 1)
    })

    for (const [reason, Expected] of [
        ['INSTANCE_BUDGET', InstanceBudgetExceeded],
        ['STORAGE_BUDGET', StorageBudgetExceeded],
        ['STORAGE_QUOTA', StorageQuotaExceeded],
    ]) {
        test(
            `budget says exceeded (${reason}) → ${Expected} propagates, no instance/insert happens`,
            async () => {
                const budgetClient = makeBudgetClient({check: mock.fn(async () => ({exceeded: true, reason}))})
                const {mgr, repo, instanceManager} = build({budgetClient})
                await assert.rejects(
                    mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 'T3aSmall'}),
                    Expected
                )
                assert.equal(instanceManager.requestInstance.mock.callCount(), 0)
                assert.equal(repo.insert.mock.callCount(), 0)
            }
        )
    }

    describe('budget module unreachable → fall back to the event-fed locked-users set', () => {

        test('locked in the fallback set → InstanceBudgetExceeded, no instance/insert happens', async () => {
            const lockedUsers = makeLockedUsers(['a'])
            const {mgr, repo, instanceManager} = build({lockedUsers, budgetClient: unreachable()})
            await assert.rejects(
                mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 'T3aSmall'}),
                InstanceBudgetExceeded
            )
            assert.deepEqual(callsOf(lockedUsers.isLocked), [['a']])
            assert.equal(instanceManager.requestInstance.mock.callCount(), 0)
            assert.equal(repo.insert.mock.callCount(), 0)
        })

        test('not locked in the fallback set → session granted (degrade, never block)', async () => {
            const lockedUsers = makeLockedUsers()
            const {mgr, repo} = build({lockedUsers, budgetClient: unreachable()})
            assert.notEqual(
                await mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 'T3aSmall'}),
                undefined
            )
            assert.deepEqual(callsOf(lockedUsers.isLocked), [['a']])
            assert.equal(repo.insert.mock.callCount(), 1)
        })
        const unreachable = () => makeBudgetClient({check: mock.fn(async () => {throw new Error('ECONNREFUSED')})})
    })

    test('no budgetClient wired at all → the locked-users set is still enforced', async () => {
        const lockedUsers = makeLockedUsers(['a'])
        const {mgr, repo} = build({lockedUsers, budgetClient: null})
        await assert.rejects(
            mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 'T3aSmall'}),
            InstanceBudgetExceeded
        )
        assert.equal(repo.insert.mock.callCount(), 0)
    })

    test('instance type outside the catalog → ClientException, no budget check, instance or insert', async () => {
        const {mgr, repo, instanceManager, budgetClient} = build()

        await assert.rejects(
            mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 'p5.48xlarge'}),
            ClientException
        )

        assert.equal(budgetClient.check.mock.callCount(), 0)
        assert.equal(instanceManager.requestInstance.mock.callCount(), 0)
        assert.equal(repo.insert.mock.callCount(), 0)
    })
})

describe('activatePendingSessionOnInstance', () => {
    test('PENDING on instance → ACTIVE + WorkerSessionActivated with api_key NULL', async () => {
        const repo = makeRepo({
            sessionOnInstance: () => session({state: State.PENDING}),
            activateSession: () => session({state: State.ACTIVE}),
        })
        const {mgr, events} = build({repo})

        await mgr.activatePendingSessionOnInstance('i-1')

        assert.deepEqual(callsOf(repo.sessionOnInstance), [['i-1', [State.PENDING]]])
        assert.equal(events.emitWorkerSessionActivated.mock.callCount(), 1)
        const payload = events.emitWorkerSessionActivated.mock.calls[0].arguments[0]
        assert.equal(payload.username, 'alice')
        assert.equal(payload.session.state, State.ACTIVE)
        assert.equal(payload.session.apiKey, null) // stripped (parity risk #7)
    })

    // Provisioning can take many minutes, and a session that took eight to come up would
    // otherwise reach ACTIVE with 22 minutes of its 30-minute lease left.
    test('the startup lease is re-ratcheted from activation, not from the request', async () => {
        const repo = makeRepo({
            sessionOnInstance: () => session({state: State.PENDING}),
            activateSession: () => session({state: State.ACTIVE}),
        })
        const {mgr} = build({repo})
        await mgr.activatePendingSessionOnInstance('i-1')
        assert.deepEqual(callsOf(repo.activateSession), [['s-1', 30]])
    })

    test('no pending session → no-op (no activation, no event)', async () => {
        const repo = makeRepo({sessionOnInstance: () => null})
        const {mgr, events} = build({repo})
        await mgr.activatePendingSessionOnInstance('i-1')
        assert.equal(repo.activateSession.mock.callCount(), 0)
        assert.equal(events.emitWorkerSessionActivated.mock.callCount(), 0)
    })

    // The transition is guarded, so only the caller whose UPDATE changed a row announces it.
    test('losing the guarded transition announces nothing', async () => {
        const repo = makeRepo({
            sessionOnInstance: () => session({state: State.PENDING}),
            activateSession: () => null,
        })
        const {mgr, events} = build({repo})
        await mgr.activatePendingSessionOnInstance('i-1')
        assert.equal(events.emitWorkerSessionActivated.mock.callCount(), 0)
    })
})

describe('closeSession', () => {
    test('two-step: update(CLOSED) THEN releaseInstance, then WorkerSessionClosed', async () => {
        const order = []
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        repo.update = mock.fn(async s => { order.push(`update:${s.state}`); return true })
        const instanceManager = makeInstanceManager({
            releaseInstance: mock.fn(async id => {order.push(`release:${id}`)}),
        })
        const {mgr, events} = build({repo, instanceManager})

        await mgr.closeSession({sessionId: 's-1'})

        assert.deepEqual(order, ['update:CLOSED', 'release:i-1'])
        assert.deepEqual(
            callsOf(events.emitWorkerSessionClosed),
            [[{username: 'alice', sessionId: 's-1'}]]
        )
    })

    test('ownership check throws Unauthorized for wrong user (no update/release)', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        const {mgr, instanceManager, events} = build({repo})
        await assert.rejects(
            mgr.closeSession({sessionId: 's-1', username: 'mallory'}),
            /Session not owned by user/
        )
        assert.equal(repo.update.mock.callCount(), 0)
        assert.equal(instanceManager.releaseInstance.mock.callCount(), 0)
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 0)
    })

    // Releasing twice would drop a claim the instance's next session may already hold.
    test('closed concurrently after it was read → neither releases nor emits', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        repo.update = mock.fn(async () => false)
        const {mgr, instanceManager, events} = build({repo})
        await mgr.closeSession({sessionId: 's-1'})
        assert.equal(instanceManager.releaseInstance.mock.callCount(), 0)
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 0)
    })

    test('already CLOSED → no-op (no update/release/event)', async () => {
        const repo = makeRepo({getSession: () => session({state: State.CLOSED})})
        const {mgr, instanceManager, events} = build({repo})
        await mgr.closeSession({sessionId: 's-1'})
        assert.equal(repo.update.mock.callCount(), 0)
        assert.equal(instanceManager.releaseInstance.mock.callCount(), 0)
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 0)
    })

    test('a session of the retired task-executor type is closed and its instance released', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE, workerType: 'task-executor'})})
        const {mgr, instanceManager, events} = build({repo})

        await mgr.closeSession({sessionId: 's-1'})

        assert.partialDeepStrictEqual(callsOf(repo.update), [[{state: State.CLOSED}]])
        assert.deepEqual(callsOf(instanceManager.releaseInstance), [['i-1']])
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 1)
    })

    test('matching owner allowed', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        const {mgr, events} = build({repo})
        await mgr.closeSession({sessionId: 's-1', username: 'alice'})
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 1)
    })
})

describe('closeSessionOnInstance', () => {
    test('finds PENDING|ACTIVE session on instance → closes it', async () => {
        const repo = makeRepo({
            sessionOnInstance: () => session({state: State.PENDING}),
            getSession: () => session({state: State.PENDING}),
        })
        const {mgr, instanceManager, events} = build({repo})
        await mgr.closeSessionOnInstance('i-1')
        assert.deepEqual(callsOf(repo.sessionOnInstance), [['i-1', [State.PENDING, State.ACTIVE]]])
        assert.ok(repo.update.mock.callCount() > 0)
        assert.deepEqual(callsOf(instanceManager.releaseInstance), [['i-1']])
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 1)
    })

    test('no session on instance → no-op', async () => {
        const repo = makeRepo({sessionOnInstance: () => null})
        const {mgr, events} = build({repo})
        await mgr.closeSessionOnInstance('i-1')
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 0)
    })
})

describe('closeUserSessions', () => {
    test('closes each PENDING/ACTIVE session (update + release + event per session)', async () => {
        const a = session({id: 's-a', instance: {id: 'i-a', host: 'h'}})
        const b = session({id: 's-b', instance: {id: 'i-b', host: 'h'}})
        const repo = makeRepo({userSessions: () => [a, b]})
        const {mgr, instanceManager, events} = build({repo})
        await mgr.closeUserSessions('alice')
        assert.deepEqual(callsOf(repo.userSessions), [['alice', [State.PENDING, State.ACTIVE]]])
        assert.deepEqual(callsOf(instanceManager.releaseInstance), [['i-a'], ['i-b']])
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 2)
    })

    test('per-session isolation: one failure does not abort the rest', async () => {
        const a = session({id: 's-a', instance: {id: 'i-a', host: 'h'}})
        const b = session({id: 's-b', instance: {id: 'i-b', host: 'h'}})
        const repo = makeRepo({userSessions: () => [a, b]})
        const instanceManager = makeInstanceManager({
            releaseInstance: mock.fn(async id => {if (id === 'i-a') throw new Error('boom')}),
        })
        const {mgr, events} = build({repo, instanceManager})
        await mgr.closeUserSessions('alice')
        // second session still closed + emitted despite the first failing
        assert.deepEqual(
            callsOf(events.emitWorkerSessionClosed),
            [[{username: 'alice', sessionId: 's-b'}]]
        )
    })
})

describe('closeTimedOutSessions', () => {
    test('closes each timed-out session, isolated', async () => {
        const a = session({id: 's-a', state: State.ACTIVE, instance: {id: 'i-a', host: 'h'}})
        const b = session({id: 's-b', state: State.PENDING, instance: {id: 'i-b', host: 'h'}})
        const byId = {'s-a': a, 's-b': b}
        const repo = makeRepo({timedOutSessions: () => [a, b], getSession: id => byId[id]})
        const {mgr, events} = build({repo})
        await mgr.closeTimedOutSessions()
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 2)
    })

    test('one failure does not abort the rest', async () => {
        const a = session({id: 's-a', state: State.ACTIVE, instance: {id: 'i-a', host: 'h'}})
        const b = session({id: 's-b', state: State.ACTIVE, instance: {id: 'i-b', host: 'h'}})
        const byId = {'s-a': a, 's-b': b}
        const repo = makeRepo({timedOutSessions: () => [a, b], getSession: id => byId[id]})
        const instanceManager = makeInstanceManager({
            releaseInstance: mock.fn(async id => {if (id === 'i-a') throw new Error('boom')}),
        })
        const {mgr, events} = build({repo, instanceManager})
        await mgr.closeTimedOutSessions()
        assert.deepEqual(
            callsOf(events.emitWorkerSessionClosed),
            [[{username: 'alice', sessionId: 's-b'}]]
        )
    })
})

describe('closeSessionsWithoutInstance', () => {
    // The verdict rules live in command/closeSessionsWithoutInstance.test.js; this asserts the
    // manager hands the caller's tracker through to them.
    test('loads ACTIVE only, closes a confirmed-missing session (no releaseInstance)', async () => {
        const a = session({id: 's-a', state: State.ACTIVE})
        const repo = makeRepo({sessions: () => [a]})
        const instanceManager = makeInstanceManager({
            sessionsWithoutInstance: mock.fn(async () => [{session: a, status: 'MISSING'}]),
        })
        const {mgr, events} = build({repo, instanceManager})
        const tracker = createMissingInstanceTracker({missesBeforeClose: 2, clock: fixedClock})
        await mgr.closeSessionsWithoutInstance(tracker)
        await mgr.closeSessionsWithoutInstance(tracker)
        assert.deepEqual(callsOf(repo.sessions), [[[State.ACTIVE]], [[State.ACTIVE]]])
        assert.equal(repo.update.mock.callCount(), 1)
        assert.equal(instanceManager.releaseInstance.mock.callCount(), 0)
        assert.deepEqual(
            callsOf(events.emitWorkerSessionClosed),
            [[{username: 'alice', sessionId: 's-a'}]]
        )
    })
})

describe('removeOrphanedContainers', () => {
    test('loads PENDING and ACTIVE sessions and passes them to the instanceManager', async () => {
        const open = [
            session({id: 's-a', state: State.PENDING}),
            session({id: 's-b', state: State.ACTIVE, instance: {id: 'i-2', host: 'host-2'}}),
        ]
        const repo = makeRepo({sessions: () => open})
        const instanceManager = makeInstanceManager()
        const {mgr} = build({repo, instanceManager})
        await mgr.removeOrphanedContainers()
        assert.deepEqual(callsOf(repo.sessions), [[[State.PENDING, State.ACTIVE]]])
        assert.deepEqual(callsOf(instanceManager.removeOrphanedContainers), [[open]])
    })
})

describe('releaseUnusedInstances', () => {
    test('loads PENDING+ACTIVE and delegates to instanceManager', async () => {
        const sessions = [session({id: 's-a'})]
        const repo = makeRepo({sessions: () => sessions})
        const {mgr, instanceManager} = build({repo})
        await mgr.releaseUnusedInstances(5, 'MINUTES')
        assert.deepEqual(callsOf(repo.sessions), [[[State.PENDING, State.ACTIVE]]])
        assert.deepEqual(
            callsOf(instanceManager.releaseUnusedInstances),
            [[sessions, 5, 'MINUTES']]
        )
    })
})

describe('reclaimStaleClaims', () => {
    test('loads PENDING+ACTIVE and delegates to instanceManager', async () => {
        const sessions = [session({id: 's-a'})]
        const repo = makeRepo({sessions: () => sessions})
        const {mgr, instanceManager} = build({repo})
        await mgr.reclaimStaleClaims(10 * 60 * 1000)
        assert.deepEqual(callsOf(repo.sessions), [[[State.PENDING, State.ACTIVE]]])
        assert.deepEqual(callsOf(instanceManager.reclaimStaleClaims), [[sessions, 10 * 60 * 1000]])
    })
})

describe('heartbeat', () => {
    // A bare beat extends NOTHING: the gateway beats for every cached session whether or not
    // anyone is using it, and reading that as liveness is what kept forgotten tabs alive.
    test('a bare heartbeat bumps update_time but never the deadline', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        const {mgr} = build({repo})
        const result = await mgr.heartbeat({sessionId: 's-1'})
        assert.equal(repo.update.mock.callCount(), 1)
        assert.equal(result.state, State.ACTIVE)
    })

    test('PENDING → repo.update NOT called (no bump)', async () => {
        const repo = makeRepo({getSession: () => session({state: State.PENDING})})
        const {mgr} = build({repo})
        await mgr.heartbeat({sessionId: 's-1'})
        assert.equal(repo.update.mock.callCount(), 0)
    })

    test('ownership check throws for wrong user', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        const {mgr} = build({repo})
        await assert.rejects(
            mgr.heartbeat({sessionId: 's-1', username: 'mallory'}),
            /Session not owned by user/
        )
    })

    test('CLOSED → 404 (gateway prunes its cache on heartbeat 404)', async () => {
        const repo = makeRepo({getSession: () => session({state: State.CLOSED})})
        const {mgr} = build({repo})
        await assert.rejects(mgr.heartbeat({sessionId: 's-1'}), {statusCode: 404})
        assert.equal(repo.update.mock.callCount(), 0)
    })

    test('closed between its read and its write → 404', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        repo.update = mock.fn(async () => false)
        const {mgr} = build({repo})
        await assert.rejects(mgr.heartbeat({sessionId: 's-1', interaction: true}), {statusCode: 404})
        assert.equal(repo.extendSession.mock.callCount(), 0)
    })

    test('unknown session → 404 (not the plain-Error 500)', async () => {
        const repo = makeRepo({getSession: () => {
            throw new Error('Non-existing worker session: s-x')
        }})
        const {mgr} = build({repo})
        await assert.rejects(mgr.heartbeat({sessionId: 's-x'}), {statusCode: 404})
    })
})

describe('extensions', () => {

    // The keepAlive slider REPLACES the deadline — the one write that is not a ratchet, because
    // the cursor shows the current keep-alive and dragging it means "make it this much".
    test('the slider SETS the deadline to the requested hours', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.setSessionTimeoutHours({sessionId: 's-1', hours: 3})
        assert.deepEqual(callsOf(repo.setSessionTimeout), [[{sessionId: 's-1', minutes: 180}]])
        assert.equal(repo.extendSession.mock.callCount(), 0)
    })

    // The whole point of the change: it may shorten as well as lengthen. Only automatic signals
    // are barred from shortening.
    test('the slider can shorten a session', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.setSessionTimeoutHours({sessionId: 's-1', hours: 0.5})
        assert.equal(repo.setSessionTimeout.mock.calls[0].arguments[0].minutes, 30)
    })

    test('a negative slider value floors at zero rather than reaching into the past', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.setSessionTimeoutHours({sessionId: 's-1', hours: -5})
        assert.equal(repo.setSessionTimeout.mock.calls[0].arguments[0].minutes, 0)
    })

    test('each event carries its own magnitude', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.openExtension({sessionId: 's-1'})
        await mgr.manualExtension({sessionId: 's-1'})
        // Each ratchet names itself, so the debug log says WHY a deadline moved.
        assert.deepEqual(
            callsOf(repo.extendSession).map(([{minutes, reason}]) => [minutes, reason]),
            [[15, 'opened'], [19, 'extend-button']]
        )
    })

    test('ownership check throws for wrong user', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await assert.rejects(
            mgr.setSessionTimeoutHours({sessionId: 's-1', hours: 1, username: 'x'}),
            /Session not owned by user/
        )
    })

    test('unknown session → 404', async () => {
        const {mgr} = build({repo: makeRepo()})
        await assert.rejects(
            mgr.setSessionTimeoutHours({sessionId: 's-x', hours: 1}),
            {statusCode: 404}
        )
    })

    // Dismiss means "I saw it, don't email me" and nothing else — the session still closes at
    // T+grace, because an easy misclick must not be read as consent to close early.
    test('dismiss does not extend anything', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.dismissExpiryNotification({sessionId: 's-1', username: 'alice'})
        assert.deepEqual(callsOf(repo.dismissNotification), [['s-1', 'alice']])
        assert.equal(repo.extendSession.mock.callCount(), 0)
    })

    // The mail's terminate link is the [Terminate now] button, reached without a SEPAL session.
    // It must do the whole close — a row marked CLOSED with the instance still running is a
    // machine nobody owns and nobody stops paying for.
    test('the terminate link closes the row AND releases the instance', async () => {
        const repo = activeRepo()
        const instanceManager = makeInstanceManager()
        const events = makeEvents()
        const {mgr} = build({repo, instanceManager, events})
        const notifiedTime = new Date('2026-01-01T11:00:00Z')
        assert.equal(await mgr.redeemTermination({sessionId: 's-1', notifiedTime}), true)
        assert.deepEqual(callsOf(repo.redeemTermination), [[{sessionId: 's-1', notifiedTime}]])
        assert.deepEqual(callsOf(instanceManager.releaseInstance), [['i-1']])
        assert.deepEqual(
            callsOf(events.emitWorkerSessionClosed),
            [[{username: 'alice', sessionId: 's-1'}]]
        )
    })

    // Zero rows changed means the session was rescued between the mail and the click. Releasing
    // the instance anyway would destroy the very session the guard just protected.
    test('a spent terminate token releases nothing', async () => {
        const repo = activeRepo({redeemTermination: () => false})
        const instanceManager = makeInstanceManager()
        const events = makeEvents()
        const {mgr} = build({repo, instanceManager, events})
        assert.equal(await mgr.redeemTermination({
            sessionId: 's-1', notifiedTime: new Date('2026-01-01T11:00:00Z')}), false)
        assert.equal(instanceManager.releaseInstance.mock.callCount(), 0)
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 0)
    })

    // The management page names the instance the way every other surface does — the number from
    // the SSH menu plus the type — so a user reading the mail, the notification and the page all
    // know it is the same machine.
    test('instanceDescription gives the derived name, the SSH-menu ordinal and the type', async () => {
        const repo = activeRepo({
            userSessions: () => [{id: 's-0'}, {id: 's-1'}, {id: 's-2'}],
        })
        const {mgr} = build({repo})
        assert.deepEqual(await mgr.instanceDescription('s-1'), {
            name: instanceName('s-1'), ordinal: 2, typeName: 't1', hourlyCost: 0.02
        })
    })

    // The name is what a user reads; the ordinal is what they type in the SSH menu. Losing either
    // breaks one of the two interfaces.
    test('instanceDescription names the session even when it is not in the open list', async () => {
        const repo = activeRepo({userSessions: () => []})
        const {mgr} = build({repo})
        const {name, ordinal} = await mgr.instanceDescription('s-1')
        assert.equal(name, instanceName('s-1'))
        assert.equal(ordinal, null)
    })

    test('instanceDescription is null for a session that is gone', async () => {
        const repo = makeRepo({getSession: () => { throw new Error('gone') }})
        const {mgr} = build({repo})
        assert.equal(await mgr.instanceDescription('s-1'), null)
    })

    test('the email link redeems through the notified_time-guarded write', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        const notifiedTime = new Date('2026-01-01T11:00:00Z')
        await mgr.redeemExtension({sessionId: 's-1', notifiedTime})
        assert.deepEqual(
            callsOf(repo.redeemExtension),
            [[{sessionId: 's-1', notifiedTime, minutes: 20}]]
        )
    })
    const activeRepo = (canned = {}) => makeRepo({getSession: () => session({state: State.ACTIVE}), ...canned})
})

describe('queries', () => {
    test('generateUserSessionReport shape {sessions, instanceTypes} (no spending — pushed by budget ws)', async () => {
        const sessions = [session({id: 's-a', state: State.ACTIVE})]
        const repo = makeRepo({userSessions: () => sessions})
        const budgetClient = makeBudgetClient()
        const appRepo = makeAppRepo({appsForSessions: async () => new Map()})
        const {mgr} = build({repo, budgetClient, appRepo})
        const report = await mgr.generateUserSessionReport({username: 'alice', workerType: SANDBOX})
        // No sampler registries wired here, so nothing was observed about this session.
        assert.deepEqual(report.sessions, [
            {...sessions[0], apps: [], usage: null, terminals: 0, verdict: 'unknown'}
        ])
        assert.deepEqual(report.instanceTypes, [{id: 'T3aSmall'}])
        assert.ok(!('spending' in Object(report)))
        assert.equal(budgetClient.spending.mock.callCount(), 0)
    })

    test('generateUserSessionReport attaches apps to each session from appRepo.appsForSessions', async () => {
        const sessions = [session({id: 's-a', state: State.ACTIVE})]
        const repo = makeRepo({userSessions: () => sessions})
        const apps = [{path: '/sandbox/shiny/foo', label: 'Foo'}]
        const appRepo = makeAppRepo({appsForSessions: mock.fn(async () => new Map([['s-a', apps]]))})
        const {mgr} = build({repo, appRepo})
        const report = await mgr.generateUserSessionReport({username: 'alice', workerType: SANDBOX})
        assert.deepEqual(callsOf(appRepo.appsForSessions), [[['s-a']]])
        assert.deepEqual(report.sessions[0].apps, apps)
    })

    test('findSessionByApiKey passes through repo', async () => {
        const found = {sessionId: 's-1', username: 'alice', workerType: SANDBOX}
        const repo = makeRepo({findSessionByApiKey: k => (k === 'key' ? found : null)})
        const {mgr} = build({repo})
        assert.deepEqual(await mgr.findSessionByApiKey('key'), found)
        assert.equal(await mgr.findSessionByApiKey('nope'), null)
    })

    test('userWorkerSessions passes username/states/workerType', async () => {
        const repo = makeRepo({userSessions: () => [session({id: 's-a'})]})
        const {mgr} = build({repo})
        await mgr.userWorkerSessions({username: 'alice', states: [State.ACTIVE], workerType: SANDBOX})
        assert.deepEqual(callsOf(repo.userSessions), [['alice', [State.ACTIVE], SANDBOX]])
    })

    // The username reaches the repository as given: worker_session.username is ascii_general_ci,
    // so the lookup matches any case and a LOWER() here would only suppress the index.
    test('mostRecentlyClosedSession passes the username through unchanged', async () => {
        const repo = makeRepo({mostRecentlyClosedSession: u => ({user: u})})
        const {mgr} = build({repo})
        const result = await mgr.mostRecentlyClosedSession('Alice')
        assert.deepEqual(result, {user: 'Alice'})
    })

    test('mostRecentlyClosedSessionByUser passes through', async () => {
        const repo = makeRepo({mostRecentlyClosedSessionByUser: () => ({alice: new Date()})})
        const {mgr} = build({repo})
        assert.deepEqual(Object.keys(await mgr.mostRecentlyClosedSessionByUser()), ['alice'])
    })

    test('allOpenSessions passes through repo, unscoped by username', async () => {
        const openList = [{username: 'alice', sessionId: 's-a', instanceType: 'T3aSmall', creationTime: new Date()}]
        const repo = makeRepo({allOpenSessions: () => openList})
        const {mgr} = build({repo})
        assert.equal(await mgr.allOpenSessions(), openList)
        assert.deepEqual(callsOf(repo.allOpenSessions), [[]])
    })
})

describe('associateApp', () => {
    const openSession = {id: 's-1', username: 'bob', state: 'ACTIVE'}

    it('associates an app with an owned open session and emits SessionAppAssociated', async () => {
        const appRepo = emptyAppRepo()
        const {mgr, events} = build({repo: appSessionRepo(), appRepo})
        const result = await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-1'})
        assert.deepEqual(callsOf(appRepo.associate), [[
            {username: 'bob', appPath: '/sandbox/shiny/foo', sessionId: 's-1', label: 'Foo', clientId: 'c-1'}
        ]])
        assert.deepEqual(result, {sessionId: 's-1', path: '/sandbox/shiny/foo', label: 'Foo'})
        assert.deepEqual(callsOf(events.emitSessionAppAssociated), [[
            {username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo', label: 'Foo'}
        ]])
    })

    it('is permanent: a live association on another open session wins over the request', async () => {
        const appRepo = emptyAppRepo()
        appRepo.userAppSessions = mock.fn(async () => [
            {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-OTHER', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
        ])
        const {mgr, events} = build({repo: appSessionRepo(), appRepo})
        const result = await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo'})
        assert.equal(appRepo.associate.mock.callCount(), 0)
        assert.deepEqual(result, {sessionId: 's-OTHER', path: '/sandbox/shiny/foo', label: 'Foo'})
        assert.equal(events.emitSessionAppAssociated.mock.callCount(), 0) // nothing changed
    })

    it('a winning association still transfers ownership to the requesting client', async () => {
        const appRepo = makeAppRepo({
            userAppSessions: mock.fn(async () => [
                {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-OTHER', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ])
        })
        const {mgr} = build({repo: appSessionRepo(), appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-2'})
        assert.deepEqual(
            callsOf(appRepo.setClient),
            [[{username: 'bob', appPath: '/sandbox/shiny/foo', clientId: 'c-2'}]]
        )
    })

    // Opening an app gives it its own lease, whether or not the association is new.
    it('opening an app ratchets the session it lands on', async () => {
        const appRepo = emptyAppRepo()
        const repo = appSessionRepo()
        const {mgr} = build({repo, appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo'})
        assert.deepEqual(callsOf(repo.extendSession), [[
            {sessionId: 's-1', minutes: 15, interaction: true, capHours: null, reason: 'opened'}
        ]])
    })

    it('re-opening an app ratchets the session that WON, not the one requested', async () => {
        const appRepo = makeAppRepo({
            userAppSessions: mock.fn(async () => [
                {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-OTHER', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ])
        })
        const repo = appSessionRepo()
        const {mgr} = build({repo, appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo'})
        assert.equal(repo.extendSession.mock.calls[0].arguments[0].sessionId, 's-OTHER')
    })

    it('a winning association keeps its owner when no clientId is given', async () => {
        const appRepo = makeAppRepo({
            userAppSessions: mock.fn(async () => [
                {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-OTHER', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ])
        })
        const {mgr} = build({repo: appSessionRepo(), appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo'})
        assert.equal(appRepo.setClient.mock.callCount(), 0)
    })

    // A ws reconnect re-asserts every open tab's association to refresh ownership. That is
    // machine-generated — nobody opened anything — so it must reach no ratchet, exactly as a
    // proxied request does not.
    it('a reconnect re-assert refreshes ownership without ratcheting the deadline', async () => {
        const appRepo = makeAppRepo({
            userAppSessions: mock.fn(async () => [
                {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-1', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ])
        })
        const repo = appSessionRepo()
        const {mgr} = build({repo, appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-2', reassert: true})
        assert.deepEqual(
            callsOf(appRepo.setClient),
            [[{username: 'bob', appPath: '/sandbox/shiny/foo', clientId: 'c-2'}]]
        )
        assert.equal(repo.extendSession.mock.callCount(), 0)
    })

    // The old clientId's clientDown usually sweeps the association before the reconnect lands, so
    // the re-assert re-creates it. That path must not ratchet either.
    it('a reconnect re-assert re-creating a swept association does not ratchet', async () => {
        const appRepo = emptyAppRepo()
        const repo = appSessionRepo()
        const {mgr, events} = build({repo, appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-2', reassert: true})
        assert.ok(appRepo.associate.mock.callCount() > 0)
        assert.ok(events.emitSessionAppAssociated.mock.callCount() > 0)
        assert.equal(repo.extendSession.mock.callCount(), 0)
    })

    it('rejects a foreign session with status 403', async () => {
        const {mgr} = build({repo: makeRepo({getSession: () => ({...openSession, username: 'alice'})}), appRepo: emptyAppRepo()})
        await assert.rejects(
            mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/x'}),
            {statusCode: 403}
        )
    })

    it('rejects a closed session with status 404', async () => {
        const {mgr} = build({repo: makeRepo({getSession: () => ({...openSession, state: 'CLOSED'})}), appRepo: emptyAppRepo()})
        await assert.rejects(
            mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/x'}),
            {statusCode: 404}
        )
    })
    const emptyAppRepo = () => makeAppRepo()
    // Opening an app is an interaction, so association reaches the ratchet — these tests use a
    // bare repo literal rather than makeRepo().
    const appSessionRepo = () => makeRepo({getSession: () => openSession})
})

describe('dissociateApp', () => {
    it('deletes the association and emits SessionAppDissociated with session, owner and requester', async () => {
        const appRepo = makeAppRepo({
            dissociate: mock.fn(async () => ({sessionId: 's-1', clientId: 'c-owner'})),
        })
        const {mgr, events} = build({appRepo})
        assert.equal(
            await mgr.dissociateApp({username: 'bob', appPath: '/sandbox/shiny/foo', requestingClientId: 'c-req'}),
            true
        )
        assert.deepEqual(
            callsOf(appRepo.dissociate),
            [[{username: 'bob', appPath: '/sandbox/shiny/foo'}]]
        )
        assert.deepEqual(callsOf(events.emitSessionAppDissociated), [[
            {username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo', clientId: 'c-owner', requestingClientId: 'c-req'}
        ]])
    })

    it('is idempotent: no association → no delete effect, no event', async () => {
        const appRepo = makeAppRepo()
        const {mgr, events} = build({appRepo})
        assert.equal(
            await mgr.dissociateApp({username: 'bob', appPath: '/sandbox/shiny/foo'}),
            false
        )
        assert.equal(events.emitSessionAppDissociated.mock.callCount(), 0)
    })
})

describe('dissociateAppsForClient', () => {
    it('dissociates every app the client owned, one event per app, requester = the client', async () => {
        const appRepo = makeAppRepo({
            dissociateForClient: mock.fn(async () => [
                {appPath: '/sandbox/shiny/foo', sessionId: 's-1'},
                {appPath: '/sandbox/jupyter/lab', sessionId: 's-2'},
            ])
        })
        const {mgr, events} = build({appRepo})
        await mgr.dissociateAppsForClient({username: 'bob', clientId: 'c-1'})
        assert.deepEqual(
            callsOf(appRepo.dissociateForClient),
            [[{username: 'bob', clientId: 'c-1'}]]
        )
        assert.equal(events.emitSessionAppDissociated.mock.callCount(), 2)

        assert.deepEqual(callsOf(events.emitSessionAppDissociated), [[
            {username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo', clientId: 'c-1', requestingClientId: 'c-1'}
        ], [
            {username: 'bob', sessionId: 's-2', path: '/sandbox/jupyter/lab', clientId: 'c-1', requestingClientId: 'c-1'}
        ]])
    })

    it('does nothing without a clientId or username', async () => {
        const appRepo = makeAppRepo()
        const {mgr} = build({appRepo})
        assert.deepEqual(await mgr.dissociateAppsForClient({username: 'bob'}), [])
        assert.deepEqual(await mgr.dissociateAppsForClient({clientId: 'c-1'}), [])
        assert.equal(appRepo.dissociateForClient.mock.callCount(), 0)
    })
})

describe('registerInstanceManagerHooks', () => {
    test('InstanceProvisioned → activate pending session', async () => {
        const repo = makeRepo({sessionOnInstance: () => session({state: State.PENDING})})
        const instanceManager = makeInstanceManager()
        const {mgr, events} = build({repo, instanceManager})
        mgr.registerInstanceManagerHooks()
        assert.ok(instanceManager.onInstanceActivated.mock.callCount() > 0)

        instanceManager._fireActivated({id: 'i-1', host: 'h'})
        await new Promise(r => setImmediate(r)) // let the async handler settle
        assert.equal(events.emitWorkerSessionActivated.mock.callCount(), 1)
        assert.equal(
            events.emitWorkerSessionActivated.mock.calls[0].arguments[0].session.apiKey,
            null
        )
    })

    test('FailedToProvisionInstance → close session on instance', async () => {
        const repo = makeRepo({
            sessionOnInstance: () => session({state: State.PENDING}),
            getSession: () => session({state: State.PENDING}),
        })
        const instanceManager = makeInstanceManager()
        const {mgr, events} = build({repo, instanceManager})
        mgr.registerInstanceManagerHooks()

        instanceManager._fireFailed({id: 'i-1', host: 'h'})
        await new Promise(r => setImmediate(r))
        assert.equal(events.emitWorkerSessionClosed.mock.callCount(), 1)
    })
})

const session = overrides => createWorkerSession({
    id: 's-1',
    state: State.PENDING,
    username: 'alice',
    workerType: SANDBOX,
    instanceType: 'T3aSmall',
    instance: {id: 'i-1', host: 'host-1'},
    creationTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    apiKey: 'secret-key',
    ...overrides,
})

// In-memory repo mock: records calls + serves canned reads.
const makeRepo = (canned = {}) => {
    const calls = []
    const record = (name, ...args) => calls.push({name, args})
    return {
        calls,
        insert: mock.fn(async s => record('insert', s)),
        update: mock.fn(async s => { record('update', s); return true }),
        getSession: mock.fn(async id => {
            record('getSession', id)
            if (canned.getSession) return canned.getSession(id)
            throw new Error(`Non-existing worker session: ${id}`)
        }),
        userSessions: mock.fn(async (...args) => {
            record('userSessions', ...args)
            return canned.userSessions ? canned.userSessions(...args) : []
        }),
        sessions: mock.fn(async states => {
            record('sessions', states)
            return canned.sessions ? canned.sessions(states) : []
        }),
        timedOutSessions: mock.fn(async () => {
            record('timedOutSessions')
            return canned.timedOutSessions ? canned.timedOutSessions() : []
        }),
        sessionOnInstance: mock.fn(async (instanceId, states) => {
            record('sessionOnInstance', instanceId, states)
            return canned.sessionOnInstance ? canned.sessionOnInstance(instanceId, states) : null
        }),
        findSessionByApiKey: mock.fn(async apiKey => canned.findSessionByApiKey?.(apiKey) ?? null),
        mostRecentlyClosedSessionByUser: mock.fn(async () => canned.mostRecentlyClosedSessionByUser?.() ?? {}),
        mostRecentlyClosedSession: mock.fn(async u => canned.mostRecentlyClosedSession?.(u) ?? {}),
        allOpenSessions: mock.fn(async () => canned.allOpenSessions ? canned.allOpenSessions() : []),
        activateSession: mock.fn(async (id, leaseMinutes) => {
            record('activateSession', id, leaseMinutes)
            return canned.activateSession
                ? canned.activateSession(id, leaseMinutes)
                : (canned.sessionOnInstance ? {...canned.sessionOnInstance('i-1', ['PENDING']), state: 'ACTIVE'} : null)
        }),
        extendSession: mock.fn(async args => {
            record('extendSession', args)
            return canned.extendSession ? canned.extendSession(args) : true
        }),
        setSessionTimeout: mock.fn(async args => {
            record('setSessionTimeout', args)
            return canned.setSessionTimeout ? canned.setSessionTimeout(args) : true
        }),
        expiredSessions: mock.fn(async () => canned.expiredSessions ? canned.expiredSessions() : []),
        notifyExpiry: mock.fn(async id => canned.notifyExpiry ? canned.notifyExpiry(id) : true),
        markEmailed: mock.fn(async (...args) => canned.markEmailed ? canned.markEmailed(...args) : true),
        dismissNotification: mock.fn(
            async (...args) => canned.dismissNotification ? canned.dismissNotification(...args) : true
        ),
        restartExpiryCycle: mock.fn(
            async (...args) => canned.restartExpiryCycle ? canned.restartExpiryCycle(...args) : true
        ),
        closeExpiredSession: mock.fn(
            async (...args) => canned.closeExpiredSession ? canned.closeExpiredSession(...args) : true
        ),
        redeemExtension: mock.fn(
            async (...args) => canned.redeemExtension ? canned.redeemExtension(...args) : true
        ),
        redeemTermination: mock.fn(
            async (...args) => canned.redeemTermination ? canned.redeemTermination(...args) : true
        ),
    }
}

const makeInstanceManager = (overrides = {}) => {
    let activatedCb = null
    let failedCb = null
    return {
        requestInstance: mock.fn(async () => ({id: 'i-1', host: 'host-1'})),
        releaseInstance: mock.fn(async () => undefined),
        releaseUnusedInstances: mock.fn(async () => undefined),
        reclaimStaleClaims: mock.fn(async () => undefined),
        sessionsWithoutInstance: mock.fn(async () => []),
        removeOrphanedContainers: mock.fn(async () => []),
        getInstanceTypes: mock.fn(() => [{id: 'T3aSmall'}]),
        onInstanceActivated: mock.fn(cb => {activatedCb = cb}),
        onFailedToProvisionInstance: mock.fn(cb => {failedCb = cb}),
        _fireActivated: instance => activatedCb(instance),
        _fireFailed: instance => failedCb(instance),
        ...overrides,
    }
}

const makeEvents = () => ({
    emitWorkerSessionRequested: mock.fn(),
    emitWorkerSessionActivated: mock.fn(),
    emitWorkerSessionClosed: mock.fn(),
    emitSessionAppAssociated: mock.fn(),
    emitSessionAppDissociated: mock.fn(),
    emitSessionChanged: mock.fn(),
    emitSessionExpiryNotified: mock.fn(),
    emitSessionExpiryClosed: mock.fn(),
})

// makeLockedUsers — a fake of the event-fed gate (../lockedUsers.js). `locked` seeds the
// initially-locked usernames; isLocked is a mock.fn so tests can assert the call.
const makeLockedUsers = (locked = []) => {
    const set = new Set(locked)
    return {
        isLocked: mock.fn(username => set.has(username)),
        onExceeded: mock.fn(({username}) => set.add(username)),
        onCleared: mock.fn(({username}) => set.delete(username)),
    }
}

// A zeroed Spending DTO, which some report tests still assert against.
const zeroedSpending = () => ({
    monthlyInstanceBudget: 0,
    monthlyInstanceSpending: 0,
    monthlyStorageBudget: 0,
    monthlyStorageSpending: 0,
    storageQuota: 0,
    storageUsed: 0,
    costPerGbMonth: 0,
    budgetUpdateRequest: null,
})
// makeBudgetClient — a fake of ../budgetClient.js. `check` is the authoritative pre-session
// verdict; the default answers "under budget".
const makeBudgetClient = (overrides = {}) => ({
    spending: mock.fn(async () => zeroedSpending()),
    check: mock.fn(async () => ({exceeded: false, reason: null})),
    ...overrides,
})

const fixedClock = () => new Date('2026-01-01T12:00:00Z')

// makeAppRepo — a fake of ../sessionAppRepository.js. Defaults to no associations / no live apps,
// so tests that don't care about app associations (most of them) are unaffected.
const makeAppRepo = (overrides = {}) => ({
    associate: mock.fn(async () => {}),
    setClient: mock.fn(async () => {}),
    userAppSessions: mock.fn(async () => []),
    appsForSessions: mock.fn(async () => new Map()),
    deleteForSession: mock.fn(async () => {}),
    dissociate: mock.fn(async () => null),
    dissociateForClient: mock.fn(async () => []),
    ...overrides,
})

const build = ({repo, appRepo, instanceManager, lockedUsers, budgetClient, events} = {}) => {
    const _repo = repo ?? makeRepo()
    const _appRepo = appRepo ?? makeAppRepo()
    const _im = instanceManager ?? makeInstanceManager()
    const _lockedUsers = lockedUsers ?? makeLockedUsers()
    // `null` is meaningful here (the "not wired" case) — only `undefined` gets the default.
    const _budgetClient = budgetClient === undefined ? makeBudgetClient() : budgetClient
    const _events = events ?? makeEvents()
    const mgr = createSessionManager({
        repo: _repo,
        appRepo: _appRepo,
        instanceManager: _im,
        lockedUsers: _lockedUsers,
        budgetClient: _budgetClient,
        clock: fixedClock,
        apiKeyGenerator: {generate: () => 'generated-key'},
        expiryPolicy,
        instanceTypeById: {T3aSmall: {name: 't3a.small', tag: 't1', hourlyCost: 0.02}},
        events: _events,
    })
    return {
        mgr, repo: _repo, appRepo: _appRepo, instanceManager: _im,
        lockedUsers: _lockedUsers, budgetClient: _budgetClient, events: _events,
    }
}

// The expiry policy the manager applies. Distinct magnitudes per event, so a test can tell WHICH
// ratchet fired from the minutes alone.
const expiryPolicy = {
    mode: 'enforce',
    startupLeaseMinutes: 30,
    openExtensionMinutes: 15,
    interactionExtensionMinutes: 16,
    busyExtensionMinutes: 17,
    manualExtensionMinutes: 19,
    emailExtensionMinutes: 20,
    maxUnattendedHours: 12,
    notificationVisibleMinutes: 5,
    graceMinutes: 60,
}
