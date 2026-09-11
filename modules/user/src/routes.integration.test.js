import {jest} from '@jest/globals'

import {configureNoLogging} from '#sepal/log'

// routes -> userApi -> email/googleOAuth/recaptcha -> config.js (commander). Mock config before the chain.
jest.unstable_mockModule('./config.js', () => ({
    amqpUri: 'amqp://localhost', googleOauthCallbackBaseUrl: '', googleOauthClientId: '',
    googleOauthClientSecret: '', googleProjectId: '', port: 80, recaptchaApiKey: '',
    recaptchaMinScore: 0.7, recaptchaOptional: true, recaptchaSiteKey: '', sepalHost: 'sepal.example.org'
}))

const server = await import('#sepal/httpServer')
const {hashPassword} = await import('./crypto.js')
const {createRoutes} = await import('./routes.js')
const {UserApi} = await import('./userApi.js')

// Requests through the real server: the routes as the module registers them, the guards that protect
// them, and the api they reach.

describe('the user routes', () => {
    let running
    let url
    let users

    beforeAll(async () => {
        configureNoLogging()
        running = await startServer()
        url = path => `http://127.0.0.1:${running.address().port}${path}`
    })

    beforeEach(() => {
        users = {bob: aUser(), alice: aUser({id: 2, username: 'alice', email: 'alice@example.org'})}
    })

    afterAll(() => running && new Promise(resolve => running.close(resolve)))

    test('answer a healthcheck', async () => {
        const response = await request('GET', '/healthcheck')

        expect(response.status).toBe(200)
        expect(response.body).toEqual({status: 'ok'})
    })

    describe('without authentication', () => {
        test('authenticate a user against their password', async () => {
            const response = await request('POST', '/authenticate', {body: {username: 'bob', password: PASSWORD}})

            expect(response.status).toBe(200)
            expect(response.body.username).toBe('bob')
        })

        test('refuse a wrong password', async () => {
            const response = await request('POST', '/authenticate', {body: {username: 'bob', password: 'wrong'}})

            expect(response.status).toBe(401)
        })
    })

    describe('for the current user', () => {
        test('report who they are', async () => {
            const response = await request('GET', '/current', {user: someone('bob')})

            expect(response.status).toBe(200)
            expect(response.body.username).toBe('bob')
        })

        // /login is an alias for the same handler; the GUI posts to it after the gateway signs the user in.
        test('report who they are on login as well', async () => {
            const response = await request('POST', '/login', {user: someone('bob')})

            expect(response.status).toBe(200)
            expect(response.body.username).toBe('bob')
        })

        test('refuse a request carrying no user', async () => {
            const response = await request('GET', '/current')

            expect(response.status).toBe(401)
        })
    })

    describe('for an administrator', () => {
        test('list the users', async () => {
            const response = await request('GET', '/list', {user: someone('bob', ADMIN_ROLES)})

            expect(response.status).toBe(200)
            expect(response.body.map(({username}) => username).sort()).toEqual(['alice', 'bob'])
        })

        test('report one user by name', async () => {
            const response = await request('GET', '/info?username=alice', {user: someone('bob', ADMIN_ROLES)})

            expect(response.status).toBe(200)
            expect(response.body.username).toBe('alice')
        })

        test('refuse a user without the admin role', async () => {
            const response = await request('GET', '/list', {user: someone('bob')})

            expect(response.status).toBe(403)
        })
    })

    const request = async (method, path, {user, body} = {}) => {
        const response = await fetch(url(path), {
            method,
            headers: {
                'content-type': 'application/json',
                ...(user ? {'sepal-user': JSON.stringify(user)} : {})
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        })
        const text = await response.text()
        return {status: response.status, body: text ? JSON.parse(text) : null}
    }

    // The api over a repository that answers from memory, so a response says which handler ran.
    const startServer = () => {
        const repository = {
            findByUsername: async username => users[(username || '').toLowerCase()] ?? null,
            listUsers: async () => Object.values(users),
            setLastLoginTime: async () => undefined,
            updatePassword: async () => undefined
        }
        const api = new UserApi({
            repository,
            googleService: {refreshGoogleTokens: async () => null, saveTokens: async () => null},
            googleOAuth: {redirectUrl: () => '', requestTokens: async () => null, revokeTokens: async () => undefined},
            ensureProvisioned: async user => user
        })
        return server.start({
            port: 0,
            routes: createRoutes(api),
            // The default collects process-wide Prometheus metrics, which this has nothing to say about.
            metricsMiddleware: (_ctx, next) => next()
        })
    }

    const someone = (username, roles = []) => ({username, roles})

    const aUser = (over = {}) => ({
        id: 1, uid: 1, gid: 1, name: 'Bob', username: 'bob', email: 'bob@example.org',
        organization: null, intendedUse: null, googleTokens: null,
        emailNotificationsEnabled: true, manualMapRenderingEnabled: false, privacyPolicyAccepted: false,
        status: 'ACTIVE', roles: [], systemUser: false, admin: false,
        creationTime: '2026-01-01T00:00:00.000Z', updateTime: '2026-01-01T00:00:00.000Z',
        lastLoginTime: null, token: null, tokenGenerationTime: null,
        passwordHash: hashPassword(PASSWORD), sshPublicKey: null, ...over
    })

    const PASSWORD = 'a-long-enough-password'
    const ADMIN_ROLES = ['application_admin']
})
