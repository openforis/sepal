import assert from 'node:assert/strict'
import {beforeEach, describe, mock, test} from 'node:test'

import {assertMatches} from '#sepal/testSupport/assert'

const users = new Map()

const repository = {
    findByUsername: async username => users.get(username) ?? null,
    findByToken: async token => [...users.values()].find(user => user.token === token) ?? null,
    findByEmail: async email => [...users.values()].find(user => user.email === email) ?? null,
    updatePassword: async (username, passwordHash) => users.set(username, {...users.get(username), passwordHash}),
    updateStatus: async (username, status) => users.set(username, {...users.get(username), status}),
    updateToken: async (username, token) =>
        users.set(username, {...users.get(username), token, tokenGenerationTime: Date.now()}),
    // The conditional write of the real repository: nothing happens on a stale revision.
    updateUserDetails: async ({username, revision, ...details}) => {
        const user = users.get(username)
        if (!user || (revision != null && revision !== user.revision)) {
            return false
        }
        users.set(username, {...user, ...details, revision: user.revision + 1})
        return true
    }
}
// config.js parses argv at import time and exits on missing mandatory options
mock.module('./config.js', {
    exports: {
        amqpUri: '',
        googleOauthCallbackBaseUrl: '',
        googleOauthClientId: '',
        googleOauthClientSecret: '',
        googleProjectId: '',
        port: 0,
        recaptchaApiKey: '',
        recaptchaMinScore: 0,
        recaptchaOptional: true,
        recaptchaSiteKey: '',
        sepalHost: 'sepal.test'
    }
})
mock.module('./email.js', {
    exports: {
        sendInvite: () => {},
        sendPasswordReset: () => {}
    }
})

const {hashPassword, verifyPassword} = await import('./crypto.js')
const {UserApi} = await import('./userApi.js')
const {GoogleOAuth} = await import('./googleOAuth.js')
const {userChanged$} = await import('./events.js')
const api = new UserApi({repository})

beforeEach(() => users.clear())

describe('POST /lock', () => {
    test('an admin cannot lock their own account', async () => {
        const admin = anAdmin({username: 'admin'})
        const ctx = requestBy(admin, {username: admin.username})

        await api.lock(ctx)

        assert.equal(ctx.status, 400)
        assert.equal(users.get(admin.username).status, 'ACTIVE')
    })

    test('an admin can lock another user', async () => {
        const admin = anAdmin({username: 'admin'})
        const other = anActiveUser({username: 'bob'})
        const ctx = requestBy(admin, {username: other.username})

        await api.lock(ctx)

        assert.equal(users.get(other.username).status, 'LOCKED')
        assert.partialDeepStrictEqual(ctx.body, {username: other.username, status: 'LOCKED'})
    })
})

describe('POST /details', () => {
    test('writes the details when the caller holds the current revision', async () => {
        const admin = anAdmin({username: 'admin'})
        const bob = anActiveUser({username: 'bob'})
        const ctx = requestBy(admin, {...detailsOf(bob), name: 'Robert', revision: bob.revision})

        await api.updateDetails(ctx)

        assert.partialDeepStrictEqual(ctx.body, {username: 'bob', name: 'Robert', revision: bob.revision + 1})
    })

    test('rejects a stale revision with the current record, changing nothing', async () => {
        const admin = anAdmin({username: 'admin'})
        const bob = anActiveUser({username: 'bob'})
        const changed = collect(userChanged$)
        const ctx = requestBy(admin, {...detailsOf(bob), name: 'Robert', revision: bob.revision - 1})

        await api.updateDetails(ctx)

        assert.equal(ctx.status, 409)
        assert.partialDeepStrictEqual(ctx.body.user, {username: 'bob', name: bob.name, revision: bob.revision})
        assert.equal(users.get('bob').name, bob.name)
        assert.deepEqual(changed(), [])
    })

    test('writes the details unchecked when no revision is given', async () => {
        const admin = anAdmin({username: 'admin'})
        const bob = anActiveUser({username: 'bob'})
        const ctx = requestBy(admin, {...detailsOf(bob), name: 'Robert'})

        await api.updateDetails(ctx)

        assert.partialDeepStrictEqual(ctx.body, {name: 'Robert'})
    })
})

describe('POST /current/password', () => {
    test('refuses a new password the policy does not allow, keeping the old one', async () => {
        const bob = await withPassword(anActiveUser({username: 'bob'}))
        const ctx = requestBy(bob, {oldPassword: PASSWORD, newPassword: 'short'})

        await api.changePassword(ctx)

        assert.equal(ctx.status, 400)
        assert.equal(await verifyPassword(PASSWORD, users.get('bob').passwordHash), true)
    })
})

