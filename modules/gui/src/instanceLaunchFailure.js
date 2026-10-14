import {msg} from '~/translate'
import {budgetMessageKey, budgetMessageKeys} from '~/widget/budgetRules'

// A launch AWS refused comes back as a 503 with a code (the worker's instanceLaunchErrors.js, passed
// on by the gateway for app starts): INSTANCE_UNAVAILABLE when AWS has no capacity for the instance
// type in SEPAL's region, or does not offer it there; QUOTA_EXCEEDED when the account's limits are
// reached.
const launchFailureCode = error =>
    error?.status === 503
        ? error.response?.code ?? null
        : null

// Asking again at once meets the same answer, and every retry is another launch attempt.
export const launchFailureRetry = {
    skip: error => (error.status && error.status < 500) || !!launchFailureCode(error)
}

const isBudgetRefusal = error =>
    error?.status === 403 && error.response?.code === 'BUDGET_EXCEEDED'

// Only AWS being unable to provide the type is the user's to know about: they can pick another type
// or wait. Anything else, the account quota included, is ours, and keeps the caller's generic message.
// A budget refusal is the user's own limit, and names which one.
export const launchFailureMessage = error => {
    if (isBudgetRefusal(error)) {
        const {messageKey} = error.response
        return msg(budgetMessageKeys.includes(messageKey) ? messageKey : budgetMessageKey())
    }
    return launchFailureCode(error) === 'INSTANCE_UNAVAILABLE'
        ? msg('instanceLaunch.unavailable')
        : null
}
