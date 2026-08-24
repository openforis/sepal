// Typed errors thrown when a session is refused for budget reasons — one per limit.
//
// All three are ClientExceptions carrying statusCode 403, so the shared httpServer answers
// `POST /sessions/instance-type/:type` with a 403 rather than the default 500 — a refusal is the
// user's problem to act on, not a server fault. src/task/tasksApi.js maps them BY NAME instead
// (see its BUDGET_ERROR_NAMES set), to the same 403 on the /tasks surface; `name` must therefore
// stay the subclass name, not ClientException's.

import {ClientException} from '#sepal/exception'

const budgetException = (name, message, key) =>
    class extends ClientException {
        constructor(username) {
            super(message, {statusCode: 403, userMessage: {message, key}})
            this.name = name
            this.username = username
        }
    }

const InstanceBudgetExceeded = budgetException(
    'InstanceBudgetExceeded', 'Instance budget exceeded', 'error.budget.instanceBudgetExceeded')

const StorageBudgetExceeded = budgetException(
    'StorageBudgetExceeded', 'Storage budget exceeded', 'error.budget.storageBudgetExceeded')

const StorageQuotaExceeded = budgetException(
    'StorageQuotaExceeded', 'Storage quota exceeded', 'error.budget.storageQuotaExceeded')

// reason → error. The reason strings are the budget module's wire contract
// (modules/budget/src/budgetManager.js `Reason`); keep both sides in lockstep.
const ERROR_BY_REASON = {
    INSTANCE_BUDGET: InstanceBudgetExceeded,
    STORAGE_BUDGET: StorageBudgetExceeded,
    STORAGE_QUOTA: StorageQuotaExceeded,
}

// budgetErrorFor — an unknown/absent reason still yields an error: the budget module said the user
// is over budget, and failing to map the reason must never turn that refusal into a granted session.
const budgetErrorFor = (reason, username) =>
    new (ERROR_BY_REASON[reason] ?? InstanceBudgetExceeded)(username)

export {budgetErrorFor, InstanceBudgetExceeded, StorageBudgetExceeded, StorageQuotaExceeded}
