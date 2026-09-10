// Provisioning is driven by an in-proc event, so a worker that restarts mid-provision — or
// between a successful provision and the activation it triggers — leaves the session PENDING
// with nobody to move it, and CloseTimedOutSessions kills it ten minutes later even though its
// instance is up. This sweep is the only thing that finishes the job.

import {jest} from '@jest/globals'

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
        sessions: jest.fn(async () => sessions),
    },
    instanceManager: {
        sessionsWithoutInstance: jest.fn(async probed => probed
            .filter(s => statuses[s.id] && statuses[s.id] !== 'PROVISIONED')
            .map(s => ({session: s, status: statuses[s.id]}))),
        isProvisioning: jest.fn(instanceId => provisioning.includes(instanceId)),
        reprovisionInstance: jest.fn(async () => true),
    },
    activatePendingSessionOnInstance: jest.fn(async () => null),
})

test('a PENDING session whose containers are there is activated', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'PROVISIONED'}})

    await reconcilePendingSessions(deps)

    expect(deps.activatePendingSessionOnInstance).toHaveBeenCalledWith('i-s-1')
    expect(deps.instanceManager.reprovisionInstance).not.toHaveBeenCalled()
})

test('a PENDING session whose containers are gone is re-provisioned, not activated', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'MISSING'}})

    await reconcilePendingSessions(deps)

    expect(deps.instanceManager.reprovisionInstance).toHaveBeenCalledTimes(1)
    expect(deps.instanceManager.reprovisionInstance.mock.calls[0][0].id).toBe('s-1')
    expect(deps.activatePendingSessionOnInstance).not.toHaveBeenCalled()
})

// An inconclusive probe is not evidence of anything. Acting on it would either activate a
// session with no sandbox or delete the containers of one that is merely unreachable.
test('an UNKNOWN probe neither activates nor re-provisions', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'UNKNOWN'}})

    await reconcilePendingSessions(deps)

    expect(deps.activatePendingSessionOnInstance).not.toHaveBeenCalled()
    expect(deps.instanceManager.reprovisionInstance).not.toHaveBeenCalled()
})

// Re-entering provisionInstance would delete the containers the in-flight provision is creating.
test('a session whose instance is already being provisioned is left alone', async () => {
    const deps = build({
        sessions: [session('s-1')],
        statuses: {'s-1': 'MISSING'},
        provisioning: ['i-s-1'],
    })

    await reconcilePendingSessions(deps)

    expect(deps.instanceManager.reprovisionInstance).not.toHaveBeenCalled()
    expect(deps.activatePendingSessionOnInstance).not.toHaveBeenCalled()
})

test('loads PENDING sessions only', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'PROVISIONED'}})

    await reconcilePendingSessions(deps)

    expect(deps.repo.sessions).toHaveBeenCalledWith([State.PENDING])
})

// A session whose instance request never returned has nothing to probe.
test('a PENDING session with no instance is skipped without probing', async () => {
    const deps = build({sessions: [session('s-1', {instance: null})]})

    await reconcilePendingSessions(deps)

    expect(deps.instanceManager.sessionsWithoutInstance).not.toHaveBeenCalled()
})

test('one failing activation does not abort the rest of the sweep', async () => {
    const deps = build({
        sessions: [session('s-1'), session('s-2')],
        statuses: {'s-1': 'PROVISIONED', 's-2': 'PROVISIONED'},
    })
    deps.activatePendingSessionOnInstance = jest.fn(async instanceId => {
        if (instanceId === 'i-s-1') throw new Error('boom')
        return null
    })

    await reconcilePendingSessions(deps)

    expect(deps.activatePendingSessionOnInstance).toHaveBeenCalledWith('i-s-2')
})
