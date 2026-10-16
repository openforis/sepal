import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {createWorkerSession, State} from '../workerSession.js'
import {reconcilePendingSessions} from './reconcilePendingSessions.js'

const session = (id, overrides = {}) => createWorkerSession({
    id,
    state: State.PENDING,
    username: 'alice',
    workerType: 'sandbox',
    instanceType: 'T3aSmall',
    instance: {id: `i-${id}`, host: 'h'},
    creationTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
})

const build = ({sessions, statuses = {}, provisioning = []}) => ({
    repo: {
        sessions: mock.fn(async () => sessions),
        sessionOnInstance: mock.fn(async instanceId =>
            sessions.find(s => s.instance && s.instance.id === instanceId) ?? null),
    },
    instanceManager: {
        sessionsWithoutInstance: mock.fn(async probed => probed
            .filter(s => statuses[s.id] && statuses[s.id] !== 'PROVISIONED')
            .map(s => ({session: s, status: statuses[s.id]}))),
        isProvisioning: mock.fn(instanceId => provisioning.includes(instanceId)),
        reprovisionInstance: mock.fn(async () => true),
    },
    activatePendingSessionOnInstance: mock.fn(async () => null),
})

test('a PENDING session whose containers are there is activated', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'PROVISIONED'}})

    await reconcilePendingSessions(deps)

    assert.deepEqual(callsOf(deps.activatePendingSessionOnInstance), [['i-s-1']])
    assert.equal(deps.instanceManager.reprovisionInstance.mock.callCount(), 0)
})

test('a PENDING session whose containers are gone is re-provisioned, not activated', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'MISSING'}})

    await reconcilePendingSessions(deps)

    assert.equal(deps.instanceManager.reprovisionInstance.mock.callCount(), 1)
    assert.equal(
        deps.instanceManager.reprovisionInstance.mock.calls[0].arguments[0].id,
        's-1'
    )
    assert.equal(deps.activatePendingSessionOnInstance.mock.callCount(), 0)
})

// An inconclusive probe is not evidence of anything. Acting on it would either activate a
// session with no sandbox or delete the containers of one that is merely unreachable.
test('an UNKNOWN probe neither activates nor re-provisions', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'UNKNOWN'}})

    await reconcilePendingSessions(deps)

    assert.equal(deps.activatePendingSessionOnInstance.mock.callCount(), 0)
    assert.equal(deps.instanceManager.reprovisionInstance.mock.callCount(), 0)
})

// Re-entering provisionInstance would delete the containers the in-flight provision is creating.
test('a session whose instance is already being provisioned is left alone', async () => {
    const deps = build({
        sessions: [session('s-1')],
        statuses: {'s-1': 'MISSING'},
        provisioning: ['i-s-1'],
    })

    await reconcilePendingSessions(deps)

    assert.equal(deps.instanceManager.reprovisionInstance.mock.callCount(), 0)
    assert.equal(deps.activatePendingSessionOnInstance.mock.callCount(), 0)
})

// The batch probe is bounded by PROBE_TIMEOUT_MS per container, so a MISSING verdict can be
// tens of seconds old by the time the loop reaches it, and provisionInstance opens by deleting
// every worker container on the host. Re-provisioning on a stale verdict destroys whatever
// session owns the instance now.
test('a session that is no longer PENDING on its instance is not re-provisioned', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'MISSING'}})
    deps.repo.sessionOnInstance = mock.fn(async () => null)

    await reconcilePendingSessions(deps)

    assert.deepEqual(callsOf(deps.repo.sessionOnInstance), [['i-s-1', [State.PENDING]]])
    assert.equal(deps.instanceManager.reprovisionInstance.mock.callCount(), 0)
})

test('an instance whose PENDING session is now a different one is not re-provisioned', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'MISSING'}})
    deps.repo.sessionOnInstance = mock.fn(async () => session('s-2'))

    await reconcilePendingSessions(deps)

    assert.equal(deps.instanceManager.reprovisionInstance.mock.callCount(), 0)
})

test('loads PENDING sessions only', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'PROVISIONED'}})

    await reconcilePendingSessions(deps)

    assert.deepEqual(callsOf(deps.repo.sessions), [[[State.PENDING]]])
})

// A session whose instance request never returned has nothing to probe.
test('a PENDING session with no instance is skipped without probing', async () => {
    const deps = build({sessions: [session('s-1', {instance: null})]})

    await reconcilePendingSessions(deps)

    assert.equal(deps.instanceManager.sessionsWithoutInstance.mock.callCount(), 0)
})

test('one failing activation does not abort the rest of the sweep', async () => {
    const deps = build({
        sessions: [session('s-1'), session('s-2')],
        statuses: {'s-1': 'PROVISIONED', 's-2': 'PROVISIONED'},
    })
    deps.activatePendingSessionOnInstance = mock.fn(async instanceId => {
        if (instanceId === 'i-s-1') throw new Error('boom')
        return null
    })

    await reconcilePendingSessions(deps)

    assert.deepEqual(callsOf(deps.activatePendingSessionOnInstance), [['i-s-1'], ['i-s-2']])
})
