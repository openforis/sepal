import {jest} from '@jest/globals'
import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

// routes -> userApi -> email/googleOAuth/recaptcha -> config.js (commander). Mock config before the chain.
jest.unstable_mockModule('./config.js', () => ({
    amqpUri: 'amqp://localhost', googleOauthCallbackBaseUrl: '', googleOauthClientId: '',
    googleOauthClientSecret: '', googleProjectId: '', port: 80, recaptchaApiKey: '',
    recaptchaMinScore: 0.7, recaptchaOptional: true, recaptchaSiteKey: '', sepalHost: 'sepal.example.org'
}))

const server = await import('#sepal/httpServer')
const {hashPassword, verifyPassword} = await import('./crypto.js')
const {email$} = await import('./email.js')
const {userUpdated$} = await import('./events.js')
const {createRoutes} = await import('./routes.js')
const {UserApi} = await import('./userApi.js')
const {UserRepository} = await import('./userRepository.js')

// A credential that is not a string used to reach SQL formatted by its own rules rather than quoted as
// text: `[0]` arrived as `WHERE token = 0`, which MySQL matched by coercing the varchar column (see
// isText in validation.js). The seeded token below begins with a letter for exactly that reason, and
// every assertion is on what the database holds afterwards — a request that is refused must leave no
// trace of having run.

