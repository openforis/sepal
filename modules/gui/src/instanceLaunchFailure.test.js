import {describe, expect, it, vi} from 'vitest'

// msg() needs the React intl provider; the key is what matters here.
vi.mock('~/translate', () => ({msg: key => key}))

import {launchFailureMessage, launchFailureRetry} from './instanceLaunchFailure'

const launchFailure = code => ({status: 503, response: {code, message: 'from AWS'}})

describe('launchFailureMessage', () => {
    it('explains that AWS cannot provide the instance type', () => {
        expect(launchFailureMessage(launchFailure('INSTANCE_UNAVAILABLE'))).toBe('instanceLaunch.unavailable')
    })

    // The account quota is SEPAL's limit, not AWS running out, so it is not blamed on AWS.
    it('leaves every other failure to the generic message', () => {
        expect(launchFailureMessage(launchFailure('QUOTA_EXCEEDED'))).toBeNull()
        expect(launchFailureMessage({status: 503, response: null})).toBeNull()
        expect(launchFailureMessage({status: 500, response: {code: 'INSTANCE_UNAVAILABLE'}})).toBeNull()
        expect(launchFailureMessage(new Error('boom'))).toBeNull()
    })
})

describe('launchFailureMessage for a budget refusal', () => {
    const refusal = messageKey => ({status: 403, response: {code: 'BUDGET_EXCEEDED', reason: 'X', messageKey}})

    it('says which limit refused the session', () => {
        for (const key of ['instanceBudgetExceeded', 'storageBudgetExceeded', 'storageQuotaExceeded', 'dataQuotaExceeded']) {
            expect(launchFailureMessage(refusal(`error.budget.${key}`))).toBe(`error.budget.${key}`)
        }
    })

    it('falls back to the instance budget message for a key the GUI does not know', () => {
        expect(launchFailureMessage(refusal('error.budget.fromTheFuture'))).toBe('error.budget.instanceBudgetExceeded')
        expect(launchFailureMessage(refusal(undefined))).toBe('error.budget.instanceBudgetExceeded')
    })

    it('leaves any other 403 to the generic message', () => {
        expect(launchFailureMessage({status: 403, response: {error: 'nope'}})).toBeNull()
        expect(launchFailureMessage({status: 403, response: null})).toBeNull()
    })

    it('does not retry a refusal', () => {
        expect(launchFailureRetry.skip(refusal('error.budget.dataQuotaExceeded'))).toBe(true)
    })
})

describe('launchFailureRetry', () => {
    it('does not retry a launch AWS refused', () => {
        expect(launchFailureRetry.skip(launchFailure('INSTANCE_UNAVAILABLE'))).toBe(true)
        expect(launchFailureRetry.skip(launchFailure('QUOTA_EXCEEDED'))).toBe(true)
    })

    it('retries a plain service outage, and never a client error, as the default does', () => {
        expect(launchFailureRetry.skip({status: 503, response: null})).toBe(false)
        expect(launchFailureRetry.skip({status: 404})).toBe(true)
    })
})
