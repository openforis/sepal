import {jest} from '@jest/globals'

import {createSessionEventHandlers} from './sessionEventHandlers.js'

describe('onWorkerSessionActivated', () => {
    test('maps {username, session} onto openSessionUse.openSession', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        const session = {id: 'sess-1', instanceType: 'T3aSmall', creationTime: '2026-07-01T00:00:00Z'}
        await handlers.onWorkerSessionActivated({username: 'alice', session})

        expect(openSessionUse.openSession).toHaveBeenCalledTimes(1)
        expect(openSessionUse.openSession).toHaveBeenCalledWith({
            sessionId: 'sess-1',
            username: 'alice',
            instanceType: 'T3aSmall',
            from: new Date('2026-07-01T00:00:00Z'),
        })
    })
})

describe('onWorkerSessionRequested', () => {
    test('opens the use row at creationTime, so a session that never activates is still billed', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        const session = {id: 'sess-1', instanceType: 'T3aSmall', creationTime: '2026-07-01T00:00:00Z'}
        await handlers.onWorkerSessionRequested({username: 'alice', session})

        expect(openSessionUse.openSession).toHaveBeenCalledWith({
            sessionId: 'sess-1',
            username: 'alice',
            instanceType: 'T3aSmall',
            from: new Date('2026-07-01T00:00:00Z'),
        })
    })

    test('the later Activated delivery re-opens the same row with identical values (idempotent upsert)', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        const session = {id: 'sess-1', instanceType: 'T3aSmall', creationTime: '2026-07-01T00:00:00Z'}
        await handlers.onWorkerSessionRequested({username: 'alice', session})
        await handlers.onWorkerSessionActivated({username: 'alice', session})

        expect(openSessionUse.openSession.mock.calls[0]).toEqual(openSessionUse.openSession.mock.calls[1])
    })
})

describe('onWorkerSessionClosed', () => {
    test('maps {sessionId} + an injected now onto openSessionUse.closeSession', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        const now = new Date('2026-07-02T12:00:00Z')
        await handlers.onWorkerSessionClosed({sessionId: 'sess-1'}, now)

        expect(openSessionUse.closeSession).toHaveBeenCalledWith({sessionId: 'sess-1', to: now})
    })

    test('defaults to≈Date.now() when now is not injected', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        const before = Date.now()
        await handlers.onWorkerSessionClosed({sessionId: 'sess-1'})
        const after = Date.now()

        const {to} = openSessionUse.closeSession.mock.calls[0][0]
        expect(to.getTime()).toBeGreaterThanOrEqual(before)
        expect(to.getTime()).toBeLessThanOrEqual(after)
    })
})

describe('onUserStorageSize', () => {
    test('converts bytes to GB, then refreshes the user\'s spending report', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        await handlers.onUserStorageSize({username: 'bob', size: 5_000_000_000}) // 5e9 bytes = 5 GB

        expect(budgetCommands.updateUserStorageUsage).toHaveBeenCalledWith('bob', 5)
        expect(budgetCommands.updateUserSpendingReport).toHaveBeenCalledWith('bob')
    })

    // The report is built from the storage usage, so it has to be refreshed after the usage lands.
    test('records the usage before refreshing the report', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const calls = []
        const budgetCommands = {
            updateUserStorageUsage: jest.fn(async () => { calls.push('updateUserStorageUsage') }),
            updateUserSpendingReport: jest.fn(async () => { calls.push('updateUserSpendingReport') }),
        }
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        await handlers.onUserStorageSize({username: 'bob', size: 1e9})

        expect(calls).toEqual(['updateUserStorageUsage', 'updateUserSpendingReport'])
    })

    test('leaves the report alone when the usage could not be recorded', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = {
            updateUserStorageUsage: jest.fn(async () => { throw new Error('boom') }),
            updateUserSpendingReport: jest.fn(),
        }
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        await expect(handlers.onUserStorageSize({username: 'bob', size: 1e9})).rejects.toThrow('boom')
        expect(budgetCommands.updateUserSpendingReport).not.toHaveBeenCalled()
    })

    test('skips a malformed event with a null size (does not update, does not throw)', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        await expect(handlers.onUserStorageSize({username: 'bob', size: null})).resolves.toBeUndefined()

        expect(budgetCommands.updateUserStorageUsage).not.toHaveBeenCalled()
        expect(budgetCommands.updateUserSpendingReport).not.toHaveBeenCalled()
    })

    test('skips a malformed event with an undefined username (does not update, does not throw)', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        await expect(handlers.onUserStorageSize({username: undefined, size: 100})).resolves.toBeUndefined()

        expect(budgetCommands.updateUserStorageUsage).not.toHaveBeenCalled()
        expect(budgetCommands.updateUserSpendingReport).not.toHaveBeenCalled()
    })
})

const createMockOpenSessionUse = () => ({
    openSession: jest.fn(),
    closeSession: jest.fn(),
    removeUser: jest.fn(),
})

const createMockBudgetCommands = () => ({
    updateUserStorageUsage: jest.fn(),
    updateUserSpendingReport: jest.fn(),
})
