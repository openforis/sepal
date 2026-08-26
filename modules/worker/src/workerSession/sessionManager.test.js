// Unit tests for the worker-session state machine (commands + queries + in-proc wiring), driven
// through the sessionManager surface with a mocked repo, mocked instanceManager, a fake
// budgetClient + lockedUsers gate, and injected event spies. No database.

import {jest} from '@jest/globals'

import {SANDBOX, TASK_EXECUTOR} from '../workerInstance/workerTypes.js'
import {InstanceBudgetExceeded, StorageBudgetExceeded, StorageQuotaExceeded} from './budgetErrors.js'
import {instanceName} from './instanceName.js'
import {createMissingInstanceTracker} from './missingInstanceTracker.js'
import {createSessionManager} from './sessionManager.js'
import {createWorkerSession, State} from './workerSession.js'

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
        insert: jest.fn(async s => record('insert', s)),
        update: jest.fn(async s => record('update', s)),
        getSession: jest.fn(async id => {
            record('getSession', id)
            if (canned.getSession) return canned.getSession(id)
            throw new Error(`Non-existing worker session: ${id}`)
        }),
        userSessions: jest.fn(async (...args) => {
            record('userSessions', ...args)
            return canned.userSessions ? canned.userSessions(...args) : []
        }),
        sessions: jest.fn(async states => {
            record('sessions', states)
            return canned.sessions ? canned.sessions(states) : []
        }),
        timedOutSessions: jest.fn(async () => {
            record('timedOutSessions')
            return canned.timedOutSessions ? canned.timedOutSessions() : []
        }),
        sessionOnInstance: jest.fn(async (instanceId, states) => {
            record('sessionOnInstance', instanceId, states)
            return canned.sessionOnInstance ? canned.sessionOnInstance(instanceId, states) : null
        }),
        findUsernameByApiKey: jest.fn(async apiKey => canned.findUsernameByApiKey?.(apiKey) ?? null),
        mostRecentlyClosedSessionByUser: jest.fn(async () => canned.mostRecentlyClosedSessionByUser?.() ?? {}),
        mostRecentlyClosedSession: jest.fn(async u => canned.mostRecentlyClosedSession?.(u) ?? {}),
        allOpenSessions: jest.fn(async () => canned.allOpenSessions ? canned.allOpenSessions() : []),
        activateSession: jest.fn(async (id, leaseMinutes) => {
            record('activateSession', id, leaseMinutes)
            return canned.activateSession
                ? canned.activateSession(id, leaseMinutes)
                : (canned.sessionOnInstance ? {...canned.sessionOnInstance('i-1', ['PENDING']), state: 'ACTIVE'} : null)
        }),
        extendSession: jest.fn(async args => {
            record('extendSession', args)
            return canned.extendSession ? canned.extendSession(args) : true
        }),
        setSessionTimeout: jest.fn(async args => {
            record('setSessionTimeout', args)
            return canned.setSessionTimeout ? canned.setSessionTimeout(args) : true
        }),
        expiredSessions: jest.fn(async () => canned.expiredSessions ? canned.expiredSessions() : []),
        notifyExpiry: jest.fn(async id => canned.notifyExpiry ? canned.notifyExpiry(id) : true),
        markEmailed: jest.fn(async (...args) => canned.markEmailed ? canned.markEmailed(...args) : true),
        dismissNotification: jest.fn(async (...args) => canned.dismissNotification ? canned.dismissNotification(...args) : true),
        restartExpiryCycle: jest.fn(async (...args) => canned.restartExpiryCycle ? canned.restartExpiryCycle(...args) : true),
        closeExpiredSession: jest.fn(async (...args) => canned.closeExpiredSession ? canned.closeExpiredSession(...args) : true),
        redeemExtension: jest.fn(async (...args) => canned.redeemExtension ? canned.redeemExtension(...args) : true),
        redeemTermination: jest.fn(async (...args) => canned.redeemTermination ? canned.redeemTermination(...args) : true),
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
    taskExtensionMinutes: 18,
    manualExtensionMinutes: 19,
    emailExtensionMinutes: 20,
    maxUnattendedHours: 12,
    notificationVisibleMinutes: 5,
    graceMinutes: 60,
}

const makeInstanceManager = (overrides = {}) => {
    let activatedCb = null
    let failedCb = null
    return {
        requestInstance: jest.fn(async () => ({id: 'i-1', host: 'host-1'})),
        releaseInstance: jest.fn(async () => undefined),
        releaseUnusedInstances: jest.fn(async () => undefined),
        sessionsWithoutInstance: jest.fn(async () => []),
        removeOrphanedContainers: jest.fn(async () => []),
        getInstanceTypes: jest.fn(() => [{id: 'T3aSmall'}]),
        onInstanceActivated: jest.fn(cb => {activatedCb = cb}),
        onFailedToProvisionInstance: jest.fn(cb => {failedCb = cb}),
        _fireActivated: instance => activatedCb(instance),
        _fireFailed: instance => failedCb(instance),
        ...overrides,
    }
}

const makeEvents = () => ({
    emitWorkerSessionRequested: jest.fn(),
    emitWorkerSessionActivated: jest.fn(),
    emitWorkerSessionClosed: jest.fn(),
    emitSessionAppAssociated: jest.fn(),
    emitSessionAppDissociated: jest.fn(),
    emitSessionChanged: jest.fn(),
    emitSessionExpiryNotified: jest.fn(),
    emitSessionExpiryClosed: jest.fn(),
})

