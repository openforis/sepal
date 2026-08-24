// Unit tests for the typed budget errors requestSession throws, and for the reason → error
// mapping that turns the budget module's wire verdict back into one of them.

import {
    budgetErrorFor,
    InstanceBudgetExceeded,
    StorageBudgetExceeded,
    StorageQuotaExceeded,
} from './budgetErrors.js'

test('InstanceBudgetExceeded is an Error subclass carrying name + username', () => {
    const err = new InstanceBudgetExceeded('bob')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(InstanceBudgetExceeded)
    expect(err.name).toBe('InstanceBudgetExceeded')
    expect(err.username).toBe('bob')
})

test('StorageBudgetExceeded is an Error subclass carrying name + username', () => {
    const err = new StorageBudgetExceeded('bob')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(StorageBudgetExceeded)
    expect(err.name).toBe('StorageBudgetExceeded')
    expect(err.username).toBe('bob')
})

test('StorageQuotaExceeded is an Error subclass carrying name + username', () => {
    const err = new StorageQuotaExceeded('bob')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(StorageQuotaExceeded)
    expect(err.name).toBe('StorageQuotaExceeded')
    expect(err.username).toBe('bob')
})

// The status code is the whole point of the typed errors on the /sessions surface: without it the
// shared httpServer defaults to 500 and an over-budget user looks like a server fault.
test.each([InstanceBudgetExceeded, StorageBudgetExceeded, StorageQuotaExceeded])(
    '%p carries statusCode 403 and a user message', Err => {
        const err = new Err('bob')
        expect(err.statusCode).toBe(403)
        expect(err.userMessage.key).toMatch(/^error\.budget\./)
    })

describe('budgetErrorFor', () => {
    test.each([
        ['INSTANCE_BUDGET', InstanceBudgetExceeded],
        ['STORAGE_BUDGET', StorageBudgetExceeded],
        ['STORAGE_QUOTA', StorageQuotaExceeded],
    ])('%s → %p', (reason, Expected) => {
        const err = budgetErrorFor(reason, 'bob')
        expect(err).toBeInstanceOf(Expected)
        expect(err.username).toBe('bob')
    })

    test('an unknown or absent reason falls back to InstanceBudgetExceeded — a refusal must never be silently dropped', () => {
        expect(budgetErrorFor('SOMETHING_NEW', 'bob')).toBeInstanceOf(InstanceBudgetExceeded)
        expect(budgetErrorFor(null, 'bob')).toBeInstanceOf(InstanceBudgetExceeded)
        expect(budgetErrorFor(undefined, 'bob')).toBeInstanceOf(InstanceBudgetExceeded)
    })
})

test('every error name is in the task API\'s BUDGET_ERROR_NAMES set (mapped to 403, not 500)', async () => {
    const {createTasksApi} = await import('../task/tasksApi.js')
    const {mapError} = createTasksApi({taskManager: {}})._internal
    for (const Err of [InstanceBudgetExceeded, StorageBudgetExceeded, StorageQuotaExceeded]) {
        expect(mapError(new Err('bob'))).toEqual({status: 403, message: expect.any(String)})
    }
})
