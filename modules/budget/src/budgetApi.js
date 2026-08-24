const isBlank = value => value == null || typeof value !== 'string' || value.trim() === ''

// current.storageQuota deliberately carries the storage USAGE, not the quota; the quota is under
// budget.storageQuota. budgetUpdateRequest is normalised to null so JSON.stringify keeps the key.
const spendingAsMap = spending => ({
    current: {
        instanceSpending: spending.instanceSpending,
        storageSpending: spending.storageSpending,
        storageQuota: spending.storageUsage,
    },
    budget: {
        instanceSpending: spending.instanceBudget,
        storageSpending: spending.storageBudget,
        storageQuota: spending.storageQuota,
    },
    budgetUpdateRequest: spending.budgetUpdateRequest ?? null,
})

const reportToMap = report => {
    const map = {}
    for (const [username, spending] of Object.entries(report)) {
        map[username] = spendingAsMap(spending)
    }
    return map
}

const createBudgetApi = ({budgetManager, publishSpending = null}) => {
    const commands = budgetManager.commands

    // GET /budget/report [ADMIN] — the cached spending report as the report JSON map.
    const report = async ctx => {
        const report = await commands.loadSpendingReport()
        ctx.body = reportToMap(report)
    }

    // POST /budget [ADMIN] — set a user's budget; closes any pending update request.
    const updateBudget = async ctx => {
        const {username, instanceSpending, storageSpending, storageQuota} = ctx.request.body ?? {}
        if (isBlank(username)) {
            ctx.status = 400
            ctx.body = {message: 'username is required'}
            return
        }
        const budget = {
            instanceSpending: Number(instanceSpending),
            storageSpending: Number(storageSpending),
            storageQuota: Number(storageQuota),
        }
        if (!isValidBudget(budget)) {
            ctx.status = 400
            ctx.body = {message: 'instanceSpending, storageSpending and storageQuota must be numbers >= 0'}
            return
        }
        await commands.updateBudget({username, budget})
        await publishSpending?.(username)
        ctx.body = budget
    }

    // POST /budget/requestUpdate — request a budget change for the current user.
    const requestUpdate = async ctx => {
        const {message, instanceSpending, storageSpending, storageQuota} = ctx.request.body ?? {}
        if (isBlank(message)) {
            ctx.status = 400
            ctx.body = {message: 'message is required'}
            return
        }
        const budget = {
            instanceSpending: Number(instanceSpending),
            storageSpending: Number(storageSpending),
            storageQuota: Number(storageQuota),
        }
        if (!isValidBudget(budget)) {
            ctx.status = 400
            ctx.body = {message: 'instanceSpending, storageSpending and storageQuota must be numbers >= 0'}
            return
        }
        await commands.requestBudgetUpdate({
            username: ctx.state.currentUser.username,
            message,
            budget,
        })
        await publishSpending?.(ctx.state.currentUser.username)
        ctx.status = 204
    }

    // GET /budget/spending/:username [ADMIN, internal] — the 8-field Spending DTO for one user.
    const spending = async ctx => {
        ctx.body = await budgetManager.userSpending(ctx.params.username)
    }

    // GET /budget/check/:username [ADMIN, internal] — {username, exceeded, reason}. The worker
    // calls this synchronously before granting a session, so the verdict is computed live rather
    // than read from the hourly-refreshed report.
    const check = async ctx => {
        ctx.body = await budgetManager.verdict(ctx.params.username)
    }

    return {
        report,
        updateBudget,
        requestUpdate,
        spending,
        check,
        _internal: {spendingAsMap, reportToMap},
    }
}

const isValidBudget = budget =>
    [budget.instanceSpending, budget.storageSpending, budget.storageQuota]
        .every(value => Number.isFinite(value) && value >= 0)

export {createBudgetApi}
