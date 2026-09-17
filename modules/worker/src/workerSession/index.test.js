// Tests for the session component's scheduling, driven through the REAL sessionManager over a
// mocked repo. Only the immediate (initial-delay-0) run of each job is exercised — the 1-minute
// intervals never fire within a test, and stop() clears them.

import {jest} from '@jest/globals'

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
    update: jest.fn(async () => {}),
    getSession: jest.fn(async () => timedOutSession),
    sessions: jest.fn(async () => []),
    timedOutSessions: jest.fn(async () => [timedOutSession]),
})

const makeInstanceManager = () => ({
    releaseInstance: jest.fn(async () => undefined),
    releaseUnusedInstances: jest.fn(async () => undefined),
    reclaimStaleClaims: jest.fn(async () => undefined),
    sessionsWithoutInstance: jest.fn(async () => []),
    isProvisioning: jest.fn(() => false),
    reprovisionInstance: jest.fn(async () => true),
    removeOrphanedContainers: jest.fn(async () => []),
    getInstanceTypes: jest.fn(() => []),
    onInstanceActivated: jest.fn(),
    onFailedToProvisionInstance: jest.fn(),
})

const build = clock => {
    const repo = makeRepo()
    const instanceManager = makeInstanceManager()
    const events = {
        emitWorkerSessionRequested: jest.fn(),
        emitWorkerSessionActivated: jest.fn(),
        emitWorkerSessionClosed: jest.fn(),
        emitSessionAppAssociated: jest.fn(),
        emitSessionAppDissociated: jest.fn(),
        emitSessionChanged: jest.fn(),
    }
    const sessionManager = createSessionManager({
        repo,
        appRepo: {userAppSessions: jest.fn(async () => []), deleteForSession: jest.fn(async () => {})},
        instanceManager,
        lockedUsers: {isLocked: () => false},
        clock,
        events,
    })
    const component = createSessionComponent({
        sessionManager,
        repo,
        googleOAuthGateway: {refreshTokens: jest.fn(async () => {})},
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

    component.start()
    await flush()
    component.stop()

    expect(repo.timedOutSessions).toHaveBeenCalled()
    expect(events.emitWorkerSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's-1'})
    expect(repo.sessions).toHaveBeenCalledWith([State.PENDING])
    expect(repo.sessions.mock.invocationCallOrder[0])
        .toBeLessThan(repo.timedOutSessions.mock.invocationCallOrder[0])
})

// Both sweeps are pure scheduling: nothing else calls them, and ReclaimStaleClaims is the only
// thing bounding instance_claim's growth.
test('the claim sweep runs with the claim grace', async () => {
    const {component, instanceManager} = build(() => STARTED_AT)

    component.start()
    await flush()
    component.stop()

    expect(instanceManager.reclaimStaleClaims).toHaveBeenCalledWith([], 10 * 60_000)
})

test('the unused-instance sweep runs with the release min age', async () => {
    const {component, instanceManager} = build(() => STARTED_AT)

    component.start()
    await flush()
    component.stop()

    expect(instanceManager.releaseUnusedInstances).toHaveBeenCalledWith([], 5, 'MINUTES')
})

// The recovery sweep is the only thing that finishes a PENDING session whose provisioning nobody
// is driving any more, and repo.sessions([PENDING]) is its alone — every other sweep asks for
// [PENDING, ACTIVE].
test('the reconcile sweep runs over the PENDING sessions', async () => {
    const {component, repo, instanceManager} = build(() => STARTED_AT)
    const pendingSession = createWorkerSession({
        ...timedOutSession, id: 's-pending', state: State.PENDING,
    })
    repo.sessions.mockImplementation(async states =>
        states.length === 1 && states[0] === State.PENDING ? [pendingSession] : [])

    component.start()
    await flush()
    component.stop()

    expect(repo.sessions).toHaveBeenCalledWith([State.PENDING])
    expect(instanceManager.sessionsWithoutInstance).toHaveBeenCalledWith([pendingSession])
})
