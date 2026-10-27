import assert from 'node:assert/strict'
import {before, describe, mock, test} from 'node:test'

import {of} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

// The user module answers the most recent login, the worker module the most recently closed session;
// both are faked at the HTTP client, so these tests pin the response contract storage relies on.
const INACTIVITY_TIMEOUT_DAYS = 30
const DAY = 24 * 60 * 60 * 1000

const responses = {}

mock.module('./config.js', {
    exports: {
        gatewayHost: 'gateway',
        sepalUsername: 'admin',
        sepalPassword: 'secret',
        inactivityTimeout: INACTIVITY_TIMEOUT_DAYS * DAY
    }
})
mock.module('#sepal/httpClient', {
    exports: {
        get$: url => of({statusCode: 200, body: responses[new URL(url).pathname]})
    }
})

const {isActive} = await import('./activity.js')

describe('isActive', () => {
    before(() => configureNoLogging())

    test('treats a user who never logged in nor closed a session as inactive', async () => {
        givenAccess({login: {}, session: {}})

        assert.equal(await isActive(USERNAME), false)
    })

    test('treats a user who logged in within the timeout as active', async () => {
        givenAccess({login: {timestamp: daysAgo(1)}, session: {}})

        assert.equal(await isActive(USERNAME), true)
    })

    test('treats a user whose session closed within the timeout as active, however old their login', async () => {
        givenAccess({login: {timestamp: daysAgo(INACTIVITY_TIMEOUT_DAYS + 30)}, session: {timestamp: daysAgo(1)}})

        assert.equal(await isActive(USERNAME), true)
    })

    test('treats a user whose last access is older than the timeout as inactive', async () => {
        givenAccess({login: {timestamp: daysAgo(INACTIVITY_TIMEOUT_DAYS + 1)}, session: {timestamp: daysAgo(INACTIVITY_TIMEOUT_DAYS + 2)}})

        assert.equal(await isActive(USERNAME), false)
    })

    test('refuses to decide when a login response carries no timestamp', async () => {
        givenAccess({login: {lastLogin: daysAgo(1)}, session: {}})

        await assert.rejects(isActive(USERNAME), /user\/mostRecentLogin/)
    })

    test('refuses to decide when a session response carries an unreadable timestamp', async () => {
        givenAccess({login: {}, session: {timestamp: 'yesterday'}})

        await assert.rejects(isActive(USERNAME), /sessions\/mostRecentlyClosed/)
    })
})

const USERNAME = 'alice'

const givenAccess = ({login, session}) => {
    responses['/api/user/mostRecentLogin'] = login
    responses['/api/sessions/mostRecentlyClosed'] = session
}

const daysAgo = days =>
    new Date(Date.now() - days * DAY).toISOString()
