import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {createReconciler} from './reconciler.js'

test('worker-open session missing from the table gets opened (missed Activated)', async () => {
    const workerClient = {
        openSessions: async () => [
            {username: 'bob', sessionId: 's3', instanceType: 'm5.large', creationTime: '2026-07-02T00:00:00Z'},
        ],
    }
    const openSessionUse = createMockOpenSessionUse() // nothing open here yet

    const reconciler = createReconciler({workerClient, openSessionUse, clock: () => new Date('2026-07-03T00:00:00Z')})
    await reconciler.reconcile()

    assert.equal(openSessionUse.openSession.mock.callCount(), 1)
    assert.deepEqual(callsOf(openSessionUse.openSession), [[{
        sessionId: 's3', username: 'bob', instanceType: 'm5.large', from: new Date('2026-07-02T00:00:00Z'),
    }]])
    assert.equal(openSessionUse.closeSession.mock.callCount(), 0)
})

test('table row not reported open by the worker gets closed (missed Closed); still-open rows are left alone', async () => {
    const workerClient = {
        openSessions: async () => [
            {username: 'alice', sessionId: 's1', instanceType: 'm5.large', creationTime: '2026-07-01T00:00:00Z'},
        ],
    }
    const openSessionUse = createMockOpenSessionUse(['s1', 's2']) // s1 open (matches worker), s2 stale
    const now = new Date('2026-07-03T00:00:00Z')

    const reconciler = createReconciler({workerClient, openSessionUse, clock: () => now})
    await reconciler.reconcile()

    assert.deepEqual(callsOf(openSessionUse.openSession), [[{
        sessionId: 's1', username: 'alice', instanceType: 'm5.large', from: new Date('2026-07-01T00:00:00Z'),
    }]])
    assert.equal(openSessionUse.closeSession.mock.callCount(), 1)
    assert.deepEqual(callsOf(openSessionUse.closeSession), [[{sessionId: 's2', to: now}]])
})

test('combined: opens the missing session, keeps the still-open one, closes the stale one', async () => {
    const workerClient = {
        openSessions: async () => [
            {username: 'alice', sessionId: 's1', instanceType: 'm5.large', creationTime: '2026-07-01T00:00:00Z'},
        ],
    }
    const openSessionUse = createMockOpenSessionUse(['s1', 's2'])
    const now = new Date('2026-07-03T00:00:00Z')

    const reconciler = createReconciler({workerClient, openSessionUse, clock: () => now})
    await reconciler.reconcile()

    assert.equal(openSessionUse.openSession.mock.callCount(), 1)
    assert.equal(openSessionUse.closeSession.mock.callCount(), 1)
    assert.deepEqual(callsOf(openSessionUse.closeSession), [[{sessionId: 's2', to: now}]])
})

test('session requested while the worker is queried is not closed', async () => {
    const openSessionUse = createMockOpenSessionUse(['s1'])
    const workerClient = {
        openSessions: async () => {
            openSessionUse.requested('s2') // WorkerSessionRequested lands after the worker's snapshot
            return [{username: 'alice', sessionId: 's1', instanceType: 'm5.large', creationTime: '2026-07-01T00:00:00Z'}]
        },
    }

    const reconciler = createReconciler({workerClient, openSessionUse, clock: () => new Date('2026-07-03T00:00:00Z')})
    await reconciler.reconcile()

    assert.equal(openSessionUse.closeSession.mock.callCount(), 0)
})

const createMockOpenSessionUse = (openSessionIds = []) => {
    const ids = [...openSessionIds]
    return {
        openSession: mock.fn(),
        closeSession: mock.fn(),
        openSessionIds: mock.fn(async () => [...ids]),
        requested: sessionId => ids.push(sessionId),
    }
}
