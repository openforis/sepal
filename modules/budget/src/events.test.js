import * as events from './events.js'

const publisher = key => events.BUDGET_PUBLISHERS.find(p => p.key === key).publish$

describe('events exported surface', () => {
    test('exports all five emit functions', () => {
        expect(typeof events.emitUserBudgetExceeded).toBe('function')
        expect(typeof events.emitUserBudgetCleared).toBe('function')
        expect(typeof events.emitUserInstanceBudgetExceeded).toBe('function')
        expect(typeof events.emitUserStorageSpendingExceeded).toBe('function')
        expect(typeof events.emitUserStorageQuotaExceeded).toBe('function')
    })

    test('Exceeded events carry the reason and whether the Data quota is exceeded', () => {
        const received = []
        const subscription = publisher('budget.UserBudgetExceeded').subscribe(event => received.push(event))

        events.emitUserBudgetExceeded('alice', 'INSTANCE_BUDGET', true)
        subscription.unsubscribe()

        expect(received).toEqual([{username: 'alice', reason: 'INSTANCE_BUDGET', dataQuotaExceeded: true}])
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
