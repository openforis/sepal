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
    test('budget carries the four fields', () => {
        expect(budget({instanceSpending: 1, storageSpending: 2, storageQuota: 3, dataQuota: 4}))
            .toEqual({instanceSpending: 1, storageSpending: 2, storageQuota: 3, dataQuota: 4})
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

    describe('userStorageUse.isDataQuotaExceeded — Data use > Data quota (STRICT)', () => {
        test('Data use equal to the Data quota → false', () => {
            expect(userStorageUse({...withinBudget, dataUse: 10, dataQuota: 10}).isDataQuotaExceeded).toBe(false)
        })
        test('Data use above the Data quota → true', () => {
            expect(userStorageUse({...withinBudget, dataUse: 10.1, dataQuota: 10}).isDataQuotaExceeded).toBe(true)
        })
        test('no Data quota (missing default) → never exceeded', () => {
            expect(userStorageUse({...withinBudget, dataUse: 1000, dataQuota: null}).isDataQuotaExceeded).toBe(false)
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

    test('userSpendingReport carries the eleven fields', () => {
        const r = userSpendingReport({
            username: 'a', instanceSpending: 1, storageSpending: 2, storageUsage: 3, dataUsage: 7,
            instanceBudget: 4, storageBudget: 5, storageQuota: 6, dataQuota: 8, costPerGbMonth: 0.33,
            budgetUpdateRequest: null,
        })
        expect(r).toEqual({
            username: 'a', instanceSpending: 1, storageSpending: 2, storageUsage: 3, dataUsage: 7,
            instanceBudget: 4, storageBudget: 5, storageQuota: 6, dataQuota: 8, costPerGbMonth: 0.33,
            budgetUpdateRequest: null,
        })
    })

    test('budgetUpdateRequest carries message/spending/quotas/times', () => {
        const c = new Date('2026-06-01T00:00:00Z')
        const u = new Date('2026-06-02T00:00:00Z')
        expect(budgetUpdateRequest({
            message: 'please', instanceSpending: 1, storageSpending: 2, storageQuota: 3, dataQuota: 4,
            creationTime: c, updateTime: u,
        })).toEqual({
            message: 'please', instanceSpending: 1, storageSpending: 2, storageQuota: 3, dataQuota: 4,
            creationTime: c, updateTime: u,
        })
    })
})

const withinBudget = {username: 'a', spending: 1, use: 1, budget: 5, quota: 10}
