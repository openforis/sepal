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
        expect(budget({instanceSpending: 1, storageSpending: 2, storageQuota: 3}))
            .toEqual({instanceSpending: 1, storageSpending: 2, storageQuota: 3})
    })

    describe('userInstanceSpending.isBudgetExceeded — spending >= budget (non-strict)', () => {
        test('spending below budget → false', () => {
            expect(userInstanceSpending({username: 'a', spending: 9, budget: 10}).isBudgetExceeded).toBe(false)
        })
        test('spending equal to budget → true (>=)', () => {
            expect(userInstanceSpending({username: 'a', spending: 10, budget: 10}).isBudgetExceeded).toBe(true)
        })
        test('spending above budget → true', () => {
            expect(userInstanceSpending({username: 'a', spending: 11, budget: 10}).isBudgetExceeded).toBe(true)
        })
    })

    describe('userStorageUse thresholds — budget >= (non-strict), quota > (STRICT)', () => {
        test('spending equal to budget → isBudgetExceeded true', () => {
            const u = userStorageUse({username: 'a', spending: 5, use: 1, budget: 5, quota: 10})
            expect(u.isBudgetExceeded).toBe(true)
        })
        test('spending below budget → isBudgetExceeded false', () => {
            const u = userStorageUse({username: 'a', spending: 4.9, use: 1, budget: 5, quota: 10})
            expect(u.isBudgetExceeded).toBe(false)
        })
        test('use equal to quota → isQuotaExceeded false (STRICT >)', () => {
            const u = userStorageUse({username: 'a', spending: 1, use: 10, budget: 5, quota: 10})
            expect(u.isQuotaExceeded).toBe(false)
        })
        test('use above quota → isQuotaExceeded true', () => {
            const u = userStorageUse({username: 'a', spending: 1, use: 10.1, budget: 5, quota: 10})
            expect(u.isQuotaExceeded).toBe(true)
        })
    })

    test('storageUse carries gbHours/gb/updateTime', () => {
        const t = new Date('2026-06-01T00:00:00Z')
        expect(storageUse({gbHours: 12, gb: 3, updateTime: t})).toEqual({gbHours: 12, gb: 3, updateTime: t})
    })

    test('instanceUse carries instanceType/from/to', () => {
        const from = new Date('2026-06-01T00:00:00Z')
        const to = new Date('2026-06-01T01:00:00Z')
        expect(instanceUse({instanceType: 't2', from, to})).toEqual({instanceType: 't2', from, to})
    })

    test('userSpendingReport carries the nine fields', () => {
        const r = userSpendingReport({
            username: 'a', instanceSpending: 1, storageSpending: 2, storageUsage: 3,
            instanceBudget: 4, storageBudget: 5, storageQuota: 6, costPerGbMonth: 0.33,
            budgetUpdateRequest: null,
        })
        expect(r).toEqual({
            username: 'a', instanceSpending: 1, storageSpending: 2, storageUsage: 3,
            instanceBudget: 4, storageBudget: 5, storageQuota: 6, costPerGbMonth: 0.33,
            budgetUpdateRequest: null,
        })
    })

    test('budgetUpdateRequest carries message/spending/quota/times', () => {
        const c = new Date('2026-06-01T00:00:00Z')
        const u = new Date('2026-06-02T00:00:00Z')
        expect(budgetUpdateRequest({
            message: 'please', instanceSpending: 1, storageSpending: 2, storageQuota: 3,
            creationTime: c, updateTime: u,
        })).toEqual({
            message: 'please', instanceSpending: 1, storageSpending: 2, storageQuota: 3,
            creationTime: c, updateTime: u,
        })
    })
})
