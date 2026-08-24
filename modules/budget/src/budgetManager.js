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
})

const ERROR_BY_REASON = {
    [Reason.INSTANCE_BUDGET]: InstanceBudgetExceeded,
    [Reason.STORAGE_BUDGET]: StorageBudgetExceeded,
    [Reason.STORAGE_QUOTA]: StorageQuotaExceeded,
}

const createBudgetManager = ({repo, pricing, userClient, events, clock = () => new Date()}) => {
    const commands = createBudgetCommands({repo, hostingService: pricing, userClient, events, clock})

    // verdict — the authoritative over-budget decision for one user, reported rather than thrown.
    // Short-circuits: instance budget first (a user over it never has their storage evaluated), then
    // storage budget, then quota. The checkUser* commands emit the budget.* events as a side
    // effect, so this is not read-only.
    const verdict = async username => {
        const instanceSpending = await commands.checkUserInstanceSpending(username)
        if (instanceSpending.isBudgetExceeded)
            return {username, exceeded: true, reason: Reason.INSTANCE_BUDGET}
        const storageUse = await commands.checkUserStorageUse(username)
        if (storageUse.isBudgetExceeded)
            return {username, exceeded: true, reason: Reason.STORAGE_BUDGET}
        if (storageUse.isQuotaExceeded)
            return {username, exceeded: true, reason: Reason.STORAGE_QUOTA}
        return {username, exceeded: false, reason: null}
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
        budgetUpdateRequest: report.budgetUpdateRequest ?? null,
    })

    const userSpending = async username =>
        asSpending(await commands.generateUserSpendingReport(username))

    const usersExceedingBudget = async () =>
        commands.findUsersExceedingBudget()

    return {
        check,
        verdict,
        userSpending,
        asSpending,
        usersExceedingBudget,
        commands,
    }
}

export {
    createBudgetManager,
    InstanceBudgetExceeded,
    Reason,
    StorageBudgetExceeded,
    StorageQuotaExceeded,
}