describe('a credential that is not a string', () => {
    let testDb
    let repository
    let running
    let url
    const sentEmails = []
    const publishedUsers = []
    const provisioned = []
    const subscriptions = []

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'user_credential_types', migrations: MIGRATIONS_PATH})
        repository = new UserRepository(testDb.db)
        running = await startServer()
        url = path => `http://127.0.0.1:${running.address().port}${path}`
        subscriptions.push(
            email$.subscribe(message => sentEmails.push(message)),
            userUpdated$.subscribe(user => publishedUsers.push(user))
        )
    })

    beforeEach(async () => {
        await testDb.reset()
        sentEmails.length = 0
        publishedUsers.length = 0
        provisioned.length = 0
    })

    afterAll(async () => {
        subscriptions.forEach(subscription => subscription.unsubscribe())
        if (running) {
            await new Promise(resolve => running.close(resolve))
        }
        await testDb?.remove()
    })

    describe('activating an account', () => {
        test.each([
            ['a number', 0],
            ['a boolean', true],
            ['an object', {}],
            ['an array', [0]]
        ])('%s as a token activates nothing', async (_description, token) => {
            const pending = await givenPendingUser()

            const response = await request('POST', '/activate', {body: {token, password: NEW_PASSWORD}})

            const stored = await repository.findByUsername(USERNAME)
            expect(response.status).toBe(400)
            expect(stored.status).toBe('PENDING')
            expect(stored.passwordHash).toBe(pending.passwordHash)
            expect(stored.token).toBe(TOKEN)
            expect(provisioned).toEqual([])
            expect(publishedUsers).toEqual([])
        })

        test('a password that is not a string activates nothing, even with the right token', async () => {
            const pending = await givenPendingUser()

            const response = await request('POST', '/activate', {body: {token: TOKEN, password: NOT_A_PASSWORD}})

            const stored = await repository.findByUsername(USERNAME)
            expect(response.status).toBe(400)
            expect(stored.status).toBe('PENDING')
            expect(stored.passwordHash).toBe(pending.passwordHash)
            expect(stored.token).toBe(TOKEN)
            expect(provisioned).toEqual([])
        })

        test('the account is still activated by its own token', async () => {
            await givenPendingUser()

            const response = await request('POST', '/activate', {body: {token: TOKEN, password: NEW_PASSWORD}})

            const stored = await repository.findByUsername(USERNAME)
            expect(response.status).toBe(200)
            expect(stored.status).toBe('ACTIVE')
            expect(verifyPassword(NEW_PASSWORD, stored.passwordHash)).toBe(true)
            expect(stored.token).toBeNull()
            expect(provisioned).toEqual([USERNAME])
        })
    })

    describe('validating a token', () => {
        test('a token that is not a string matches no account and discloses none', async () => {
            await givenPendingUser()

            const response = await request('POST', '/validate/token', {body: {token: [0]}})

            expect(response.body).toEqual({
                status: 'failure', token: null, reason: 'invalid', message: 'Token is invalid'
            })
        })

        test('the account is still found by its own token', async () => {
            await givenPendingUser()

            const response = await request('POST', '/validate/token', {body: {token: TOKEN}})

            expect(response.body.status).toBe('success')
            expect(response.body.user.username).toBe(USERNAME)
        })
    })

    describe('resetting a password', () => {
        test('a token that is not a string resets no password', async () => {
            const active = await givenActiveUser()

            const response = await request('POST', '/password/reset', {body: {token: [0], password: NEW_PASSWORD}})

            const stored = await repository.findByUsername(USERNAME)
            expect(response.status).toBe(400)
            expect(stored.passwordHash).toBe(active.passwordHash)
            expect(stored.token).toBe(TOKEN)
        })

        test('a password that is not a string resets nothing, even with the right token', async () => {
            const active = await givenActiveUser()

            const response = await request('POST', '/password/reset', {body: {token: TOKEN, password: NOT_A_PASSWORD}})

            const stored = await repository.findByUsername(USERNAME)
            expect(response.status).toBe(400)
            expect(stored.passwordHash).toBe(active.passwordHash)
            expect(stored.token).toBe(TOKEN)
        })

        test('the password is still reset by the token the account holds', async () => {
            await givenActiveUser()

            const response = await request('POST', '/password/reset', {body: {token: TOKEN, password: NEW_PASSWORD}})

            const stored = await repository.findByUsername(USERNAME)
            expect(response.status).toBe(200)
            expect(verifyPassword(NEW_PASSWORD, stored.passwordHash)).toBe(true)
            expect(stored.token).toBeNull()
        })

        test('an email that is not a string answers the same and mails nobody', async () => {
            await givenActiveUser()

            const response = await request('POST', '/password/reset-request', {body: {email: [0]}})

            expect(response.body).toEqual(GENERIC_RESET_ANSWER)
            expect(sentEmails).toEqual([])
        })

        test('the account is still mailed a reset link for its own address', async () => {
            await givenActiveUser()

            const response = await request('POST', '/password/reset-request', {body: {email: EMAIL}})

            expect(response.body).toEqual(GENERIC_RESET_ANSWER)
            expect(sentEmails.map(({to}) => to)).toEqual([EMAIL])
        })
    })

    describe('changing a password', () => {
        test('a new password that is not a string changes nothing, even with the right old one', async () => {
            const active = await givenActiveUser()

            const response = await request('POST', '/current/password', {
                body: {oldPassword: PASSWORD, newPassword: NOT_A_PASSWORD}, user: {username: USERNAME, roles: []}
            })

            const stored = await repository.findByUsername(USERNAME)
            expect(response.body.status).toBe('failure')
            expect(stored.passwordHash).toBe(active.passwordHash)
        })

        test('the password still changes for the right old one', async () => {
            await givenActiveUser()

            const response = await request('POST', '/current/password', {
                body: {oldPassword: PASSWORD, newPassword: NEW_PASSWORD}, user: {username: USERNAME, roles: []}
            })

            const stored = await repository.findByUsername(USERNAME)
            expect(response.body.status).toBe('success')
            expect(verifyPassword(NEW_PASSWORD, stored.passwordHash)).toBe(true)
        })
    })

    describe('authenticating', () => {
        test('a username that is not a string authenticates nobody', async () => {
            await givenActiveUser()

            const response = await request('POST', '/authenticate', {body: {username: [0], password: PASSWORD}})

            const stored = await repository.mostRecentLogin(USERNAME)
            expect(response.status).toBe(401)
            expect(stored).toEqual({})
        })

        test('a password that is not a string authenticates nobody', async () => {
            await givenActiveUser()

            const response = await request('POST', '/authenticate', {body: {username: USERNAME, password: [0]}})

            expect(response.status).toBe(401)
        })

        test('the account still authenticates with its own password', async () => {
            await givenActiveUser()

            const response = await request('POST', '/authenticate', {body: {username: USERNAME, password: PASSWORD}})

            expect(response.status).toBe(200)
            expect(response.body.username).toBe(USERNAME)
        })
    })

    const request = async (method, path, {body, user} = {}) => {
        const response = await fetch(url(path), {
            method,
            headers: {
                'content-type': 'application/json',
                ...(user ? {'sepal-user': JSON.stringify(user)} : {})
            },
            body: JSON.stringify(body)
        })
        const text = await response.text()
        return {status: response.status, body: text ? JSON.parse(text) : null}
    }

    const givenPendingUser = async () => {
        await repository.insertUser({
            username: USERNAME, name: 'Bob', email: EMAIL, organization: null, intendedUse: null, token: TOKEN
        })
        return await repository.findByUsername(USERNAME)
    }

    const givenActiveUser = async () => {
        await givenPendingUser()
        await repository.updateStatus(USERNAME, 'ACTIVE')
        await repository.updatePassword(USERNAME, hashPassword(PASSWORD))
        return await repository.findByUsername(USERNAME)
    }

    const startServer = () => {
        const api = new UserApi({
            repository,
            googleService: {refreshGoogleTokens: async () => null, saveTokens: async () => null},
            googleOAuth: {redirectUrl: () => '', requestTokens: async () => null, revokeTokens: async () => undefined},
            ensureProvisioned: async user => {
                provisioned.push(user.username)
                return user
            }
        })
        return server.start({
            port: 0,
            routes: createRoutes(api),
            // The default collects process-wide Prometheus metrics, which this has nothing to say about.
            metricsMiddleware: (_ctx, next) => next()
        })
    }

    const USERNAME = 'bob'
    const EMAIL = 'bob@example.org'
    const PASSWORD = 'a-long-enough-password'
    const NEW_PASSWORD = 'another-long-enough-password'

    // Long enough to clear the length rule, so only its type is left to refuse it. A check that merely
    // measured length let this through and hashed its bytes.
    const NOT_A_PASSWORD = new Array(NEW_PASSWORD.length).fill(0)

    // Begins with a letter, so MySQL coerces it to 0 when compared against a number.
    const TOKEN = 'a1b2c3d4-0000-4000-8000-000000000000'

    const GENERIC_RESET_ANSWER = {
        status: 'success',
        message: 'If there is an account with this email, an email with a password reset link will be sent there'
    }

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
