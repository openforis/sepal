import {jest} from '@jest/globals'
import {of} from 'rxjs'

// Credentials presented on a request win over the user the session holds: a login submitted from a
// browser logged in as someone else must authenticate the submitted account, not pass as the old one.
// The user module's authenticate call is faked to accept `accounts`.

const accounts = {alice: 'alice-pw', bob: 'bob-pw'}
jest.unstable_mockModule('#sepal/httpClient', () => ({
    post$: (_url, {body: {username, password}}) =>
        of(accounts[username] === password
            ? {statusCode: 200, body: {username, status: 'ACTIVE', roles: []}}
            : {statusCode: 401, body: {}}),
    get$: () => of({statusCode: 401, body: {}})
}))

const {AuthMiddleware} = await import('./authMiddleware.js')

describe('a gui request carrying credentials', () => {
    test('is authenticated as the credentials\' user, not the session\'s', async () => {
        const req = guiRequestOf({session: 'alice', credentials: ['bob', 'bob-pw']})
        const {authMiddleware, sessionsEnsured} = middlewareFor(req)

        const {status} = await run(authMiddleware, req)

        expect(status).toBe('next')
        expect(JSON.parse(req.headers['sepal-user']).username).toBe('bob')
        expect(req.session.username).toBe('bob')
        expect(sessionsEnsured).toEqual(['bob'])
    })

    test('is refused when the credentials are wrong, whoever the session holds', async () => {
        const req = guiRequestOf({session: 'alice', credentials: ['bob', 'wrong']})
        const {authMiddleware} = middlewareFor(req)

        const {status} = await run(authMiddleware, req)

        expect(status).toBe(401)
    })
})

describe('a gui request without credentials', () => {
    test('passes as the session\'s user', async () => {
        const req = guiRequestOf({session: 'alice'})
        const {authMiddleware} = middlewareFor(req)

        const {status} = await run(authMiddleware, req)

        expect(status).toBe('next')
        expect(JSON.parse(req.headers['sepal-user']).username).toBe('alice')
    })

    test('is refused without a session', async () => {
        const req = guiRequestOf({})
        const {authMiddleware} = middlewareFor(req)

        const {status} = await run(authMiddleware, req)

        expect(status).toBe(401)
    })
})

// The request as it reaches authMiddleware: userMiddleware has already injected the session's user.
const guiRequestOf = ({session, credentials}) => {
    const headers = {'no-auth-challenge': 'true'}
    if (session) {
        headers['sepal-user'] = JSON.stringify({username: session, status: 'ACTIVE', roles: []})
    }
    if (credentials) {
        headers['authorization'] = `Basic ${Buffer.from(credentials.join(':')).toString('base64')}`
    }
    return {
        originalUrl: '/api/user/login',
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
