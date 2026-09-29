import {msg} from '~/translate'

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

// Only AWS being unable to provide the type is the user's to know about: they can pick another type
// or wait. Anything else, the account quota included, is ours, and keeps the caller's generic message.
export const launchFailureMessage = error =>
    launchFailureCode(error) === 'INSTANCE_UNAVAILABLE'
        ? msg('instanceLaunch.unavailable')
        : null
