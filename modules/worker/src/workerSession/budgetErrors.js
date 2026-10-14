// Typed errors thrown when a session is refused for budget reasons — one per limit.
//
// All four are ClientExceptions carrying statusCode 403, so the shared httpServer answers
// `POST /sessions/instance-type/:type` with a 403 rather than the default 500 — a refusal is the
// user's problem to act on, not a server fault.

import {ClientException} from '#sepal/exception'

const budgetException = (name, reason, message, key) =>
    class extends ClientException {
        constructor(username) {
            super(message, {statusCode: 403, userMessage: {message, key}})
            this.name = name
            this.reason = reason
            this.username = username
        }
    }

const InstanceBudgetExceeded = budgetException(
    'InstanceBudgetExceeded', 'INSTANCE_BUDGET', 'Instance budget exceeded', 'error.budget.instanceBudgetExceeded')

const StorageBudgetExceeded = budgetException(
    'StorageBudgetExceeded', 'STORAGE_BUDGET', 'Storage budget exceeded', 'error.budget.storageBudgetExceeded')

const StorageQuotaExceeded = budgetException(
    'StorageQuotaExceeded', 'STORAGE_QUOTA', 'Storage quota exceeded', 'error.budget.storageQuotaExceeded')

const DataQuotaExceeded = budgetException(
    'DataQuotaExceeded', 'DATA_QUOTA', 'Data quota exceeded', 'error.budget.dataQuotaExceeded')

// reason → error. The reason strings are the budget module's wire contract
// (modules/budget/src/budgetManager.js `Reason`); keep both sides in lockstep.
const ERROR_BY_REASON = {
    INSTANCE_BUDGET: InstanceBudgetExceeded,
    STORAGE_BUDGET: StorageBudgetExceeded,
    STORAGE_QUOTA: StorageQuotaExceeded,
    DATA_QUOTA: DataQuotaExceeded,
}

// budgetErrorFor — an unknown/absent reason still yields an error: the budget module said the user
// is over budget, and failing to map the reason must never turn that refusal into a granted session.
const budgetErrorFor = (reason, username) =>
    new (ERROR_BY_REASON[reason] ?? InstanceBudgetExceeded)(username)

// budgetRefusal — the client-facing form of a budget error, or null for any other error. The GUI
// and the gateway recognise a refusal by `code`; `reason` names the limit and `messageKey` is the
// GUI translation key.
const budgetRefusal = error =>
    Object.values(ERROR_BY_REASON).some(type => error instanceof type)
        ? {code: 'BUDGET_EXCEEDED', reason: error.reason, messageKey: error.userMessage.key}
        : null

export {budgetErrorFor, budgetRefusal, DataQuotaExceeded, InstanceBudgetExceeded, StorageBudgetExceeded, StorageQuotaExceeded}
