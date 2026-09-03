import {
    userInstanceSpending as userInstanceSpendingDto,
    userSpendingReport as userSpendingReportDto,
    userStorageUse as userStorageUseDto,
} from './dto.js'
import {instanceSpending as computeInstanceSpending} from './instanceSpendingCalculator.js'
import {
    calculateSpending as calculateStorageSpending,
    storageUseForThisMonth,
    updateStorageUseForThisMonth,
} from './storageUseService.js'

const createBudgetCommands = ({repo, hostingService, userClient, events, clock = () => new Date()}) => {
    const checkUserInstanceSpending = async username => {
        const spending = await computeInstanceSpending(
            repo, username, hostingService.hourlyCostByInstanceType(), clock)
        const budget = await repo.userBudget(username)
        const result = userInstanceSpendingDto({
            username,
            spending,
            budget: budget.instanceSpending,
        })
        if (result.isBudgetExceeded)
            events.emitUserInstanceBudgetExceeded(result)
        return result
    }

    const checkUserStorageUse = async username => {
        const now = clock()
        const storageUse = await storageUseForThisMonth(repo, username, now)
        const spending = calculateStorageSpending(storageUse, hostingService.storageCostPerGbMonth, now)
        const budget = await repo.userBudget(username)
        const result = userStorageUseDto({
            username,
            spending,
            use: storageUse.gb,
            budget: budget.storageSpending,
            quota: budget.storageQuota,
        })
        if (result.isBudgetExceeded)
            events.emitUserStorageSpendingExceeded(result)
        if (result.isQuotaExceeded)
            events.emitUserStorageQuotaExceeded(result)
        return result
    }

    const generateUserSpendingReport = async username => {
        const now = clock()
        const instanceSpending = await computeInstanceSpending(
            repo, username, hostingService.hourlyCostByInstanceType(), clock)
        const storageUse = await storageUseForThisMonth(repo, username, now)
        const storageSpending = calculateStorageSpending(
            storageUse, hostingService.storageCostPerGbMonth, now)
        const budget = await repo.userBudget(username)
        const budgetUpdateRequest = await repo.budgetUpdateRequest(username)
        return userSpendingReportDto({
            username,
            instanceSpending,
            storageSpending,
            storageUsage: storageUse.gb,
            instanceBudget: budget.instanceSpending,
            storageBudget: budget.storageSpending,
            storageQuota: budget.storageQuota,
            costPerGbMonth: hostingService.storageCostPerGbMonth,
            budgetUpdateRequest,
        })
    }

    const generateSpendingReport = async () => {
        const reports = {}
        await userClient.eachUsername(async username => {
            reports[username] = await generateUserSpendingReport(username)
        })
        return reports
    }

    const loadSpendingReport = async () =>
        repo.spendingReport()

    const findUsersExceedingBudget = async () => {
        const usersExceedingBudget = []
        await userClient.eachUsername(async username => {
            const instanceSpending = await checkUserInstanceSpending(username)
            if (instanceSpending.isBudgetExceeded) {
                usersExceedingBudget.push(username)
            } else {
                const storageUse = await checkUserStorageUse(username)
                if (storageUse.isBudgetExceeded || storageUse.isQuotaExceeded)
                    usersExceedingBudget.push(username)
            }
        })
        return usersExceedingBudget
    }

    const updateBudget = async ({username, budget}) => {
        if (username)
            await repo.updateBudget(username, budget)
        else
            await repo.updateDefaultBudget(budget)
    }

    const updateSpendingReport = async () => {
        const report = await generateSpendingReport()
        await repo.saveSpendingReport(report)
    }

    const updateUserSpendingReport = async username => {
        const report = await generateUserSpendingReport(username)
        await repo.updateSpendingReport(username, report)
        return report
    }

    const updateUserStorageUsage = async (username, gbUsed) => {
        await updateStorageUseForThisMonth(repo, username, gbUsed, clock())
    }

    const requestBudgetUpdate = async ({username, message, budget}) => {
        await repo.requestBudgetUpdate(username, message, budget)
    }

    return {
        checkUserInstanceSpending,
        checkUserStorageUse,
        findUsersExceedingBudget,
        generateSpendingReport,
        generateUserSpendingReport,
        loadSpendingReport,
        requestBudgetUpdate,
        updateBudget,
        updateSpendingReport,
        updateUserSpendingReport,
        updateUserStorageUsage,
    }
}

export {createBudgetCommands}
