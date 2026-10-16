import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, before, beforeEach, describe, mock, test} from 'node:test'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

// userApi -> email/googleOAuth/recaptcha -> config.js (commander). Mock config before importing the chain.
mock.module('./config.js', {
    exports: {
        amqpUri: 'amqp://localhost',
        googleOauthCallbackBaseUrl: '',
        googleOauthClientId: '',
        googleOauthClientSecret: '',
        googleProjectId: '',
        port: 80,
        recaptchaApiKey: '',
        recaptchaMinScore: 0.7,
        recaptchaOptional: true,
        recaptchaSiteKey: '',
        sepalHost: 'sepal.example.org'
    }
})

const {hashPassword} = await import('./crypto.js')
const {UserApi} = await import('./userApi.js')
const {UserRepository} = await import('./userRepository.js')

// A read, a rendered snapshot and a handler that writes, each against the real database — not every
// route.

describe('UserApi', () => {
    let testDb
    let repository
    let api

    before(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'user_api', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new UserRepository(testDb.db)
        api = new UserApi({
            repository,
            googleService: {refreshGoogleTokens: async () => null, saveTokens: async () => null},
            googleOAuth: {redirectUrl: () => '', requestTokens: async () => null, revokeTokens: async () => undefined},
            ensureProvisioned: async user => user
        })
    })

    after(() => testDb?.remove())

    test('reports the current user from the database', async () => {
        await givenActiveUser()
        const ctx = aContext({state: {currentUser: {username: USERNAME}}})

        await api.current(ctx)

        assert.equal(ctx.body.username, USERNAME)
        assert.equal(ctx.body.email, EMAIL)
    })

    test('renders the nss snapshot from the stored identities', async () => {
        await givenActiveUser()
        const ctx = aContext()

        await api.nssSnapshot(ctx)

        const identities = await repository.listIdentities()
        assert.equal(identities.length, 1)
        assert.ok(ctx.body.passwd.includes(`${USERNAME}:x:${identities[0].uid}:`))
        assert.ok(ctx.body.group.includes(`${USERNAME}:x:${identities[0].gid}:`))
    })

    test('records the login time when authentication succeeds', async () => {
        await givenActiveUser()
        const ctx = aContext({request: {body: {username: USERNAME, password: PASSWORD}}})

        await api.authenticate(ctx)

        const login = await repository.mostRecentLogin(USERNAME)
        assert.equal(ctx.body.username, USERNAME)
        assert.equal(typeof login.timestamp, 'string')
    })

    test('rejects authentication without recording a login time', async () => {
        await givenActiveUser()
        const ctx = aContext({request: {body: {username: USERNAME, password: 'wrong'}}})

        await api.authenticate(ctx)

        const login = await repository.mostRecentLogin(USERNAME)
        assert.equal(ctx.status, 401)
        assert.deepEqual(login, {})
    })

    // An active user with a POSIX identity in the NSS range — the shape the legacy import left behind,
    // which no operation here can write.
    const givenActiveUser = async () => {
        await testDb.query('INSERT INTO sepal_user SET ?', [{
            username: USERNAME, name: 'Bob', email: EMAIL, admin: 0, system_user: 0, status: 'ACTIVE',
            uid: 10001, gid: 10001, password_hash: hashPassword(PASSWORD)
        }])
    }

    const aContext = (over = {}) => ({
        query: {}, params: {}, headers: {}, state: {}, request: {body: {}},
        set: () => undefined, ...over
    })

    const USERNAME = 'bob'
    const EMAIL = 'bob@example.org'
    const PASSWORD = 'a-long-enough-password'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
