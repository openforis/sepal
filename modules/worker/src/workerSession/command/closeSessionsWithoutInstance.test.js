import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {createMissingInstanceTracker} from '../missingInstanceTracker.js'
import {createWorkerSession, State} from '../workerSession.js'
import {closeSessionsWithoutInstance} from './closeSessionsWithoutInstance.js'

const NOW = new Date('2026-01-01T12:00:00Z')

test('a single MISSING sweep does not close the session', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'MISSING'}})
    await closeSessionsWithoutInstance(deps)
    assert.equal(deps.repo.update.mock.callCount(), 0)
    assert.equal(deps.emitWorkerSessionClosed.mock.callCount(), 0)
})

test('MISSING confirmed on a second sweep closes the session', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'MISSING'}})
    await closeSessionsWithoutInstance(deps)
    await closeSessionsWithoutInstance(deps)
    assert.deepEqual(
        callsOf(deps.emitWorkerSessionClosed),
        [[{username: 'alice', sessionId: 's-1'}]]
    )
})

// Sustained unreachability does eventually close, on the tracker's backstop — missingInstanceTracker.test.js.
test('an UNKNOWN probe is never on its own enough to close the session', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'UNKNOWN'}})
    for (let i = 0; i < 10; i++) {
        await closeSessionsWithoutInstance(deps)
    }
    assert.equal(deps.emitWorkerSessionClosed.mock.callCount(), 0)
})

test('a session that recovers between two MISSING sweeps is not closed', async () => {
    const statuses = {'s-1': 'MISSING'}
    const deps = build({sessions: [session('s-1')], statuses})
    await closeSessionsWithoutInstance(deps)
    statuses['s-1'] = 'PROVISIONED'
    await closeSessionsWithoutInstance(deps)
    statuses['s-1'] = 'MISSING'
    await closeSessionsWithoutInstance(deps)
    assert.equal(deps.emitWorkerSessionClosed.mock.callCount(), 0)
})

test('loads ACTIVE sessions only and never releases the instance', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'MISSING'}})
    await closeSessionsWithoutInstance(deps)
    await closeSessionsWithoutInstance(deps)
    assert.deepEqual(callsOf(deps.repo.sessions), [[[State.ACTIVE]], [[State.ACTIVE]]])
    assert.equal(deps.instanceManager.releaseInstance, undefined)
})

test('one close failing does not abort the rest', async () => {
    const deps = build({
        sessions: [session('s-1'), session('s-2')],
        statuses: {'s-1': 'MISSING', 's-2': 'MISSING'},
    })
    deps.repo.update = mock.fn(async s => {
        if (s.id === 's-1') throw new Error('boom')
        return true
    })
    await closeSessionsWithoutInstance(deps)
    await closeSessionsWithoutInstance(deps)
    assert.deepEqual(
        callsOf(deps.emitWorkerSessionClosed),
        [[{username: 'alice', sessionId: 's-2'}]]
    )
})

const session = id => createWorkerSession({
    id,
    state: State.ACTIVE,
    username: 'alice',
    workerType: 'sandbox',
    instanceType: 'T3aSmall',
    instance: {id: `i-${id}`, host: 'h'},
    creationTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
})

const build = ({sessions, statuses}) => {
    const deps = {
        repo: {
            sessions: mock.fn(async () => sessions),
            update: mock.fn(async () => true),
        },
        instanceManager: {
            sessionsWithoutInstance: mock.fn(async probed => probed
                .filter(s => statuses[s.id] && statuses[s.id] !== 'PROVISIONED')
                .map(s => ({session: s, status: statuses[s.id]}))),
        },
        emitWorkerSessionClosed: mock.fn(),
        // Time stands still across a sweep here, so the tracker's backstop never elapses: these tests
        // are about what one probe result is worth, not about how long an instance may stay unreachable.
        tracker: createMissingInstanceTracker({
            missesBeforeClose: 2, unknownBackstopMs: 30 * 60_000, clock: () => NOW
        }),
    }
    return deps
}
