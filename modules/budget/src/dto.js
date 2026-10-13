const budget = ({instanceSpending, storageSpending, storageQuota, dataQuota}) => ({
    instanceSpending,
    storageSpending,
    storageQuota,
    dataQuota,
})

const userInstanceSpending = ({username, spending, budget}) => ({
    username,
    spending,
    budget,
    isBudgetExceeded: spending >= budget,
})

const userStorageUse = ({username, spending, use, budget, quota}) => ({
    username,
    spending,
    use,
    budget,
    quota,
    isBudgetExceeded: spending >= budget,
    isQuotaExceeded: use > quota,
})

const storageUse = ({gbHours, gb, updateTime}) => ({
    gbHours,
    gb,
    updateTime,
})

const instanceUse = ({instanceType, from, to}) => ({
    instanceType,
    from,
    to,
})

const userSpendingReport = ({
    username,
    instanceSpending,
    storageSpending,
    storageUsage,
    instanceBudget,
    storageBudget,
    storageQuota,
    costPerGbMonth,
    budgetUpdateRequest,
    dataUsage,
    dataQuota,
}) => ({
    username,
    instanceSpending,
    storageSpending,
    storageUsage,
    instanceBudget,
    storageBudget,
    storageQuota,
    costPerGbMonth,
    budgetUpdateRequest,
    dataUsage,
    dataQuota,
})

const budgetUpdateRequest = ({
    message,
    instanceSpending,
    storageSpending,
    storageQuota,
    dataQuota,
    creationTime,
    updateTime,
}) => ({
    message,
    instanceSpending,
    storageSpending,
    storageQuota,
    dataQuota,
    creationTime,
    updateTime,
})

export {
    budget,
    budgetUpdateRequest,
    instanceUse,
    storageUse,
    userInstanceSpending,
    userSpendingReport,
    userStorageUse,
}
