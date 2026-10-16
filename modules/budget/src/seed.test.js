import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

import {configureNoLogging} from '#sepal/log'
import {callsOf} from '#sepal/testSupport/mock'

import {createSeed} from './seed.js'

configureNoLogging()

test('opens every session the worker reports when nothing has been recorded', async () => {
    const workerClient = {
        openSessions: async () => [
            {username: 'alice', sessionId: 's1', instanceType: 'm5.large', creationTime: '2026-07-01T00:00:00Z'},
            {username: 'bob', sessionId: 's2', instanceType: 't3.small', creationTime: '2026-07-02T00:00:00Z'},
        ],
    }
    const openSessionUse = createMockOpenSessionUse(0)

    await createSeed({workerClient, openSessionUse})()

    assert.deepEqual(callsOf(openSessionUse.openSession), [
        [{sessionId: 's1', username: 'alice', instanceType: 'm5.large', from: new Date('2026-07-01T00:00:00Z')}],
        [{sessionId: 's2', username: 'bob', instanceType: 't3.small', from: new Date('2026-07-02T00:00:00Z')}]
    ])
})

// Seeding is a one-off: an already-populated table is the reconciler's to correct, not the seed's.
test('asks the worker for nothing once session use has been recorded', async () => {
    const openSessions = mock.fn()
    const openSessionUse = createMockOpenSessionUse(1)

    await createSeed({workerClient: {openSessions}, openSessionUse})()

    assert.equal(openSessions.mock.callCount(), 0)
    assert.equal(openSessionUse.openSession.mock.callCount(), 0)
})

const createMockOpenSessionUse = (count = 0) => ({
    count: mock.fn(async () => count),
    openSession: mock.fn(),
})
