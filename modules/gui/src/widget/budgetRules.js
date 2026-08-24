import moment from 'moment'

const fractionLeftOfMonth = () => 1 - moment().date() / moment().endOf('month').date()

export const hourlyInstanceSpending = (sessions = []) =>
    (sessions || []).reduce((total, {instanceType: {hourlyCost}}) => total + hourlyCost, 0)

export const hasBudget = (spending = {}) =>
    spending.monthlyInstanceBudget > 0
        || spending.monthlyStorageBudget > 0
        || spending.storageQuota > 0

export const isBudgetExceeded = (spending = {}) => {
    const {
        monthlyInstanceBudget, monthlyInstanceSpending,
        monthlyStorageBudget, monthlyStorageSpending,
        storageQuota, storageUsed
    } = spending
    return monthlyInstanceSpending >= monthlyInstanceBudget
        || monthlyStorageSpending >= monthlyStorageBudget
        || storageUsed >= storageQuota
}

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
