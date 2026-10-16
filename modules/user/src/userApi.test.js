import assert from 'node:assert/strict'
import {beforeEach, describe, mock, test} from 'node:test'

import {assertMatches} from '#sepal/testSupport/assert'

const users = new Map()

const repository = {
    findByUsername: async username => users.get(username) ?? null,
    updateStatus: async (username, status) => users.set(username, {...users.get(username), status}),
    updateToken: async (username, token) => users.set(username, {...users.get(username), token}),
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

const {UserApi} = await import('./userApi.js')
const {userChanged$} = await import('./events.js')
const api = new UserApi({repository})

beforeEach(() => users.clear())

describe('POST /lock', () => {
    test('an admin cannot lock their own account', async () => {
        const admin = anAdmin({username: 'admin'})
        const ctx = adminRequest(admin, {username: admin.username})

        await api.lock(ctx)

        assert.equal(ctx.status, 400)
        assert.equal(users.get(admin.username).status, 'ACTIVE')
    })

    test('an admin can lock another user', async () => {
        const admin = anAdmin({username: 'admin'})
        const other = anActiveUser({username: 'bob'})
        const ctx = adminRequest(admin, {username: other.username})

        await api.lock(ctx)

        assert.equal(users.get(other.username).status, 'LOCKED')
        assert.partialDeepStrictEqual(ctx.body, {username: other.username, status: 'LOCKED'})
    })
})

describe('POST /details', () => {
    test('writes the details when the caller holds the current revision', async () => {
        const admin = anAdmin({username: 'admin'})
        const bob = anActiveUser({username: 'bob'})
        const ctx = adminRequest(admin, {...detailsOf(bob), name: 'Robert', revision: bob.revision})

        await api.updateDetails(ctx)

        assert.partialDeepStrictEqual(ctx.body, {username: 'bob', name: 'Robert', revision: bob.revision + 1})
    })

    test('rejects a stale revision with the current record, changing nothing', async () => {
        const admin = anAdmin({username: 'admin'})
        const bob = anActiveUser({username: 'bob'})
        const changed = collect(userChanged$)
        const ctx = adminRequest(admin, {...detailsOf(bob), name: 'Robert', revision: bob.revision - 1})

        await api.updateDetails(ctx)

        assert.equal(ctx.status, 409)
        assert.partialDeepStrictEqual(ctx.body.user, {username: 'bob', name: bob.name, revision: bob.revision})
        assert.equal(users.get('bob').name, bob.name)
        assert.deepEqual(changed(), [])
    })

    test('writes the details unchecked when no revision is given', async () => {
        const admin = anAdmin({username: 'admin'})
        const bob = anActiveUser({username: 'bob'})
        const ctx = adminRequest(admin, {...detailsOf(bob), name: 'Robert'})

        await api.updateDetails(ctx)

        assert.partialDeepStrictEqual(ctx.body, {name: 'Robert'})
    })
})

describe('POST /unlock', () => {
    test('an unlock is published as a user change', async () => {
        const admin = anAdmin({username: 'admin'})
        const locked = aLockedUser({username: 'bob'})
        const ctx = adminRequest(admin, {username: locked.username})
        const changed = collect(userChanged$)

        await api.unlock(ctx)

        assertMatches(changed(), [{username: locked.username, status: 'PENDING'}])
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

const detailsOf = ({username, name, email}) => ({username, name, email, organization: 'FAO', admin: false})

const collect = observable$ => {
    const values = []
    const subscription = observable$.subscribe(value => values.push(value))
    return () => {
        subscription.unsubscribe()
        return values
    }
}

const adminRequest = (admin, body) => ({
    state: {currentUser: admin},
    request: {body},
    query: {},
    set: () => {}
})
