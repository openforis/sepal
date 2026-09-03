import {describe, expect, it} from 'vitest'

import {hasBudget, hourlyInstanceSpending, isBudgetExceeded, isBudgetWarning} from './budgetRules'

const session = hourlyCost => ({instanceType: {hourlyCost}})

// Storage is projected to month end, so a warning there is hours or days away. Instance spending is
// read as a rate against what is left of the budget, so a warning there means the sessions stop
// within the hour. Both raise the same flag.
const spending = ({
    instanceBudget = 0, instanceSpending = 0,
    storageBudget = 0, storageSpending = 0,
    storageQuota = 0, storageUsed = 0, costPerGbMonth = 0
} = {}) => ({
    monthlyInstanceBudget: instanceBudget,
    monthlyInstanceSpending: instanceSpending,
    monthlyStorageBudget: storageBudget,
    monthlyStorageSpending: storageSpending,
    storageQuota,
    storageUsed,
    costPerGbMonth
})

describe('hourlyInstanceSpending', () => {
    it('sums the hourly cost of every session in the report', () => {
        expect(hourlyInstanceSpending([session(0.5), session(1.25)])).toBe(1.75)
    })

    it('is zero when nothing is running', () => {
        expect(hourlyInstanceSpending([])).toBe(0)
    })

    it('copes with a report that has not arrived yet', () => {
        expect(hourlyInstanceSpending(undefined)).toBe(0)
    })
})

describe('isBudgetWarning on instance spending', () => {
    it('warns when the budget runs out within the hour at the current rate', () => {
        const s = spending({instanceBudget: 10, instanceSpending: 9.5})
        expect(isBudgetWarning(s, hourlyInstanceSpending([session(1)]))).toBe(true)
    })

    it('warns when exactly one hour is left', () => {
        const s = spending({instanceBudget: 10, instanceSpending: 9})
        expect(isBudgetWarning(s, hourlyInstanceSpending([session(1)]))).toBe(true)
    })

    it('stays quiet while more than an hour is left', () => {
        const s = spending({instanceBudget: 10, instanceSpending: 8.9})
        expect(isBudgetWarning(s, hourlyInstanceSpending([session(1)]))).toBe(false)
    })

    // Nothing is running, so nothing is being spent — however little is left of the budget, it is
    // not about to run out.
    it('stays quiet when no session is burning anything', () => {
        const s = spending({instanceBudget: 10, instanceSpending: 9.99})
        expect(isBudgetWarning(s, hourlyInstanceSpending([]))).toBe(false)
    })

    it('warns once the budget is already spent and a session is still running', () => {
        const s = spending({instanceBudget: 10, instanceSpending: 10})
        expect(isBudgetWarning(s, hourlyInstanceSpending([session(1)]))).toBe(true)
    })
})

describe('isBudgetWarning on storage spending', () => {
    // 1 GB at 2/GB/month with half the month left projects 1 on top of the 1 already spent, over a
    // budget of 1.5.
    it('warns when storage is projected to overrun the budget by month end', () => {
        const s = spending({storageBudget: 1.5, storageSpending: 1, storageUsed: 1, costPerGbMonth: 2})
        expect(isBudgetWarning(s, 0, 0.5)).toBe(true)
    })

    it('stays quiet when the projection lands inside the budget', () => {
        const s = spending({storageBudget: 2.5, storageSpending: 1, storageUsed: 1, costPerGbMonth: 2})
        expect(isBudgetWarning(s, 0, 0.5)).toBe(false)
    })
})

describe('hasBudget', () => {
    it('is true when any one of the three limits is set', () => {
        expect(hasBudget(spending({instanceBudget: 1}))).toBe(true)
        expect(hasBudget(spending({storageBudget: 1}))).toBe(true)
        expect(hasBudget(spending({storageQuota: 1}))).toBe(true)
    })

    it('is false when the user is unlimited', () => {
        expect(hasBudget(spending())).toBe(false)
    })

    // The button renders before the budget ws has pushed anything.
    it('copes with a snapshot that has not arrived yet', () => {
        expect(hasBudget(undefined)).toBe(false)
    })
})

describe('isBudgetExceeded', () => {
    it('is true once any one of the three limits is reached', () => {
        expect(isBudgetExceeded(spending({instanceBudget: 1, instanceSpending: 1}))).toBe(true)
        expect(isBudgetExceeded(spending({storageBudget: 1, storageSpending: 1}))).toBe(true)
        expect(isBudgetExceeded(spending({storageQuota: 1, storageUsed: 1}))).toBe(true)
    })

    it('is false while every limit still has room', () => {
        expect(isBudgetExceeded(spending({
            instanceBudget: 10, instanceSpending: 1,
            storageBudget: 10, storageSpending: 1,
            storageQuota: 10, storageUsed: 1
        }))).toBe(false)
    })

    it('copes with a snapshot that has not arrived yet', () => {
        expect(isBudgetExceeded(undefined)).toBe(false)
    })
})
