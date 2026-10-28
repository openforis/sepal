import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {
    budget,
    budgetUpdateRequest,
    instanceUse,
    storageUse,
    userInstanceSpending,
    userSpendingReport,
    userStorageUse,
} from './dto.js'

describe('budget DTOs', () => {
    test('budget carries the three fields', () => {
        assert.deepEqual(
            budget({instanceSpending: 1, storageSpending: 2, storageQuota: 3}),
            {instanceSpending: 1, storageSpending: 2, storageQuota: 3}
        )
    })

    describe('userInstanceSpending.isBudgetExceeded — spending >= budget (non-strict)', () => {
        test('spending below budget → false', () => {
            assert.equal(
                userInstanceSpending({username: 'a', spending: 9, budget: 10}).isBudgetExceeded,
                false
            )
        })
        test('spending equal to budget → true (>=)', () => {
            assert.equal(
                userInstanceSpending({username: 'a', spending: 10, budget: 10}).isBudgetExceeded,
                true
            )
        })
        test('spending above budget → true', () => {
            assert.equal(
                userInstanceSpending({username: 'a', spending: 11, budget: 10}).isBudgetExceeded,
                true
            )
        })
    })

    describe('userStorageUse thresholds — budget >= (non-strict), quota > (STRICT)', () => {
        test('spending equal to budget → isBudgetExceeded true', () => {
            const u = userStorageUse({username: 'a', spending: 5, use: 1, budget: 5, quota: 10})
            assert.equal(u.isBudgetExceeded, true)
        })
        test('spending below budget → isBudgetExceeded false', () => {
            const u = userStorageUse({username: 'a', spending: 4.9, use: 1, budget: 5, quota: 10})
            assert.equal(u.isBudgetExceeded, false)
        })
        test('use equal to quota → isQuotaExceeded false (STRICT >)', () => {
            const u = userStorageUse({username: 'a', spending: 1, use: 10, budget: 5, quota: 10})
            assert.equal(u.isQuotaExceeded, false)
        })
        test('use above quota → isQuotaExceeded true', () => {
            const u = userStorageUse({username: 'a', spending: 1, use: 10.1, budget: 5, quota: 10})
            assert.equal(u.isQuotaExceeded, true)
        })
    })

    test('storageUse carries gbHours/gb/updateTime', () => {
        const t = new Date('2026-06-01T00:00:00Z')
        assert.deepEqual(
            storageUse({gbHours: 12, gb: 3, updateTime: t}),
            {gbHours: 12, gb: 3, updateTime: t}
        )
    })

    test('instanceUse carries instanceType/from/to', () => {
        const from = new Date('2026-06-01T00:00:00Z')
        const to = new Date('2026-06-01T01:00:00Z')
        assert.deepEqual(
            instanceUse({instanceType: 't2', from, to}),
            {instanceType: 't2', from, to}
        )
    })

    test('userSpendingReport carries the nine fields', () => {
        const r = userSpendingReport({
            username: 'a', instanceSpending: 1, storageSpending: 2, storageUsage: 3,
            instanceBudget: 4, storageBudget: 5, storageQuota: 6, costPerGbMonth: 0.33,
            budgetUpdateRequest: null,
        })
        assert.deepEqual(r, {
            username: 'a', instanceSpending: 1, storageSpending: 2, storageUsage: 3,
            instanceBudget: 4, storageBudget: 5, storageQuota: 6, costPerGbMonth: 0.33,
            budgetUpdateRequest: null,
        })
    })

    test('budgetUpdateRequest carries message/spending/quota/times', () => {
        const c = new Date('2026-06-01T00:00:00Z')
        const u = new Date('2026-06-02T00:00:00Z')
        assert.deepEqual(budgetUpdateRequest({
            message: 'please', instanceSpending: 1, storageSpending: 2, storageQuota: 3,
            creationTime: c, updateTime: u,
        }), {
            message: 'please', instanceSpending: 1, storageSpending: 2, storageQuota: 3,
            creationTime: c, updateTime: u,
        })
    })
})
