import {createBudgetCommands} from './budgetCommands.js'

class InstanceBudgetExceeded extends Error {
    constructor(username) {
        super('Instance budget exceeded')
        this.name = 'InstanceBudgetExceeded'
        this.username = username
    }
}

class StorageBudgetExceeded extends Error {
    constructor(username) {
        super('Storage budget exceeded')
        this.name = 'StorageBudgetExceeded'
        this.username = username
    }
}

class DataQuotaExceeded extends Error {
    constructor(username) {
        super('Data quota exceeded')
        this.name = 'DataQuotaExceeded'
        this.username = username
    }
}

class StorageQuotaExceeded extends Error {
    constructor(username) {
        super('Storage quota exceeded')
        this.name = 'StorageQuotaExceeded'
        this.username = username
    }
}

// The reason a user is over budget. Sent on the wire by GET /budget/check/:username and mapped
// back to a typed error by the worker (modules/worker/src/workerSession/budgetErrors.js), so these
// strings are a cross-module contract — do not rename without changing the worker in lockstep.
const Reason = Object.freeze({
    INSTANCE_BUDGET: 'INSTANCE_BUDGET',
    STORAGE_BUDGET: 'STORAGE_BUDGET',
    STORAGE_QUOTA: 'STORAGE_QUOTA',
    DATA_QUOTA: 'DATA_QUOTA',
})

const ERROR_BY_REASON = {
    [Reason.INSTANCE_BUDGET]: InstanceBudgetExceeded,
    [Reason.STORAGE_BUDGET]: StorageBudgetExceeded,
    [Reason.STORAGE_QUOTA]: StorageQuotaExceeded,
    [Reason.DATA_QUOTA]: DataQuotaExceeded,
}

const createBudgetManager = ({repo, pricing, userClient, events, clock = () => new Date()}) => {
    const commands = createBudgetCommands({repo, hostingService: pricing, userClient, events, clock})

    // verdict — the authoritative over-budget decision for one user, reported rather than thrown.
    // The reason is the first limit exceeded: instance budget, then storage budget (home + Data
    // spending), then storage quota, then Data quota. dataQuotaExceeded is reported on its own,
    // whatever the reason, because user-data makes Data read-only on it alone. The checkUser*
    // commands emit the budget.* events as a side effect, so this is not read-only.
    const verdict = async username => {
        const instanceSpending = await commands.checkUserInstanceSpending(username)
        const storageUse = await commands.checkUserStorageUse(username)
        const reason = reasonFor(instanceSpending, storageUse)
        return {username, exceeded: reason != null, reason, dataQuotaExceeded: storageUse.isDataQuotaExceeded}
    }

    // check — the throwing form, on top of the one decision path in verdict().
    const check = async username => {
        const {exceeded, reason} = await verdict(username)
        if (exceeded)
            throw new ERROR_BY_REASON[reason](username)
    }

    const asSpending = report => ({
        monthlyInstanceBudget: report.instanceBudget,
        monthlyInstanceSpending: report.instanceSpending,
        monthlyStorageBudget: report.storageBudget,
        monthlyStorageSpending: report.storageSpending,
        storageQuota: report.storageQuota,
        storageUsed: report.storageUsage,
        costPerGbMonth: report.costPerGbMonth,
        dataQuota: report.dataQuota,
        dataUsed: report.dataUsage,
        dataCostPerGbMonth: report.dataCostPerGbMonth,
        budgetUpdateRequest: report.budgetUpdateRequest ?? null,
    })

    const userSpending = async username =>
        asSpending(await commands.generateUserSpendingReport(username))

    return {
        check,
        verdict,
        userSpending,
        asSpending,
        commands,
    }
}

const reasonFor = (instanceSpending, storageUse) => {
    if (instanceSpending.isBudgetExceeded)
        return Reason.INSTANCE_BUDGET
    if (storageUse.isBudgetExceeded)
        return Reason.STORAGE_BUDGET
    if (storageUse.isQuotaExceeded)
        return Reason.STORAGE_QUOTA
    if (storageUse.isDataQuotaExceeded)
        return Reason.DATA_QUOTA
    return null
}

export {
    createBudgetManager,
    DataQuotaExceeded,
    InstanceBudgetExceeded,
    Reason,
    StorageBudgetExceeded,
    StorageQuotaExceeded,
}