// makeLockedUsers — a fake of the event-fed gate (../lockedUsers.js). `locked` seeds the
// initially-locked usernames; isLocked is a jest.fn so tests can assert the call.
const makeLockedUsers = (locked = []) => {
    const set = new Set(locked)
    return {
        isLocked: jest.fn(username => set.has(username)),
        onExceeded: jest.fn(({username}) => set.add(username)),
        onCleared: jest.fn(({username}) => set.delete(username)),
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
    spending: jest.fn(async () => zeroedSpending()),
    check: jest.fn(async () => ({exceeded: false, reason: null})),
    ...overrides,
})

const fixedClock = () => new Date('2026-01-01T12:00:00Z')

// makeAppRepo — a fake of ../sessionAppRepository.js. Defaults to no associations / no live apps,
// so tests that don't care about app associations (most of them) are unaffected.
const makeAppRepo = (overrides = {}) => ({
    associate: jest.fn(async () => {}),
    setClient: jest.fn(async () => {}),
    userAppSessions: jest.fn(async () => []),
    appsForSessions: jest.fn(async () => new Map()),
    deleteForSession: jest.fn(async () => {}),
    dissociate: jest.fn(async () => null),
    dissociateForClient: jest.fn(async () => []),
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
        instanceTypeById: {T3aSmall: {name: 't3a.small', hourlyCost: 0.02}},
        events: _events,
    })
    return {
        mgr, repo: _repo, appRepo: _appRepo, instanceManager: _im,
        lockedUsers: _lockedUsers, budgetClient: _budgetClient, events: _events,
    }
}

describe('requestSession', () => {
    test('SANDBOX: budget checked, api_key generated, instance requested, row inserted PENDING with instance', async () => {
        const {mgr, repo, instanceManager, budgetClient} = build()

        const result = await mgr.requestSession({username: 'Alice', workerType: SANDBOX, instanceType: 'T3aSmall'})

        expect(budgetClient.check).toHaveBeenCalledWith('Alice')
        expect(instanceManager.requestInstance).toHaveBeenCalledTimes(1)
        expect(repo.insert).toHaveBeenCalledTimes(1)
        const inserted = repo.insert.mock.calls[0][0]
        expect(inserted.state).toBe(State.PENDING)
        expect(inserted.username).toBe('alice') // lowercased
        expect(inserted.apiKey).toBe('generated-key')
        expect(inserted.instance).toEqual({id: 'i-1', host: 'host-1'})
        expect(inserted.creationTime).toEqual(fixedClock())
        expect(inserted.updateTime).toEqual(fixedClock())
        expect(result.id).toBe(inserted.id)
    })

    test('emits WorkerSessionRequested with the api_key stripped, so budget bills from creationTime', async () => {
        const {mgr, events, repo} = build()

        await mgr.requestSession({username: 'Alice', workerType: SANDBOX, instanceType: 'T3aSmall'})

        expect(events.emitWorkerSessionRequested).toHaveBeenCalledTimes(1)
        const {username, session} = events.emitWorkerSessionRequested.mock.calls[0][0]
        expect(username).toBe('alice')
        expect(session.id).toBe(repo.insert.mock.calls[0][0].id)
        expect(session.instanceType).toBe('T3aSmall')
        expect(session.creationTime).toEqual(fixedClock())
        expect(session.apiKey).toBeNull()
    })

    test('does not emit WorkerSessionRequested when the session was refused', async () => {
        const budgetClient = makeBudgetClient({check: jest.fn(async () => ({exceeded: true, reason: 'INSTANCE_BUDGET'}))})
        const {mgr, events} = build({budgetClient})

        await expect(mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 't'})).rejects.toThrow()

        expect(events.emitWorkerSessionRequested).not.toHaveBeenCalled()
    })

    test('TASK_EXECUTOR: api_key is null', async () => {
        const {mgr, repo} = build()
        await mgr.requestSession({username: 'bob', workerType: TASK_EXECUTOR, instanceType: 'T3aSmall'})
        expect(repo.insert.mock.calls[0][0].apiKey).toBeNull()
    })

    test('requestInstance runs BEFORE insert (api-key ordering, parity risk #3)', async () => {
        const order = []
        const instanceManager = makeInstanceManager({
            requestInstance: jest.fn(async () => {order.push('requestInstance'); return {id: 'i-1', host: 'h'}}),
        })
        const repo = makeRepo()
        repo.insert = jest.fn(async () => {order.push('insert')})
        const {mgr} = build({repo, instanceManager})
        await mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 't'})
        expect(order).toEqual(['requestInstance', 'insert'])
    })

    test('the live budget verdict wins over a stale locked-set — locked there, under budget here → session granted', async () => {
        const lockedUsers = makeLockedUsers(['a'])
        const {mgr, repo} = build({lockedUsers})
        await expect(mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 't'}))
            .resolves.toBeDefined()
        expect(repo.insert).toHaveBeenCalledTimes(1)
    })

    test.each([
        ['INSTANCE_BUDGET', InstanceBudgetExceeded],
        ['STORAGE_BUDGET', StorageBudgetExceeded],
        ['STORAGE_QUOTA', StorageQuotaExceeded],
    ])('budget says exceeded (%s) → %p propagates, no instance/insert happens', async (reason, Expected) => {
        const budgetClient = makeBudgetClient({check: jest.fn(async () => ({exceeded: true, reason}))})
        const {mgr, repo, instanceManager} = build({budgetClient})
        await expect(mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 't'}))
            .rejects.toThrow(Expected)
        expect(instanceManager.requestInstance).not.toHaveBeenCalled()
        expect(repo.insert).not.toHaveBeenCalled()
    })

    describe('budget module unreachable → fall back to the event-fed locked-users set', () => {
        const unreachable = () => makeBudgetClient({check: jest.fn(async () => {throw new Error('ECONNREFUSED')})})

        test('locked in the fallback set → InstanceBudgetExceeded, no instance/insert happens', async () => {
            const lockedUsers = makeLockedUsers(['a'])
            const {mgr, repo, instanceManager} = build({lockedUsers, budgetClient: unreachable()})
            await expect(mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 't'}))
                .rejects.toThrow(InstanceBudgetExceeded)
            expect(lockedUsers.isLocked).toHaveBeenCalledWith('a')
            expect(instanceManager.requestInstance).not.toHaveBeenCalled()
            expect(repo.insert).not.toHaveBeenCalled()
        })

        test('not locked in the fallback set → session granted (degrade, never block)', async () => {
            const lockedUsers = makeLockedUsers()
            const {mgr, repo} = build({lockedUsers, budgetClient: unreachable()})
            await expect(mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 't'}))
                .resolves.toBeDefined()
            expect(lockedUsers.isLocked).toHaveBeenCalledWith('a')
            expect(repo.insert).toHaveBeenCalledTimes(1)
        })
    })

    test('no budgetClient wired at all → the locked-users set is still enforced', async () => {
        const lockedUsers = makeLockedUsers(['a'])
        const {mgr, repo} = build({lockedUsers, budgetClient: null})
        await expect(mgr.requestSession({username: 'a', workerType: SANDBOX, instanceType: 't'}))
            .rejects.toThrow(InstanceBudgetExceeded)
        expect(repo.insert).not.toHaveBeenCalled()
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

        expect(repo.sessionOnInstance).toHaveBeenCalledWith('i-1', [State.PENDING])
        expect(events.emitWorkerSessionActivated).toHaveBeenCalledTimes(1)
        const payload = events.emitWorkerSessionActivated.mock.calls[0][0]
        expect(payload.username).toBe('alice')
        expect(payload.session.state).toBe(State.ACTIVE)
        expect(payload.session.apiKey).toBeNull() // stripped (parity risk #7)
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
        expect(repo.activateSession).toHaveBeenCalledWith('s-1', 30)
    })

    test('no pending session → no-op (no activation, no event)', async () => {
        const repo = makeRepo({sessionOnInstance: () => null})
        const {mgr, events} = build({repo})
        await mgr.activatePendingSessionOnInstance('i-1')
        expect(repo.activateSession).not.toHaveBeenCalled()
        expect(events.emitWorkerSessionActivated).not.toHaveBeenCalled()
    })

    // The transition is guarded, so only the caller whose UPDATE changed a row announces it.
    test('losing the guarded transition announces nothing', async () => {
        const repo = makeRepo({
            sessionOnInstance: () => session({state: State.PENDING}),
            activateSession: () => null,
        })
        const {mgr, events} = build({repo})
        await mgr.activatePendingSessionOnInstance('i-1')
        expect(events.emitWorkerSessionActivated).not.toHaveBeenCalled()
    })
})

