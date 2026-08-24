// The sweep must never close a session on an inconclusive probe: a transient Docker blip used to
// close the row, after which ReleaseUnusedInstances terminated the still-live machine 5 minutes
// later. Only a confirmed MISSING closes, and only after the tracker agrees.

import {jest} from '@jest/globals'

import {createMissingInstanceTracker} from '../missingInstanceTracker.js'
import {createWorkerSession, State} from '../workerSession.js'
import {closeSessionsWithoutInstance} from './closeSessionsWithoutInstance.js'

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
            sessions: jest.fn(async () => sessions),
            update: jest.fn(async () => {}),
        },
        instanceManager: {
            sessionsWithoutInstance: jest.fn(async probed => probed
                .filter(s => statuses[s.id] && statuses[s.id] !== 'PROVISIONED')
                .map(s => ({session: s, status: statuses[s.id]}))),
        },
        emitWorkerSessionClosed: jest.fn(),
        tracker: createMissingInstanceTracker({missesBeforeClose: 2, unknownBackstopMs: 30 * 60_000}),
    }
    return deps
}

test('a single MISSING sweep does not close the session', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'MISSING'}})
    await closeSessionsWithoutInstance(deps)
    expect(deps.repo.update).not.toHaveBeenCalled()
    expect(deps.emitWorkerSessionClosed).not.toHaveBeenCalled()
})

test('MISSING confirmed on a second sweep closes the session', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'MISSING'}})
    await closeSessionsWithoutInstance(deps)
    await closeSessionsWithoutInstance(deps)
    expect(deps.emitWorkerSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's-1'})
})

test('an UNKNOWN probe never closes the session, however long it repeats', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'UNKNOWN'}})
    for (let i = 0; i < 10; i++) {
        await closeSessionsWithoutInstance(deps)
    }
    expect(deps.emitWorkerSessionClosed).not.toHaveBeenCalled()
})

test('a session that recovers between two MISSING sweeps is not closed', async () => {
    const statuses = {'s-1': 'MISSING'}
    const deps = build({sessions: [session('s-1')], statuses})
    await closeSessionsWithoutInstance(deps)
    statuses['s-1'] = 'PROVISIONED'
    await closeSessionsWithoutInstance(deps)
    statuses['s-1'] = 'MISSING'
    await closeSessionsWithoutInstance(deps)
    expect(deps.emitWorkerSessionClosed).not.toHaveBeenCalled()
})

test('loads ACTIVE sessions only and never releases the instance', async () => {
    const deps = build({sessions: [session('s-1')], statuses: {'s-1': 'MISSING'}})
    await closeSessionsWithoutInstance(deps)
    await closeSessionsWithoutInstance(deps)
    expect(deps.repo.sessions).toHaveBeenCalledWith([State.ACTIVE])
    expect(deps.instanceManager.releaseInstance).toBeUndefined()
})

test('one close failing does not abort the rest', async () => {
    const deps = build({
        sessions: [session('s-1'), session('s-2')],
        statuses: {'s-1': 'MISSING', 's-2': 'MISSING'},
    })
    deps.repo.update = jest.fn(async s => {
        if (s.id === 's-1') throw new Error('boom')
    })
    await closeSessionsWithoutInstance(deps)
    await closeSessionsWithoutInstance(deps)
    expect(deps.emitWorkerSessionClosed).toHaveBeenCalledWith({username: 'alice', sessionId: 's-2'})
})
