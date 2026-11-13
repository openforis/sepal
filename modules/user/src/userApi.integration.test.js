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

const {hashPassword, needsRehash, verifyPassword} = await import('./crypto.js')
const {UserApi} = await import('./userApi.js')
const {UserRepository} = await import('./userRepository.js')

// A read, a rendered snapshot and a handler that writes, each against the real database — not every
// route.

describe('UserApi', () => {
    let testDb
    let repository
    let api
    let provisioned

    before(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'user_api', migrations: MIGRATIONS_PATH, connections: 2})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new UserRepository(testDb.db)
        provisioned = []
        api = new UserApi({
            repository,
            googleService: {refreshGoogleTokens: async () => null, saveTokens: async () => null},
            googleOAuth: {redirectUrl: () => '', requestTokens: async () => null, revokeTokens: async () => undefined},
            ensureProvisioned: async user => {
                provisioned.push(user.username)
                return user
            }
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

    test('a profile save cannot undo demotion while it is in flight', async t => {
        await givenActiveUser({admin: true})
        const currentUser = await repository.findByUsername(USERNAME)
        const updateUserDetails = repository.updateUserDetails.bind(repository)
        t.mock.method(repository, 'updateUserDetails', async details => {
            await updateUserDetails({...details, name: currentUser.name, admin: false})
            return updateUserDetails(details)
        }, {times: 1})
        const ctx = aContext({
            state: {currentUser},
            request: {body: {name: 'Renamed', email: EMAIL, admin: true}}
        })

        await api.updateCurrentDetails(ctx)

        const stored = await repository.findByUsername(USERNAME)
        assert.equal(stored.name, 'Renamed')
        assert.equal(stored.admin, false)
        assert.equal(ctx.body.admin, false)
        assert.deepEqual(ctx.body.roles, [])
    })

    for (const admin of [false, true]) {
        test(`a profile save preserves admin=${admin} regardless of the submitted flag`, async () => {
            await givenActiveUser({admin})
            const currentUser = await repository.findByUsername(USERNAME)
            const ctx = aContext({
                state: {currentUser},
                request: {body: {name: 'Renamed', email: EMAIL, admin: !admin}}
            })

            await api.updateCurrentDetails(ctx)

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.name, 'Renamed')
            assert.equal(stored.admin, admin)
            assert.equal(ctx.body.admin, admin)
        })
    }

    test('administrator edits can still grant and revoke administrator access', async () => {
        await givenActiveUser()
        for (const admin of [true, false]) {
            const ctx = aContext({
                state: {currentUser: {username: 'another-admin', roles: ['application_admin']}},
                request: {body: {username: USERNAME, name: 'Bob', email: EMAIL, admin}}
            })

            await api.updateDetails(ctx)

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.admin, admin)
            assert.equal(ctx.body.admin, admin)
        }
    })

    for (const login of ['authenticate', 'authPassword']) {
        test(`${login} upgrades a legacy password when it has not changed`, async () => {
            await givenActiveUser({passwordHash: `{PLAIN}${PASSWORD}`})
            const ctx = aContext({request: {body: {username: USERNAME, password: PASSWORD}}})

            await api[login](ctx)

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(await verifyPassword(PASSWORD, stored.passwordHash), true)
            assert.equal(needsRehash(stored.passwordHash), false)
        })

        test(`${login} does not restore a password changed after its login read`, async t => {
            await givenActiveUser({passwordHash: `{PLAIN}${PASSWORD}`})
            const replacementHash = await hashPassword('a-new-password')
            const findByUsername = repository.findByUsername.bind(repository)
            t.mock.method(repository, 'findByUsername', async username => {
                const snapshot = await findByUsername(username)
                await repository.updatePassword(username, replacementHash)
                return snapshot
            }, {times: 1})
            const ctx = aContext({request: {body: {username: USERNAME, password: PASSWORD}}})

            await api[login](ctx)

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.passwordHash, replacementHash)
        })
    }

    for (const [name, change] of [
        ['cannot undo a lock applied after its token check', () => repository.updateStatus(USERNAME, 'LOCKED')],
        ['cannot consume a token replaced after its token check', () => repository.updateToken(USERNAME, 'new-token')],
        ['cannot undo a password change after its token check', async () =>
            repository.updatePassword(USERNAME, await hashPassword('another-new-password'))],
        ['cannot use a token that expires after its token check', () => testDb.query(
            'UPDATE sepal_user SET token_generation_time = NOW() - INTERVAL 25 HOUR WHERE username = ?', [USERNAME]
        )]
    ]) {
        test(`a password reset ${name}`, async t => {
            await givenActiveUser()
            await repository.updateToken(USERNAME, 'reset-token')
            const findByToken = repository.findByToken.bind(repository)
            let changed
            t.mock.method(repository, 'findByToken', async token => {
                const snapshot = await findByToken(token)
                await change()
                changed = await repository.findByUsername(USERNAME)
                return snapshot
            }, {times: 1})
            const ctx = aContext({request: {body: {token: 'reset-token', password: 'a-new-password'}}})

            await api.resetPassword(ctx)

            assert.equal(ctx.status, 400)
            assert.deepEqual(await repository.findByUsername(USERNAME), changed)
            assert.deepEqual(provisioned, [])
        })
    }

    test('only one concurrent password reset can consume a token', {timeout: 5000}, async t => {
        await givenActiveUser()
        await repository.updateToken(USERNAME, 'reset-token')
        const findByToken = repository.findByToken.bind(repository)
        const bothRead = Promise.withResolvers()
        t.after(() => bothRead.resolve())
        let reads = 0
        t.mock.method(repository, 'findByToken', async token => {
            const snapshot = await findByToken(token)
            if (++reads === 2) bothRead.resolve()
            await bothRead.promise
            return snapshot
        })
        const requests = ['first-new-password', 'second-new-password'].map(password =>
            aContext({request: {body: {token: 'reset-token', password}}})
        )

        await Promise.all(requests.map(ctx => api.resetPassword(ctx)))

        const winners = requests.filter(ctx => ctx.body.username === USERNAME)
        assert.equal(winners.length, 1)
        assert.equal(requests.filter(ctx => ctx.status === 400).length, 1)
        const stored = await repository.findByUsername(USERNAME)
        assert.equal(await verifyPassword(winners[0].request.body.password, stored.passwordHash), true)
        assert.equal(stored.token, null)
        assert.deepEqual(provisioned, [USERNAME])
    })

    for (const status of ['PENDING', 'ACTIVE']) {
        test(`a valid reset sets the password and activates a ${status} user`, async () => {
            await givenActiveUser()
            await repository.updateStatus(USERNAME, status)
            await repository.updateSshPublicKey(USERNAME, 'ssh-ed25519 existing-key')
            await repository.updateToken(USERNAME, 'reset-token')
            const ctx = aContext({request: {body: {token: 'reset-token', password: 'a-new-password'}}})

            await api.resetPassword(ctx)

            const stored = await repository.findByUsername(USERNAME)
            assert.equal(stored.status, 'ACTIVE')
            assert.equal(stored.token, null)
            assert.equal(await verifyPassword('a-new-password', stored.passwordHash), true)
            assert.equal(ctx.body.username, USERNAME)
            assert.deepEqual(provisioned, status === 'PENDING' ? [USERNAME] : [])
        })
    }

    test('a reset token must match exactly, including trailing spaces', async () => {
        await givenActiveUser()
        await repository.updateToken(USERNAME, 'reset-token')
        const before = await repository.findByUsername(USERNAME)
        const ctx = aContext({request: {body: {token: 'reset-token ', password: 'a-new-password'}}})

        await api.resetPassword(ctx)

        assert.equal(ctx.status, 400)
        assert.deepEqual(await repository.findByUsername(USERNAME), before)
        assert.deepEqual(provisioned, [])
    })

    // An active user with a POSIX identity in the NSS range — the shape the legacy import left behind,
    // which no operation here can write.
    const givenActiveUser = async ({passwordHash, admin = false} = {}) => {
        await testDb.query('INSERT INTO sepal_user SET ?', [{
            username: USERNAME, name: 'Bob', email: EMAIL, admin, system_user: 0, status: 'ACTIVE',
            uid: 10001, gid: 10001, password_hash: passwordHash ?? await hashPassword(PASSWORD)
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