describe('closeSession', () => {
    test('two-step: update(CLOSED) THEN releaseInstance, then WorkerSessionClosed', async () => {
        const order = []
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        repo.update = jest.fn(async s => {order.push(`update:${s.state}`)})
        const instanceManager = makeInstanceManager({
            releaseInstance: jest.fn(async id => {order.push(`release:${id}`)}),
        })
        const {mgr, events} = build({repo, instanceManager})

        await mgr.closeSession({sessionId: 's-1'})

        expect(order).toEqual(['update:CLOSED', 'release:i-1'])
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's-1'})
    })

    test('ownership check throws Unauthorized for wrong user (no update/release)', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        const {mgr, instanceManager, events} = build({repo})
        await expect(mgr.closeSession({sessionId: 's-1', username: 'mallory'}))
            .rejects.toThrow('Session not owned by user')
        expect(repo.update).not.toHaveBeenCalled()
        expect(instanceManager.releaseInstance).not.toHaveBeenCalled()
        expect(events.emitWorkerSessionClosed).not.toHaveBeenCalled()
    })

    test('already CLOSED → no-op (no update/release/event)', async () => {
        const repo = makeRepo({getSession: () => session({state: State.CLOSED})})
        const {mgr, instanceManager, events} = build({repo})
        await mgr.closeSession({sessionId: 's-1'})
        expect(repo.update).not.toHaveBeenCalled()
        expect(instanceManager.releaseInstance).not.toHaveBeenCalled()
        expect(events.emitWorkerSessionClosed).not.toHaveBeenCalled()
    })

    test('matching owner allowed', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        const {mgr, events} = build({repo})
        await mgr.closeSession({sessionId: 's-1', username: 'alice'})
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledTimes(1)
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
        expect(repo.sessionOnInstance).toHaveBeenCalledWith('i-1', [State.PENDING, State.ACTIVE])
        expect(repo.update).toHaveBeenCalled()
        expect(instanceManager.releaseInstance).toHaveBeenCalledWith('i-1')
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledTimes(1)
    })

    test('no session on instance → no-op', async () => {
        const repo = makeRepo({sessionOnInstance: () => null})
        const {mgr, events} = build({repo})
        await mgr.closeSessionOnInstance('i-1')
        expect(events.emitWorkerSessionClosed).not.toHaveBeenCalled()
    })
})

