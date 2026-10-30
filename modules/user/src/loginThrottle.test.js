import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {LoginThrottle} from './loginThrottle.js'

const WINDOW_MS = 15 * 60 * 1000

describe('LoginThrottle', () => {
    test('refuses a username at a client address once its failures there reach the limit', () => {
        const throttle = new LoginThrottle({maxLoginFailures: 2})
        const login = {username: 'admin', clientIp: '10.0.0.1'}

        const attempts = [1, 2, 3].map(() => throttle.tryAttempt(login))

        assert.deepEqual(attempts, [true, true, false])
    })

    test('lets a username refused at one client address in from another', () => {
        const throttle = new LoginThrottle({maxLoginFailures: 1})
        throttle.tryAttempt({username: 'admin', clientIp: '10.0.0.1'})

        assert.equal(throttle.tryAttempt({username: 'admin', clientIp: '10.0.0.2'}), true)
    })

    test('refuses a client address once its failures reach the limit, for any username', () => {
        const throttle = new LoginThrottle({maxClientFailures: 2})

        const attempts = ['alice', 'bob', 'carol'].map(username =>
            throttle.tryAttempt({username, clientIp: '10.0.0.1'})
        )

        assert.deepEqual(attempts, [true, true, false])
    })

    test('counts usernames whatever their case', () => {
        const throttle = new LoginThrottle({maxLoginFailures: 1})
        throttle.tryAttempt({username: 'admin', clientIp: '10.0.0.1'})

        assert.equal(throttle.tryAttempt({username: 'Admin', clientIp: '10.0.0.1'}), false)
    })

    test('does not count a login that succeeded', () => {
        const throttle = new LoginThrottle({maxLoginFailures: 1})
        const login = {username: 'alice', clientIp: '10.0.0.1'}
        throttle.tryAttempt(login)

        throttle.succeeded(login)

        assert.equal(throttle.tryAttempt(login), true)
    })

    test('counts a login that has not completed yet', () => {
        const throttle = new LoginThrottle({maxLoginFailures: 1})
        const login = {username: 'admin', clientIp: '10.0.0.1'}
        throttle.tryAttempt(login)

        assert.equal(throttle.tryAttempt(login), false)
    })

    test('allows logins again once the window has passed', () => {
        let now = 0
        const throttle = new LoginThrottle({maxLoginFailures: 1, now: () => now})
        const login = {username: 'admin', clientIp: '10.0.0.1'}
        throttle.tryAttempt(login)

        now = WINDOW_MS

        assert.equal(throttle.tryAttempt(login), true)
    })
})
