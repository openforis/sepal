import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import * as events from './events.js'

describe('events exported surface', () => {
    test('exports all five emit functions', () => {
        assert.equal(typeof events.emitUserBudgetExceeded, 'function')
        assert.equal(typeof events.emitUserBudgetCleared, 'function')
        assert.equal(typeof events.emitUserInstanceBudgetExceeded, 'function')
        assert.equal(typeof events.emitUserStorageSpendingExceeded, 'function')
        assert.equal(typeof events.emitUserStorageQuotaExceeded, 'function')
    })

    test('legacy no-op emitters (budgetCommands.js contract) do not throw', () => {
        assert.doesNotThrow(() => events.emitUserInstanceBudgetExceeded({username: 'u'}))
        assert.doesNotThrow(() => events.emitUserStorageSpendingExceeded({username: 'u'}))
        assert.doesNotThrow(() => events.emitUserStorageQuotaExceeded({username: 'u'}))
    })

    test('legacy no-op emitters are not wired into BUDGET_PUBLISHERS', () => {
        const keys = events.BUDGET_PUBLISHERS.map(p => p.key)
        assert.deepEqual(keys, ['budget.UserBudgetExceeded', 'budget.UserBudgetCleared'])
    })
})