describe('closeUserSessions', () => {
    test('closes each PENDING/ACTIVE session (update + release + event per session)', async () => {
        const a = session({id: 's-a', instance: {id: 'i-a', host: 'h'}})
        const b = session({id: 's-b', instance: {id: 'i-b', host: 'h'}})
        const repo = makeRepo({userSessions: () => [a, b]})
        const {mgr, instanceManager, events} = build({repo})
        await mgr.closeUserSessions('alice')
        expect(repo.userSessions).toHaveBeenCalledWith('alice', [State.PENDING, State.ACTIVE])
        expect(instanceManager.releaseInstance).toHaveBeenCalledWith('i-a')
        expect(instanceManager.releaseInstance).toHaveBeenCalledWith('i-b')
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledTimes(2)
    })

    test('per-session isolation: one failure does not abort the rest', async () => {
        const a = session({id: 's-a', instance: {id: 'i-a', host: 'h'}})
        const b = session({id: 's-b', instance: {id: 'i-b', host: 'h'}})
        const repo = makeRepo({userSessions: () => [a, b]})
        const instanceManager = makeInstanceManager({
            releaseInstance: jest.fn(async id => {if (id === 'i-a') throw new Error('boom')}),
        })
        const {mgr, events} = build({repo, instanceManager})
        await mgr.closeUserSessions('alice')
        // second session still closed + emitted despite the first failing
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's-b'})
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
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledTimes(2)
    })

    test('one failure does not abort the rest', async () => {
        const a = session({id: 's-a', state: State.ACTIVE, instance: {id: 'i-a', host: 'h'}})
        const b = session({id: 's-b', state: State.ACTIVE, instance: {id: 'i-b', host: 'h'}})
        const byId = {'s-a': a, 's-b': b}
        const repo = makeRepo({timedOutSessions: () => [a, b], getSession: id => byId[id]})
        const instanceManager = makeInstanceManager({
            releaseInstance: jest.fn(async id => {if (id === 'i-a') throw new Error('boom')}),
        })
        const {mgr, events} = build({repo, instanceManager})
        await mgr.closeTimedOutSessions()
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's-b'})
    })

    // Heartbeats can only arrive while the worker is up: after an outage longer than the session
    // timeout EVERY open session looks stale, so the sweep must wait for the heartbeat senders to
    // catch up before believing the update times.
    test('stays inert within the startup grace period', async () => {
        const a = session({id: 's-a', state: State.ACTIVE, instance: {id: 'i-a', host: 'h'}})
        const repo = makeRepo({timedOutSessions: () => [a], getSession: () => a})
        const {mgr, events} = build({repo})
        // fixedClock is 12:00:00 — the worker started 1 minute ago, grace is 2 minutes.
        await mgr.closeTimedOutSessions({
            startTime: new Date('2026-01-01T11:59:00Z'),
            startupGraceMs: 2 * 60_000,
        })
        expect(repo.timedOutSessions).not.toHaveBeenCalled()
        expect(events.emitWorkerSessionClosed).not.toHaveBeenCalled()
    })

    test('sweeps once the startup grace period has elapsed', async () => {
        const a = session({id: 's-a', state: State.ACTIVE, instance: {id: 'i-a', host: 'h'}})
        const repo = makeRepo({timedOutSessions: () => [a], getSession: () => a})
        const {mgr, events} = build({repo})
        // Started 5 minutes before fixedClock — well past the 2-minute grace.
        await mgr.closeTimedOutSessions({
            startTime: new Date('2026-01-01T11:55:00Z'),
            startupGraceMs: 2 * 60_000,
        })
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's-a'})
    })
})

describe('closeSessionsWithoutInstance', () => {
    // The verdict rules live in command/closeSessionsWithoutInstance.test.js; this asserts the
    // manager hands the caller's tracker through to them.
    test('loads ACTIVE only, closes a confirmed-missing session (no releaseInstance)', async () => {
        const a = session({id: 's-a', state: State.ACTIVE})
        const repo = makeRepo({sessions: () => [a]})
        const instanceManager = makeInstanceManager({
            sessionsWithoutInstance: jest.fn(async () => [{session: a, status: 'MISSING'}]),
        })
        const {mgr, events} = build({repo, instanceManager})
        const tracker = createMissingInstanceTracker({missesBeforeClose: 2})
        await mgr.closeSessionsWithoutInstance(tracker)
        await mgr.closeSessionsWithoutInstance(tracker)
        expect(repo.sessions).toHaveBeenCalledWith([State.ACTIVE])
        expect(repo.update).toHaveBeenCalledTimes(1)
        expect(instanceManager.releaseInstance).not.toHaveBeenCalled()
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's-a'})
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
        expect(repo.sessions).toHaveBeenCalledWith([State.PENDING, State.ACTIVE])
        expect(instanceManager.removeOrphanedContainers).toHaveBeenCalledWith(open)
    })
})

describe('releaseUnusedInstances', () => {
    test('loads PENDING+ACTIVE and delegates to instanceManager', async () => {
        const sessions = [session({id: 's-a'})]
        const repo = makeRepo({sessions: () => sessions})
        const {mgr, instanceManager} = build({repo})
        await mgr.releaseUnusedInstances(5, 'MINUTES')
        expect(repo.sessions).toHaveBeenCalledWith([State.PENDING, State.ACTIVE])
        expect(instanceManager.releaseUnusedInstances).toHaveBeenCalledWith(sessions, 5, 'MINUTES')
    })
})

