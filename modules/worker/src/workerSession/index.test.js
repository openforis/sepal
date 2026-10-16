import assert from 'node:assert/strict'
import {mock, test} from 'node:test'
import {isDeepStrictEqual} from 'node:util'

import {callsOf} from '#sepal/testSupport/mock'

import {createSessionComponent} from './index.js'
import {createSessionManager} from './sessionManager.js'
import {createWorkerSession, State} from './workerSession.js'

const STARTED_AT = new Date('2026-01-01T12:00:00Z')

const timedOutSession = createWorkerSession({
    id: 's-1',
    state: State.ACTIVE,
    username: 'alice',
    workerType: 'sandbox',
    instanceType: 'T3aSmall',
    instance: {id: 'i-1', host: 'host-1'},
    creationTime: STARTED_AT,
    updateTime: STARTED_AT,
})

const makeRepo = () => ({
    update: mock.fn(async () => {}),
    getSession: mock.fn(async () => timedOutSession),
    sessionOnInstance: mock.fn(async () => null),
    sessions: mock.fn(async () => []),
    timedOutSessions: mock.fn(async () => [timedOutSession]),
})

const makeInstanceManager = () => ({
    releaseInstance: mock.fn(async () => undefined),
    releaseUnusedInstances: mock.fn(async () => undefined),
    reclaimStaleClaims: mock.fn(async () => undefined),
    sessionsWithoutInstance: mock.fn(async () => []),
    isProvisioning: mock.fn(() => false),
    reprovisionInstance: mock.fn(async () => true),
    removeOrphanedContainers: mock.fn(async () => []),
    getInstanceTypes: mock.fn(() => []),
    onInstanceActivated: mock.fn(),
    onFailedToProvisionInstance: mock.fn(),
})

const build = clock => {
    const repo = makeRepo()
    const instanceManager = makeInstanceManager()
    const events = {
        emitWorkerSessionRequested: mock.fn(),
        emitWorkerSessionActivated: mock.fn(),
        emitWorkerSessionClosed: mock.fn(),
        emitSessionAppAssociated: mock.fn(),
        emitSessionAppDissociated: mock.fn(),
        emitSessionChanged: mock.fn(),
    }
    const sessionManager = createSessionManager({
        repo,
        appRepo: {userAppSessions: mock.fn(async () => []), deleteForSession: mock.fn(async () => {})},
        instanceManager,
        lockedUsers: {isLocked: () => false},
        expiryPolicy: {mode: 'off', startupLeaseMinutes: 30},
        clock,
        events,
    })
    const component = createSessionComponent({
        sessionManager,
        repo,
        googleOAuthGateway: {refreshTokens: mock.fn(async () => {})},
        instanceManager,
        homeDir: '/nonexistent-scratch-home', // listDirs() yields [] — no filesystem side effects
        clock,
    })
    return {component, repo, events, instanceManager}
}

// The jobs run in a microtask (scheduleFixedDelay's Promise.resolve().then(fn)), so the queue must
// drain before asserting.
const flush = () => new Promise(resolve => setImmediate(resolve))

// A restart is exactly when a PENDING session is most at risk: its instance may have come up while
// the worker was down. The recovery sweep must get to it before the timed-out sweep does — in the
// same tick, not after a wall-clock grace that a crash loop can starve forever.
test('the timed-out sweep runs on the first tick, after the reconcile sweep', async () => {
    const {component, repo, events} = build(() => STARTED_AT)
    const sweeps = []
    repo.sessions.mock.mockImplementation(async states => {
        if (isDeepStrictEqual(states, [State.PENDING])) sweeps.push('reconcile')
        return []
    })
    repo.timedOutSessions.mock.mockImplementation(async () => {
        sweeps.push('timed out')
        return [timedOutSession]
    })

    component.start()
    await flush()
    component.stop()

    assert.ok(repo.timedOutSessions.mock.callCount() > 0)
    assert.deepEqual(
        callsOf(events.emitWorkerSessionClosed),
        [[{username: 'alice', sessionId: 's-1'}]]
    )
    assert.ok(callsOf(repo.sessions).some(([states]) => isDeepStrictEqual(states, [State.PENDING])))
    assert.deepEqual(sweeps.slice(0, 2), ['reconcile', 'timed out'])
})

// Both sweeps are pure scheduling: nothing else calls them, and ReclaimStaleClaims is the only
// thing bounding instance_claim's growth.
test('the claim sweep runs with the claim grace', async () => {
    const {component, instanceManager} = build(() => STARTED_AT)

    component.start()
    await flush()
    component.stop()

    assert.deepEqual(callsOf(instanceManager.reclaimStaleClaims), [[[], 10 * 60_000]])
})

test('the unused-instance sweep runs with the release min age', async () => {
    const {component, instanceManager} = build(() => STARTED_AT)

    component.start()
    await flush()
    component.stop()

    assert.deepEqual(callsOf(instanceManager.releaseUnusedInstances), [[[], 5, 'MINUTES']])
})

// The recovery sweep is the only thing that finishes a PENDING session whose provisioning nobody
// is driving any more, and repo.sessions([PENDING]) is its alone — every other sweep asks for
// [PENDING, ACTIVE].
test('the reconcile sweep runs over the PENDING sessions', async () => {
    const {component, repo, instanceManager} = build(() => STARTED_AT)
    const pendingSession = createWorkerSession({
        ...timedOutSession, id: 's-pending', state: State.PENDING,
    })
    repo.sessions.mock.mockImplementation(async states =>
        states.length === 1 && states[0] === State.PENDING ? [pendingSession] : [])

    component.start()
    await flush()
    component.stop()

    assert.ok(callsOf(repo.sessions).some(([states]) => isDeepStrictEqual(states, [State.PENDING])))
    assert.ok(callsOf(instanceManager.sessionsWithoutInstance).some(([sessions]) => isDeepStrictEqual(sessions, [pendingSession])))
})
