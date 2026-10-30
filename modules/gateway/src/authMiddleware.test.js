import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {of} from 'rxjs'

// Credentials presented on a request win over the user the session holds: a login submitted from a
// browser logged in as someone else must authenticate the submitted account, not pass as the old one.
// The user module's authenticate call is faked to accept `accounts`, and to throttle `throttledClients`.

const accounts = {alice: 'alice-pw', bob: 'bob-pw'}
const throttledClients = ['192.0.2.1']
mock.module('#sepal/httpClient', {
    exports: {
        post$: (_url, {body: {username, password, clientIp}}) =>
            of(throttledClients.includes(clientIp)
                ? {statusCode: 429, body: {}}
                : accounts[username] === password
                    ? {statusCode: 200, body: {username, status: 'ACTIVE', roles: []}}
                    : {statusCode: 401, body: {}}),

        get$: () => of({statusCode: 401, body: {}})
    }
})

const {AuthMiddleware} = await import('./authMiddleware.js')

describe('a gui request carrying credentials', () => {
    test('is authenticated as the credentials\' user, not the session\'s', async () => {
        const req = guiRequestOf({session: 'alice', credentials: ['bob', 'bob-pw']})
        const {authMiddleware, sessionsEnsured} = middlewareFor(req)

        const {status} = await run(authMiddleware, req)

        assert.equal(status, 'next')
        assert.equal(JSON.parse(req.headers['sepal-user']).username, 'bob')
        assert.equal(req.session.username, 'bob')
        assert.deepEqual(sessionsEnsured, ['bob'])
    })

    test('is refused when the credentials are wrong, whoever the session holds', async () => {
        const req = guiRequestOf({session: 'alice', credentials: ['bob', 'wrong']})
        const {authMiddleware} = middlewareFor(req)

        const {status} = await run(authMiddleware, req)

        assert.equal(status, 401)
    })

    test('is refused as too many requests when the user module throttles its client address', async () => {
        const req = guiRequestOf({credentials: ['bob', 'bob-pw'], ip: throttledClients[0]})
        const {authMiddleware} = middlewareFor(req)

        const {status} = await run(authMiddleware, req)

        assert.equal(status, 429)
    })
})

describe('a gui request without credentials', () => {
    test('passes as the session\'s user', async () => {
        const req = guiRequestOf({session: 'alice'})
        const {authMiddleware} = middlewareFor(req)

        const {status} = await run(authMiddleware, req)

        assert.equal(status, 'next')
        assert.equal(JSON.parse(req.headers['sepal-user']).username, 'alice')
    })

    test('is refused without a session', async () => {
        const req = guiRequestOf({})
        const {authMiddleware} = middlewareFor(req)

        const {status} = await run(authMiddleware, req)

        assert.equal(status, 401)
    })
})

// The request as it reaches authMiddleware: userMiddleware has already injected the session's user.
const guiRequestOf = ({session, credentials, ip = '198.51.100.1'}) => {
    const headers = {'no-auth-challenge': 'true'}
    if (session) {
        headers['sepal-user'] = JSON.stringify({username: session, status: 'ACTIVE', roles: []})
    }
    if (credentials) {
        headers['authorization'] = `Basic ${Buffer.from(credentials.join(':')).toString('base64')}`
    }
    return {
        originalUrl: '/api/user/login',
        ip,
        session: {username: session},
        headers,
        get: name => headers[name.toLowerCase()],
        header: name => headers[name.toLowerCase()]
    }
}

const middlewareFor = () => {
    const sessionsEnsured = []
    const userStore = {setUser$: () => of(true)}
    const ensureSessionFor = async (_req, _res, username) => sessionsEnsured.push(username)
    const {authMiddleware} = AuthMiddleware(userStore, ensureSessionFor)
    return {authMiddleware, sessionsEnsured}
}

const run = (middleware, req) => new Promise(resolve => {
    let status
    const res = {
        set: () => res,
        status: code => {
            status = code
            return res
        },
        end: () => resolve({status})
    }
    middleware(req, res, () => resolve({status: 'next'}))
})
