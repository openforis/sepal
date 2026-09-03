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
    sessionsWithoutInstance: jest.fn(async () => []),
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
    return {component, repo, events}
}

// The jobs run in a microtask (scheduleFixedDelay's Promise.resolve().then(fn)), so the queue must
// drain before asserting.
const flush = () => new Promise(resolve => setImmediate(resolve))

test('the timed-out sweep stays inert on the first run after start', async () => {
    const {component, repo, events} = build(() => STARTED_AT)

    component.start()
    await flush()
    component.stop()

    expect(repo.timedOutSessions).not.toHaveBeenCalled()
    expect(events.emitWorkerSessionClosed).not.toHaveBeenCalled()
})

test('the timed-out sweep runs once the grace period has elapsed', async () => {
    // start() captures the start time synchronously; the job body runs a microtask later, so
    // advancing the clock here is observed by the sweep but not by the captured start time.
    let now = STARTED_AT
    const {component, repo, events} = build(() => now)

    component.start()
    now = new Date(STARTED_AT.getTime() + 60 * 60_000)
    await flush()
    component.stop()

    expect(repo.timedOutSessions).toHaveBeenCalled()
    expect(events.emitWorkerSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's-1'})
})