describe('heartbeat', () => {
    // A bare beat extends NOTHING: the gateway beats for every cached session whether or not
    // anyone is using it, and reading that as liveness is what kept forgotten tabs alive.
    test('a bare heartbeat bumps update_time but never the deadline', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        const {mgr} = build({repo})
        const result = await mgr.heartbeat({sessionId: 's-1'})
        expect(repo.update).toHaveBeenCalledTimes(1)
        expect(result.state).toBe(State.ACTIVE)
    })

    test('PENDING → repo.update NOT called (no bump)', async () => {
        const repo = makeRepo({getSession: () => session({state: State.PENDING})})
        const {mgr} = build({repo})
        await mgr.heartbeat({sessionId: 's-1'})
        expect(repo.update).not.toHaveBeenCalled()
    })

    test('ownership check throws for wrong user', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        const {mgr} = build({repo})
        await expect(mgr.heartbeat({sessionId: 's-1', username: 'mallory'}))
            .rejects.toThrow('Session not owned by user')
    })

    test('CLOSED → 404 (gateway prunes its cache on heartbeat 404)', async () => {
        const repo = makeRepo({getSession: () => session({state: State.CLOSED})})
        const {mgr} = build({repo})
        await expect(mgr.heartbeat({sessionId: 's-1'}))
            .rejects.toMatchObject({statusCode: 404})
        expect(repo.update).not.toHaveBeenCalled()
    })

    test('unknown session → 404 (not the plain-Error 500)', async () => {
        const repo = makeRepo({getSession: () => {
            throw new Error('Non-existing worker session: s-x')
        }})
        const {mgr} = build({repo})
        await expect(mgr.heartbeat({sessionId: 's-x'}))
            .rejects.toMatchObject({statusCode: 404})
    })
})

describe('extensions', () => {
    const activeRepo = (canned = {}) => makeRepo({getSession: () => session({state: State.ACTIVE}), ...canned})

    // The keepAlive slider REPLACES the deadline — the one write that is not a ratchet, because
    // the cursor shows the current keep-alive and dragging it means "make it this much".
    test('the slider SETS the deadline to the requested hours', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.setSessionTimeoutHours({sessionId: 's-1', hours: 3})
        expect(repo.setSessionTimeout).toHaveBeenCalledWith({sessionId: 's-1', minutes: 180})
        expect(repo.extendSession).not.toHaveBeenCalled()
    })

    // The whole point of the change: it may shorten as well as lengthen. Only automatic signals
    // are barred from shortening.
    test('the slider can shorten a session', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.setSessionTimeoutHours({sessionId: 's-1', hours: 0.5})
        expect(repo.setSessionTimeout.mock.calls[0][0].minutes).toBe(30)
    })

    test('a negative slider value floors at zero rather than reaching into the past', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.setSessionTimeoutHours({sessionId: 's-1', hours: -5})
        expect(repo.setSessionTimeout.mock.calls[0][0].minutes).toBe(0)
    })

    test('each event carries its own magnitude', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.openExtension({sessionId: 's-1'})
        await mgr.manualExtension({sessionId: 's-1'})
        await mgr.taskExtension('s-1')
        // Each ratchet names itself, so the debug log says WHY a deadline moved.
        expect(repo.extendSession.mock.calls.map(([{minutes, reason}]) => [minutes, reason]))
            .toEqual([[15, 'opened'], [19, 'extend-button'], [18, 'task-progress']])
    })

    // A task is not a human: stamping last_interaction_time here would re-anchor the unattended
    // cap and let a wedged task keep an instance forever.
    test('the task ratchet is not an interaction', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.taskExtension('s-1')
        expect(repo.extendSession).toHaveBeenCalledWith(
            {sessionId: 's-1', minutes: 18, interaction: false, reason: 'task-progress'})
    })

    test('ownership check throws for wrong user', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await expect(mgr.setSessionTimeoutHours({sessionId: 's-1', hours: 1, username: 'x'}))
            .rejects.toThrow('Session not owned by user')
    })

    test('unknown session → 404', async () => {
        const {mgr} = build({repo: makeRepo()})
        await expect(mgr.setSessionTimeoutHours({sessionId: 's-x', hours: 1}))
            .rejects.toMatchObject({statusCode: 404})
    })

    // Dismiss means "I saw it, don't email me" and nothing else — the session still closes at
    // T+grace, because an easy misclick must not be read as consent to close early.
    test('dismiss does not extend anything', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        await mgr.dismissExpiryNotification({sessionId: 's-1', username: 'alice'})
        expect(repo.dismissNotification).toHaveBeenCalledWith('s-1', 'alice')
        expect(repo.extendSession).not.toHaveBeenCalled()
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
        expect(await mgr.redeemTermination({sessionId: 's-1', notifiedTime})).toBe(true)
        expect(repo.redeemTermination).toHaveBeenCalledWith({sessionId: 's-1', notifiedTime})
        expect(instanceManager.releaseInstance).toHaveBeenCalledWith('i-1')
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's-1'})
    })

    // Zero rows changed means the session was rescued between the mail and the click. Releasing
    // the instance anyway would destroy the very session the guard just protected.
    test('a spent terminate token releases nothing', async () => {
        const repo = activeRepo({redeemTermination: () => false})
        const instanceManager = makeInstanceManager()
        const events = makeEvents()
        const {mgr} = build({repo, instanceManager, events})
        expect(await mgr.redeemTermination({
            sessionId: 's-1', notifiedTime: new Date('2026-01-01T11:00:00Z')})).toBe(false)
        expect(instanceManager.releaseInstance).not.toHaveBeenCalled()
        expect(events.emitWorkerSessionClosed).not.toHaveBeenCalled()
    })

    // The management page names the instance the way every other surface does — the number from
    // the SSH menu plus the type — so a user reading the mail, the notification and the page all
    // know it is the same machine.
    test('instanceDescription gives the derived name, the SSH-menu ordinal and the type', async () => {
        const repo = activeRepo({
            userSessions: () => [{id: 's-0'}, {id: 's-1'}, {id: 's-2'}],
        })
        const {mgr} = build({repo})
        expect(await mgr.instanceDescription('s-1')).toEqual({
            name: instanceName('s-1'), ordinal: 2, typeName: 't3a.small', hourlyCost: 0.02
        })
    })

    // The name is what a user reads; the ordinal is what they type in the SSH menu. Losing either
    // breaks one of the two interfaces.
    test('instanceDescription names the session even when it is not in the open list', async () => {
        const repo = activeRepo({userSessions: () => []})
        const {mgr} = build({repo})
        const {name, ordinal} = await mgr.instanceDescription('s-1')
        expect(name).toBe(instanceName('s-1'))
        expect(ordinal).toBeNull()
    })

    test('instanceDescription is null for a session that is gone', async () => {
        const repo = makeRepo({getSession: () => { throw new Error('gone') }})
        const {mgr} = build({repo})
        expect(await mgr.instanceDescription('s-1')).toBeNull()
    })

    test('the email link redeems through the notified_time-guarded write', async () => {
        const repo = activeRepo()
        const {mgr} = build({repo})
        const notifiedTime = new Date('2026-01-01T11:00:00Z')
        await mgr.redeemExtension({sessionId: 's-1', notifiedTime})
        expect(repo.redeemExtension).toHaveBeenCalledWith(
            {sessionId: 's-1', notifiedTime, minutes: 20})
    })
})