describe('POST /current/details', () => {
    test('refuses an email change without the password, changing nothing', async () => {
        const bob = await withPassword(anActiveUser({username: 'bob'}))
        const ctx = requestBy(bob, {...detailsOf(bob), email: 'mallory@example.org'})

        await api.updateCurrentDetails(ctx)

        assert.equal(ctx.status, 403)
        assert.equal(users.get('bob').email, bob.email)
    })

    test('changes the email when the password is given', async () => {
        const bob = await withPassword(anActiveUser({username: 'bob'}))
        const ctx = requestBy(bob, {...detailsOf(bob), email: 'robert@example.org', password: PASSWORD})

        await api.updateCurrentDetails(ctx)

        assert.equal(ctx.body.email, 'robert@example.org')
    })

    test('changes the other details without the password', async () => {
        const bob = await withPassword(anActiveUser({username: 'bob'}))
        const ctx = requestBy(bob, {...detailsOf(bob), name: 'Robert'})

        await api.updateCurrentDetails(ctx)

        assert.equal(ctx.body.name, 'Robert')
    })
})

describe('POST /password/reset-request', () => {
    // Otherwise anyone who has seen the link once could keep it alive by asking for a reset daily.
    test('resends an outstanding link without extending its life', async () => {
        const bob = withResetToken(anActiveUser({username: 'bob'}), {issuedAgoMs: HOURS_23})

        await api.requestPasswordReset(anonymousRequest({email: bob.email}))

        assert.partialDeepStrictEqual(users.get('bob'), {token: bob.token, tokenGenerationTime: bob.tokenGenerationTime})
    })

    test('issues a new link once the outstanding one has expired', async () => {
        const bob = withResetToken(anActiveUser({username: 'bob'}), {issuedAgoMs: HOURS_25})

        await api.requestPasswordReset(anonymousRequest({email: bob.email}))

        const stored = users.get('bob')
        assert.notEqual(stored.token, bob.token)
        assert.ok(stored.tokenGenerationTime > bob.tokenGenerationTime)
    })
})

describe('POST /unlock', () => {
    test('an unlock is published as a user change', async () => {
        const admin = anAdmin({username: 'admin'})
        const locked = aLockedUser({username: 'bob'})
        const ctx = requestBy(admin, {username: locked.username})
        const changed = collect(userChanged$)

        await api.unlock(ctx)

        assertMatches(changed(), [{username: locked.username, status: 'PENDING'}])
    })
})

describe('POST /validate/token', () => {
    test('a valid token answers with the user but not their Google tokens', async () => {
        const user = withResetToken(anActiveUser({username: 'bob'}))
        users.set(user.username, {...user, googleTokens: {accessToken: 'access', refreshToken: 'refresh'}})
        const ctx = anonymousRequest({token: user.token})

        await api.validateToken(ctx)

        assert.equal(ctx.body.status, 'success')
        assert.equal(ctx.body.user.username, user.username)
        assert.equal(ctx.body.user.googleTokens, null)
    })

    test('a locked user\'s token is refused without the user', async () => {
        const user = withResetToken(aLockedUser({username: 'bob'}))
        const ctx = anonymousRequest({token: user.token})

        await api.validateToken(ctx)

        assert.equal(ctx.body.status, 'failure')
        assert.equal(ctx.body.user, undefined)
    })
})

describe('GET /google/associate-account', () => {
    test('links nothing when the sign-in was started by another user', async () => {
        const googleOAuth = new GoogleOAuth({fetchFn: async () => assert.fail('tokens requested')})
        const googleService = {saveTokens: async () => assert.fail('tokens saved')}
        const api = new UserApi({repository, googleOAuth, googleService})
        const alice = anActiveUser({username: 'alice'})
        const malloryState = new URL(googleOAuth.redirectUrl('mallory', '/')).searchParams.get('state')
        const ctx = {state: {currentUser: alice}, query: {code: 'mallory-code', state: malloryState}, set: () => {}}

        await api.associateGoogleAccount(ctx)

        assert.equal(ctx.status, 400)
    })
})

const anActiveUser = ({username, roles = []}) => {
    const user = {
        id: users.size + 1, username, name: username, status: 'ACTIVE', roles,
        email: `${username}@example.org`, revision: 3
    }
    users.set(username, user)
    return user
}

const anAdmin = ({username}) => anActiveUser({username, roles: ['application_admin']})

const aLockedUser = ({username}) => {
    const user = {...anActiveUser({username}), status: 'LOCKED'}
    users.set(username, user)
    return user
}

const withResetToken = (user, {issuedAgoMs = 0} = {}) => {
    const withToken = {...user, token: `${user.username}-token`, tokenGenerationTime: Date.now() - issuedAgoMs}
    users.set(user.username, withToken)
    return withToken
}

const withPassword = async user => {
    const withHash = {...user, passwordHash: await hashPassword(PASSWORD)}
    users.set(user.username, withHash)
    return withHash
}

const detailsOf = ({username, name, email}) => ({username, name, email, organization: 'FAO', admin: false})

const collect = observable$ => {
    const values = []
    const subscription = observable$.subscribe(value => values.push(value))
    return () => {
        subscription.unsubscribe()
        return values
    }
}

const requestBy = (user, body) => ({
    state: {currentUser: user},
    request: {body},
    query: {},
    set: () => {}
})

const anonymousRequest = body => ({
    state: {},
    request: {body},
    query: {}
})

const PASSWORD = 'a-long-enough-password'
const HOURS_23 = 23 * 60 * 60 * 1000
const HOURS_25 = 25 * 60 * 60 * 1000
