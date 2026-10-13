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

const userStorageUse = ({username, spending, use, budget, quota, dataUse, dataQuota}) => ({
    username,
    spending,
    use,
    budget,
    quota,
    dataUse,
    dataQuota,
    isBudgetExceeded: spending >= budget,
    isQuotaExceeded: use > quota,
    isDataQuotaExceeded: dataQuota != null && dataUse > dataQuota,
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
    dataCostPerGbMonth,
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
    dataCostPerGbMonth,
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