describe('queries', () => {
    test('findPendingOrActiveSession prefers ACTIVE over PENDING', async () => {
        const pending = session({id: 's-p', state: State.PENDING})
        const active = session({id: 's-a', state: State.ACTIVE})
        const repo = makeRepo({userSessions: () => [pending, active]})
        const {mgr} = build({repo})
        const result = await mgr.findPendingOrActiveSession({username: 'alice', workerType: SANDBOX, instanceType: 't'})
        expect(result.id).toBe('s-a')
    })

    test('findPendingOrActiveSession falls back to PENDING then null', async () => {
        const pending = session({id: 's-p', state: State.PENDING})
        const repoPending = makeRepo({userSessions: () => [pending]})
        expect((await build({repo: repoPending}).mgr
            .findPendingOrActiveSession({username: 'a', workerType: SANDBOX, instanceType: 't'})).id).toBe('s-p')

        const repoEmpty = makeRepo({userSessions: () => []})
        expect(await build({repo: repoEmpty}).mgr
            .findPendingOrActiveSession({username: 'a', workerType: SANDBOX, instanceType: 't'})).toBeNull()
    })

    test('generateUserSessionReport shape {sessions, instanceTypes} (no spending — pushed by budget ws)', async () => {
        const sessions = [session({id: 's-a', state: State.ACTIVE})]
        const repo = makeRepo({userSessions: () => sessions})
        const budgetClient = makeBudgetClient()
        const appRepo = makeAppRepo({appsForSessions: async () => new Map()})
        const {mgr} = build({repo, budgetClient, appRepo})
        const report = await mgr.generateUserSessionReport({username: 'alice', workerType: SANDBOX})
        // No sampler registries wired here, so nothing was observed about this session.
        expect(report.sessions).toEqual([
            {...sessions[0], apps: [], usage: null, terminals: 0, verdict: 'unknown'}
        ])
        expect(report.instanceTypes).toEqual([{id: 'T3aSmall'}])
        expect(report).not.toHaveProperty('spending')
        expect(budgetClient.spending).not.toHaveBeenCalled()
    })

    test('generateUserSessionReport attaches apps to each session from appRepo.appsForSessions', async () => {
        const sessions = [session({id: 's-a', state: State.ACTIVE})]
        const repo = makeRepo({userSessions: () => sessions})
        const apps = [{path: '/sandbox/shiny/foo', label: 'Foo'}]
        const appRepo = makeAppRepo({appsForSessions: jest.fn(async () => new Map([['s-a', apps]]))})
        const {mgr} = build({repo, appRepo})
        const report = await mgr.generateUserSessionReport({username: 'alice', workerType: SANDBOX})
        expect(appRepo.appsForSessions).toHaveBeenCalledWith(['s-a'])
        expect(report.sessions[0].apps).toEqual(apps)
    })

    test('findUsernameByApiKey passes through repo', async () => {
        const repo = makeRepo({findUsernameByApiKey: k => (k === 'key' ? 'alice' : null)})
        const {mgr} = build({repo})
        expect(await mgr.findUsernameByApiKey('key')).toBe('alice')
        expect(await mgr.findUsernameByApiKey('nope')).toBeNull()
    })

    test('findSessionById passes through repo (throws on missing)', async () => {
        const repo = makeRepo({getSession: () => session({state: State.ACTIVE})})
        const {mgr} = build({repo})
        expect((await mgr.findSessionById('s-1')).id).toBe('s-1')
        const repoMissing = makeRepo()
        await expect(build({repo: repoMissing}).mgr.findSessionById('nope')).rejects.toThrow('Non-existing')
    })

    test('userWorkerSessions passes username/states/workerType', async () => {
        const repo = makeRepo({userSessions: () => [session({id: 's-a'})]})
        const {mgr} = build({repo})
        await mgr.userWorkerSessions({username: 'alice', states: [State.ACTIVE], workerType: SANDBOX})
        expect(repo.userSessions).toHaveBeenCalledWith('alice', [State.ACTIVE], SANDBOX)
    })

    test('mostRecentlyClosedSession lowercases username', async () => {
        const repo = makeRepo({mostRecentlyClosedSession: u => ({user: u})})
        const {mgr} = build({repo})
        const result = await mgr.mostRecentlyClosedSession('Alice')
        expect(result).toEqual({user: 'alice'})
    })

    test('mostRecentlyClosedSessionByUser passes through', async () => {
        const repo = makeRepo({mostRecentlyClosedSessionByUser: () => ({alice: new Date()})})
        const {mgr} = build({repo})
        expect(Object.keys(await mgr.mostRecentlyClosedSessionByUser())).toEqual(['alice'])
    })

    test('allOpenSessions passes through repo, unscoped by username', async () => {
        const openList = [{username: 'alice', sessionId: 's-a', instanceType: 'T3aSmall', creationTime: new Date()}]
        const repo = makeRepo({allOpenSessions: () => openList})
        const {mgr} = build({repo})
        expect(await mgr.allOpenSessions()).toBe(openList)
        expect(repo.allOpenSessions).toHaveBeenCalledWith()
    })

    test('getDefaultInstanceType returns the first tagged instance type', async () => {
        const instanceManager = makeInstanceManager({
            getInstanceTypes: jest.fn(() => [
                {id: 'T3aSmall'},
                {id: 'T3aMedium', tag: 'medium'},
                {id: 'T3aLarge', tag: 'large'},
            ]),
        })
        const {mgr} = build({instanceManager})
        expect(mgr.getDefaultInstanceType()).toEqual({id: 'T3aMedium', tag: 'medium'})
    })

    test('getDefaultInstanceType returns undefined when no type is tagged', async () => {
        const instanceManager = makeInstanceManager({getInstanceTypes: jest.fn(() => [{id: 'T3aSmall'}])})
        const {mgr} = build({instanceManager})
        expect(mgr.getDefaultInstanceType()).toBeUndefined()
    })
})

