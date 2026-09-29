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
