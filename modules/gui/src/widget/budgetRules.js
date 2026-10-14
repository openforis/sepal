import moment from 'moment'

const fractionLeftOfMonth = () => 1 - moment().date() / moment().endOf('month').date()

export const hourlyInstanceSpending = (sessions = []) =>
    (sessions || []).reduce((total, {instanceType: {hourlyCost}}) => total + hourlyCost, 0)

export const hasBudget = (spending = {}) =>
    spending.monthlyInstanceBudget > 0
        || spending.monthlyStorageBudget > 0
        || spending.storageQuota > 0

// The first limit the spending is over, in the budget module's check order, so the reason shown
// here is the one the budget module refuses a session with.
export const exceededLimit = (spending = {}) => {
    const {
        monthlyInstanceBudget, monthlyInstanceSpending,
        monthlyStorageBudget, monthlyStorageSpending,
        storageQuota, storageUsed,
        dataQuota, dataUsed
    } = spending
    // Same thresholds as the budget module's verdict: a budget is spent once reached, a quota only
    // once passed.
    if (monthlyInstanceSpending >= monthlyInstanceBudget) {
        return 'INSTANCE_BUDGET'
    }
    if (monthlyStorageSpending >= monthlyStorageBudget) {
        return 'STORAGE_BUDGET'
    }
    if (storageUsed > storageQuota) {
        return 'STORAGE_QUOTA'
    }
    if (dataQuota != null && dataUsed > dataQuota) {
        return 'DATA_QUOTA'
    }
    return null
}

export const isBudgetExceeded = spending =>
    exceededLimit(spending) !== null

const MESSAGE_KEY_BY_REASON = {
    INSTANCE_BUDGET: 'error.budget.instanceBudgetExceeded',
    STORAGE_BUDGET: 'error.budget.storageBudgetExceeded',
    STORAGE_QUOTA: 'error.budget.storageQuotaExceeded',
    DATA_QUOTA: 'error.budget.dataQuotaExceeded'
}

export const budgetMessageKeys = Object.values(MESSAGE_KEY_BY_REASON)

export const budgetMessageKey = reason =>
    MESSAGE_KEY_BY_REASON[reason] ?? MESSAGE_KEY_BY_REASON.INSTANCE_BUDGET

export const projectStorageSpending = ({storageUsed, costPerGbMonth, monthlyStorageSpending}, fraction = fractionLeftOfMonth()) =>
    monthlyStorageSpending + storageUsed * costPerGbMonth * fraction

// The instance budget is read as a rate: what is left of it, divided by what the running sessions
// cost per hour. An hour or less of headroom is a warning — that is how long the user has to save
// their work before the sessions are stopped. Nothing running means no rate and no warning,
// however little is left.
const isInstanceBudgetImminent = ({monthlyInstanceBudget, monthlyInstanceSpending}, hourlyRate) =>
    hourlyRate > 0
        && monthlyInstanceBudget - monthlyInstanceSpending <= hourlyRate

export const isBudgetWarning = (spending, hourlyRate, fraction = fractionLeftOfMonth()) =>
    projectStorageSpending(spending, fraction) > spending.monthlyStorageBudget
        || isInstanceBudgetImminent(spending, hourlyRate)
