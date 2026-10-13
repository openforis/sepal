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

// storageUseService works on a repository's home-storage methods; this gives it the Data ones.
const dataUseStore = repo => ({
    lastUserStorageUse: username => repo.lastUserDataUse(username),
    updateUserStorageUse: (username, storageUse) => repo.updateUserDataUse(username, storageUse),
})

const createBudgetCommands = ({repo, hostingService, userClient, events, clock}) => {
    const dataStore = dataUseStore(repo)

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
        const {homeUse, dataUse, spending} = await storageState(username, now)
        const budget = await repo.userBudget(username)
        const result = userStorageUseDto({
            username,
            spending,
            use: homeUse.gb,
            budget: budget.storageSpending,
            quota: budget.storageQuota,
            dataUse: dataUse.gb,
            dataQuota: budget.dataQuota,
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
        const {homeUse, dataUse, spending: storageSpending} = await storageState(username, now)
        const budget = await repo.userBudget(username)
        const budgetUpdateRequest = await repo.budgetUpdateRequest(username)
        return userSpendingReportDto({
            username,
            instanceSpending,
            storageSpending,
            storageUsage: homeUse.gb,
            instanceBudget: budget.instanceSpending,
            storageBudget: budget.storageSpending,
            storageQuota: budget.storageQuota,
            costPerGbMonth: hostingService.storageCostPerGbMonth,
            dataUsage: dataUse.gb,
            dataQuota: budget.dataQuota,
            dataCostPerGbMonth: hostingService.dataCostPerGbMonth,
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

    const updateUserDataUsage = async (username, gbUsed) => {
        await updateStorageUseForThisMonth(dataStore, username, gbUsed, clock())
    }

    const requestBudgetUpdate = async ({username, message, budget}) => {
        await repo.requestBudgetUpdate(username, message, budget)
    }

    const storageState = async (username, now) => {
        const homeUse = await storageUseForThisMonth(repo, username, now)
        const dataUse = await storageUseForThisMonth(dataStore, username, now)
        const spending = calculateStorageSpending(homeUse, hostingService.storageCostPerGbMonth, now)
            + calculateStorageSpending(dataUse, hostingService.dataCostPerGbMonth, now)
        return {homeUse, dataUse, spending}
    }

    return {
        checkUserInstanceSpending,
        checkUserStorageUse,
        generateSpendingReport,
        generateUserSpendingReport,
        loadSpendingReport,
        requestBudgetUpdate,
        updateBudget,
        updateSpendingReport,
        updateUserDataUsage,
        updateUserSpendingReport,
        updateUserStorageUsage,
    }
}

export {createBudgetCommands}
