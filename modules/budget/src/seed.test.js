import {jest} from '@jest/globals'

import {configureNoLogging} from '#sepal/log'

import {createSeed} from './seed.js'

configureNoLogging()

const createMockOpenSessionUse = (count = 0) => ({
    count: jest.fn(async () => count),
    openSession: jest.fn(),
})

test('opens every session the worker reports when nothing has been recorded', async () => {
    const workerClient = {
        openSessions: async () => [
            {username: 'alice', sessionId: 's1', instanceType: 'm5.large', creationTime: '2026-07-01T00:00:00Z'},
            {username: 'bob', sessionId: 's2', instanceType: 't3.small', creationTime: '2026-07-02T00:00:00Z'},
        ],
    }
    const openSessionUse = createMockOpenSessionUse(0)

    await createSeed({workerClient, openSessionUse})()

    expect(openSessionUse.openSession).toHaveBeenCalledTimes(2)
    expect(openSessionUse.openSession).toHaveBeenCalledWith({
        sessionId: 's1', username: 'alice', instanceType: 'm5.large', from: new Date('2026-07-01T00:00:00Z'),
    })
    expect(openSessionUse.openSession).toHaveBeenCalledWith({
        sessionId: 's2', username: 'bob', instanceType: 't3.small', from: new Date('2026-07-02T00:00:00Z'),
    })
})

// Seeding is a one-off: an already-populated table is the reconciler's to correct, not the seed's.
test('asks the worker for nothing once session use has been recorded', async () => {
    const openSessions = jest.fn()
    const openSessionUse = createMockOpenSessionUse(1)

    await createSeed({workerClient: {openSessions}, openSessionUse})()

    expect(openSessions).not.toHaveBeenCalled()
    expect(openSessionUse.openSession).not.toHaveBeenCalled()
})
