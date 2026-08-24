import {jest} from '@jest/globals'

import {createReconciler} from './reconciler.js'

const createMockOpenSessionUse = () => ({
    openSession: jest.fn(),
    closeSession: jest.fn(),
})

const poolReturning = rows => () => ({
    query: jest.fn(async () => [rows]),
})

test('worker-open session missing from the table gets opened (missed Activated)', async () => {
    const workerClient = {
        openSessions: async () => [
            {username: 'bob', sessionId: 's3', instanceType: 'm5.large', creationTime: '2026-07-02T00:00:00Z'},
        ],
    }
    const openSessionUse = createMockOpenSessionUse()
    const pool = poolReturning([]) // table has nothing open yet

    const reconciler = createReconciler({workerClient, openSessionUse, pool, clock: () => new Date('2026-07-03T00:00:00Z')})
    await reconciler.reconcile()

    expect(openSessionUse.openSession).toHaveBeenCalledTimes(1)
    expect(openSessionUse.openSession).toHaveBeenCalledWith({
        sessionId: 's3', username: 'bob', instanceType: 'm5.large', from: new Date('2026-07-02T00:00:00Z'),
    })
    expect(openSessionUse.closeSession).not.toHaveBeenCalled()
})

test('table row not reported open by the worker gets closed (missed Closed); still-open rows are left alone', async () => {
    const workerClient = {
        openSessions: async () => [
            {username: 'alice', sessionId: 's1', instanceType: 'm5.large', creationTime: '2026-07-01T00:00:00Z'},
        ],
    }
    const openSessionUse = createMockOpenSessionUse()
    const pool = poolReturning([{session_id: 's1'}, {session_id: 's2'}]) // s1 open (matches worker), s2 stale
    const now = new Date('2026-07-03T00:00:00Z')

    const reconciler = createReconciler({workerClient, openSessionUse, pool, clock: () => now})
    await reconciler.reconcile()

    expect(openSessionUse.openSession).toHaveBeenCalledWith({
        sessionId: 's1', username: 'alice', instanceType: 'm5.large', from: new Date('2026-07-01T00:00:00Z'),
    })
    expect(openSessionUse.closeSession).toHaveBeenCalledTimes(1)
    expect(openSessionUse.closeSession).toHaveBeenCalledWith({sessionId: 's2', to: now})
})

test('combined: opens the missing session, keeps the still-open one, closes the stale one', async () => {
    const workerClient = {
        openSessions: async () => [
            {username: 'alice', sessionId: 's1', instanceType: 'm5.large', creationTime: '2026-07-01T00:00:00Z'},
        ],
    }
    const openSessionUse = createMockOpenSessionUse()
    const pool = poolReturning([{session_id: 's1'}, {session_id: 's2'}])
    const now = new Date('2026-07-03T00:00:00Z')

    const reconciler = createReconciler({workerClient, openSessionUse, pool, clock: () => now})
    await reconciler.reconcile()

    expect(openSessionUse.openSession).toHaveBeenCalledTimes(1)
    expect(openSessionUse.closeSession).toHaveBeenCalledTimes(1)
    expect(openSessionUse.closeSession).toHaveBeenCalledWith({sessionId: 's2', to: now})
})

test('queries open_session_use for to_time IS NULL rows via pool()', async () => {
    const workerClient = {openSessions: async () => []}
    const openSessionUse = createMockOpenSessionUse()
    const query = jest.fn(async () => [[]])
    const pool = () => ({query})

    const reconciler = createReconciler({workerClient, openSessionUse, pool, clock: () => new Date()})
    await reconciler.reconcile()

    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][0]).toMatch(/to_time IS NULL/)
})

test('defaults clock to ≈Date.now() when not injected', async () => {
    const workerClient = {openSessions: async () => []}
    const openSessionUse = createMockOpenSessionUse()
    const pool = poolReturning([{session_id: 'stale'}])

    const reconciler = createReconciler({workerClient, openSessionUse, pool})
    const before = Date.now()
    await reconciler.reconcile()
    const after = Date.now()

    const {to} = openSessionUse.closeSession.mock.calls[0][0]
    expect(to.getTime()).toBeGreaterThanOrEqual(before)
    expect(to.getTime()).toBeLessThanOrEqual(after)
})
