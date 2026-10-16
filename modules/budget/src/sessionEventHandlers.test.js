import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {createSessionEventHandlers} from './sessionEventHandlers.js'

describe('onWorkerSessionActivated', () => {
    test('maps {username, session} onto openSessionUse.openSession', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        const session = {id: 'sess-1', instanceType: 'T3aSmall', creationTime: '2026-07-01T00:00:00Z'}
        await handlers.onWorkerSessionActivated({username: 'alice', session})

        assert.equal(openSessionUse.openSession.mock.callCount(), 1)
        assert.deepEqual(callsOf(openSessionUse.openSession), [[{
            sessionId: 'sess-1',
            username: 'alice',
            instanceType: 'T3aSmall',
            from: new Date('2026-07-01T00:00:00Z'),
        }]])
    })
})

describe('onWorkerSessionRequested', () => {
    test('opens the use row at creationTime, so a session that never activates is still billed', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        const session = {id: 'sess-1', instanceType: 'T3aSmall', creationTime: '2026-07-01T00:00:00Z'}
        await handlers.onWorkerSessionRequested({username: 'alice', session})

        assert.deepEqual(callsOf(openSessionUse.openSession), [[{
            sessionId: 'sess-1',
            username: 'alice',
            instanceType: 'T3aSmall',
            from: new Date('2026-07-01T00:00:00Z'),
        }]])
    })

    test('the later Activated delivery re-opens the same row with identical values (idempotent upsert)', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        const session = {id: 'sess-1', instanceType: 'T3aSmall', creationTime: '2026-07-01T00:00:00Z'}
        await handlers.onWorkerSessionRequested({username: 'alice', session})
        await handlers.onWorkerSessionActivated({username: 'alice', session})

        assert.deepEqual(
            openSessionUse.openSession.mock.calls[0].arguments,
            openSessionUse.openSession.mock.calls[1].arguments
        )
    })
})

describe('onWorkerSessionClosed', () => {
    test('maps {sessionId} + an injected now onto openSessionUse.closeSession', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        const now = new Date('2026-07-02T12:00:00Z')
        await handlers.onWorkerSessionClosed({sessionId: 'sess-1'}, now)

        assert.deepEqual(callsOf(openSessionUse.closeSession), [[{sessionId: 'sess-1', to: now}]])
    })

    test('defaults to≈Date.now() when now is not injected', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        const before = Date.now()
        await handlers.onWorkerSessionClosed({sessionId: 'sess-1'})
        const after = Date.now()

        const {to} = openSessionUse.closeSession.mock.calls[0].arguments[0]
        assert.ok(to.getTime() >= before)
        assert.ok(to.getTime() <= after)
    })
})

describe('onUserStorageSize', () => {
    test('converts bytes to GB, then refreshes the user\'s spending report', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        await handlers.onUserStorageSize({username: 'bob', size: 5_000_000_000}) // 5e9 bytes = 5 GB

        assert.deepEqual(callsOf(budgetCommands.updateUserStorageUsage), [['bob', 5]])
        assert.deepEqual(callsOf(budgetCommands.updateUserSpendingReport), [['bob']])
    })

    // The report is built from the storage usage, so it has to be refreshed after the usage lands.
    test('records the usage before refreshing the report', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const calls = []
        const budgetCommands = {
            updateUserStorageUsage: mock.fn(async () => { calls.push('updateUserStorageUsage') }),
            updateUserSpendingReport: mock.fn(async () => { calls.push('updateUserSpendingReport') }),
        }
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        await handlers.onUserStorageSize({username: 'bob', size: 1e9})

        assert.deepEqual(calls, ['updateUserStorageUsage', 'updateUserSpendingReport'])
    })

    test('leaves the report alone when the usage could not be recorded', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = {
            updateUserStorageUsage: mock.fn(async () => { throw new Error('boom') }),
            updateUserSpendingReport: mock.fn(),
        }
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        await assert.rejects(handlers.onUserStorageSize({username: 'bob', size: 1e9}), /boom/)
        assert.equal(budgetCommands.updateUserSpendingReport.mock.callCount(), 0)
    })

    test('skips a malformed event with a null size (does not update, does not throw)', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        assert.equal(await handlers.onUserStorageSize({username: 'bob', size: null}), undefined)

        assert.equal(budgetCommands.updateUserStorageUsage.mock.callCount(), 0)
        assert.equal(budgetCommands.updateUserSpendingReport.mock.callCount(), 0)
    })

    test('skips a malformed event with an undefined username (does not update, does not throw)', async () => {
        const openSessionUse = createMockOpenSessionUse()
        const budgetCommands = createMockBudgetCommands()
        const handlers = createSessionEventHandlers({openSessionUse, budgetCommands})

        assert.equal(
            await handlers.onUserStorageSize({username: undefined, size: 100}),
            undefined
        )

        assert.equal(budgetCommands.updateUserStorageUsage.mock.callCount(), 0)
        assert.equal(budgetCommands.updateUserSpendingReport.mock.callCount(), 0)
    })
})

const createMockOpenSessionUse = () => ({
    openSession: mock.fn(),
    closeSession: mock.fn(),
    removeUser: mock.fn(),
})

const createMockBudgetCommands = () => ({
    updateUserStorageUsage: mock.fn(),
    updateUserSpendingReport: mock.fn(),
})
