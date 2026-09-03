import * as events from './events.js'

describe('events exported surface', () => {
    test('exports all five emit functions', () => {
        expect(typeof events.emitUserBudgetExceeded).toBe('function')
        expect(typeof events.emitUserBudgetCleared).toBe('function')
        expect(typeof events.emitUserInstanceBudgetExceeded).toBe('function')
        expect(typeof events.emitUserStorageSpendingExceeded).toBe('function')
        expect(typeof events.emitUserStorageQuotaExceeded).toBe('function')
    })

    test('legacy no-op emitters (budgetCommands.js contract) do not throw', () => {
        expect(() => events.emitUserInstanceBudgetExceeded({username: 'u'})).not.toThrow()
        expect(() => events.emitUserStorageSpendingExceeded({username: 'u'})).not.toThrow()
        expect(() => events.emitUserStorageQuotaExceeded({username: 'u'})).not.toThrow()
    })

    test('legacy no-op emitters are not wired into BUDGET_PUBLISHERS', () => {
        const keys = events.BUDGET_PUBLISHERS.map(p => p.key)
        expect(keys).toEqual(['budget.UserBudgetExceeded', 'budget.UserBudgetCleared'])
    })
})