describe('associateApp', () => {
    const openSession = {id: 's-1', username: 'bob', state: 'ACTIVE'}
    const emptyAppRepo = () => makeAppRepo()
    // Opening an app is an interaction, so association reaches the ratchet — these tests use a
    // bare repo literal rather than makeRepo().
    const appSessionRepo = () => makeRepo({getSession: () => openSession})

    it('associates an app with an owned open session and emits SessionAppAssociated', async () => {
        const appRepo = emptyAppRepo()
        const {mgr, events} = build({repo: appSessionRepo(), appRepo})
        const result = await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-1'})
        expect(appRepo.associate).toHaveBeenCalledWith({username: 'bob', appPath: '/sandbox/shiny/foo', sessionId: 's-1', label: 'Foo', clientId: 'c-1'})
        expect(result).toEqual({sessionId: 's-1', path: '/sandbox/shiny/foo', label: 'Foo'})
        expect(events.emitSessionAppAssociated).toHaveBeenCalledWith(
            {username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo', label: 'Foo'})
    })

    it('is permanent: a live association on another open session wins over the request', async () => {
        const appRepo = emptyAppRepo()
        appRepo.userAppSessions = jest.fn(async () => [
            {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-OTHER', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
        ])
        const {mgr, events} = build({repo: appSessionRepo(), appRepo})
        const result = await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo'})
        expect(appRepo.associate).not.toHaveBeenCalled()
        expect(result).toEqual({sessionId: 's-OTHER', path: '/sandbox/shiny/foo', label: 'Foo'})
        expect(events.emitSessionAppAssociated).not.toHaveBeenCalled() // nothing changed
    })

    it('a winning association still transfers ownership to the requesting client', async () => {
        const appRepo = makeAppRepo({
            userAppSessions: jest.fn(async () => [
                {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-OTHER', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ])
        })
        const {mgr} = build({repo: appSessionRepo(), appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-2'})
        expect(appRepo.setClient).toHaveBeenCalledWith({username: 'bob', appPath: '/sandbox/shiny/foo', clientId: 'c-2'})
    })

    // Opening an app gives it its own lease, whether or not the association is new.
    it('opening an app ratchets the session it lands on', async () => {
        const appRepo = emptyAppRepo()
        const repo = appSessionRepo()
        const {mgr} = build({repo, appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo'})
        expect(repo.extendSession).toHaveBeenCalledWith(
            {sessionId: 's-1', minutes: 15, interaction: true, capHours: null, reason: 'opened'})
    })

    it('re-opening an app ratchets the session that WON, not the one requested', async () => {
        const appRepo = makeAppRepo({
            userAppSessions: jest.fn(async () => [
                {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-OTHER', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ])
        })
        const repo = appSessionRepo()
        const {mgr} = build({repo, appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo'})
        expect(repo.extendSession.mock.calls[0][0].sessionId).toBe('s-OTHER')
    })

    it('a winning association keeps its owner when no clientId is given', async () => {
        const appRepo = makeAppRepo({
            userAppSessions: jest.fn(async () => [
                {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-OTHER', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ])
        })
        const {mgr} = build({repo: appSessionRepo(), appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo'})
        expect(appRepo.setClient).not.toHaveBeenCalled()
    })

    // A ws reconnect re-asserts every open tab's association to refresh ownership. That is
    // machine-generated — nobody opened anything — so it must reach no ratchet, exactly as a
    // proxied request does not.
    it('a reconnect re-assert refreshes ownership without ratcheting the deadline', async () => {
        const appRepo = makeAppRepo({
            userAppSessions: jest.fn(async () => [
                {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-1', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ])
        })
        const repo = appSessionRepo()
        const {mgr} = build({repo, appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-2', reassert: true})
        expect(appRepo.setClient).toHaveBeenCalledWith({username: 'bob', appPath: '/sandbox/shiny/foo', clientId: 'c-2'})
        expect(repo.extendSession).not.toHaveBeenCalled()
    })

    // The old clientId's clientDown usually sweeps the association before the reconnect lands, so
    // the re-assert re-creates it. That path must not ratchet either.
    it('a reconnect re-assert re-creating a swept association does not ratchet', async () => {
        const appRepo = emptyAppRepo()
        const repo = appSessionRepo()
        const {mgr, events} = build({repo, appRepo})
        await mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-2', reassert: true})
        expect(appRepo.associate).toHaveBeenCalled()
        expect(events.emitSessionAppAssociated).toHaveBeenCalled()
        expect(repo.extendSession).not.toHaveBeenCalled()
    })

    it('rejects a foreign session with status 403', async () => {
        const {mgr} = build({repo: makeRepo({getSession: () => ({...openSession, username: 'alice'})}), appRepo: emptyAppRepo()})
        await expect(mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/x'})).rejects.toMatchObject({statusCode: 403})
    })

    it('rejects a closed session with status 404', async () => {
        const {mgr} = build({repo: makeRepo({getSession: () => ({...openSession, state: 'CLOSED'})}), appRepo: emptyAppRepo()})
        await expect(mgr.associateApp({username: 'bob', sessionId: 's-1', appPath: '/x'})).rejects.toMatchObject({statusCode: 404})
    })
})

describe('dissociateApp', () => {
    it('deletes the association and emits SessionAppDissociated with session, owner and requester', async () => {
        const appRepo = makeAppRepo({
            dissociate: jest.fn(async () => ({sessionId: 's-1', clientId: 'c-owner'})),
        })
        const {mgr, events} = build({appRepo})
        await expect(mgr.dissociateApp({username: 'bob', appPath: '/sandbox/shiny/foo', requestingClientId: 'c-req'}))
            .resolves.toBe(true)
        expect(appRepo.dissociate).toHaveBeenCalledWith({username: 'bob', appPath: '/sandbox/shiny/foo'})
        expect(events.emitSessionAppDissociated).toHaveBeenCalledWith(
            {username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo', clientId: 'c-owner', requestingClientId: 'c-req'})
    })

    it('is idempotent: no association → no delete effect, no event', async () => {
        const appRepo = makeAppRepo()
        const {mgr, events} = build({appRepo})
        await expect(mgr.dissociateApp({username: 'bob', appPath: '/sandbox/shiny/foo'})).resolves.toBe(false)
        expect(events.emitSessionAppDissociated).not.toHaveBeenCalled()
    })
})

describe('dissociateAppsForClient', () => {
    it('dissociates every app the client owned, one event per app, requester = the client', async () => {
        const appRepo = makeAppRepo({
            dissociateForClient: jest.fn(async () => [
                {appPath: '/sandbox/shiny/foo', sessionId: 's-1'},
                {appPath: '/sandbox/jupyter/lab', sessionId: 's-2'},
            ])
        })
        const {mgr, events} = build({appRepo})
        await mgr.dissociateAppsForClient({username: 'bob', clientId: 'c-1'})
        expect(appRepo.dissociateForClient).toHaveBeenCalledWith({username: 'bob', clientId: 'c-1'})
        expect(events.emitSessionAppDissociated).toHaveBeenCalledTimes(2)
        expect(events.emitSessionAppDissociated).toHaveBeenCalledWith(
            {username: 'bob', sessionId: 's-1', path: '/sandbox/shiny/foo', clientId: 'c-1', requestingClientId: 'c-1'})
        expect(events.emitSessionAppDissociated).toHaveBeenCalledWith(
            {username: 'bob', sessionId: 's-2', path: '/sandbox/jupyter/lab', clientId: 'c-1', requestingClientId: 'c-1'})
    })

    it('does nothing without a clientId or username', async () => {
        const appRepo = makeAppRepo()
        const {mgr} = build({appRepo})
        await expect(mgr.dissociateAppsForClient({username: 'bob'})).resolves.toEqual([])
        await expect(mgr.dissociateAppsForClient({clientId: 'c-1'})).resolves.toEqual([])
        expect(appRepo.dissociateForClient).not.toHaveBeenCalled()
    })
})

describe('registerInstanceManagerHooks', () => {
    test('InstanceProvisioned → activate pending session', async () => {
        const repo = makeRepo({sessionOnInstance: () => session({state: State.PENDING})})
        const instanceManager = makeInstanceManager()
        const {mgr, events} = build({repo, instanceManager})
        mgr.registerInstanceManagerHooks()
        expect(instanceManager.onInstanceActivated).toHaveBeenCalled()

        instanceManager._fireActivated({id: 'i-1', host: 'h'})
        await new Promise(r => setImmediate(r)) // let the async handler settle
        expect(events.emitWorkerSessionActivated).toHaveBeenCalledTimes(1)
        expect(events.emitWorkerSessionActivated.mock.calls[0][0].session.apiKey).toBeNull()
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
        expect(events.emitWorkerSessionClosed).toHaveBeenCalledTimes(1)
    })
})
