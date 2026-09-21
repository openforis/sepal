import {jest} from '@jest/globals'

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
jest.unstable_mockModule('./config.js', () => ({
    amqpUri: '', googleOauthCallbackBaseUrl: '', googleOauthClientId: '', googleOauthClientSecret: '',
    googleProjectId: '', port: 0, recaptchaApiKey: '', recaptchaMinScore: 0, recaptchaOptional: true,
    recaptchaSiteKey: '', sepalHost: 'sepal.test'
}))
jest.unstable_mockModule('./email.js', () => ({
    sendInvite: () => {},
    sendPasswordReset: () => {}
}))

const {UserApi} = await import('./userApi.js')
const {userChanged$} = await import('./events.js')
const api = new UserApi({repository})

beforeEach(() => users.clear())

describe('POST /lock', () => {
    test('an admin cannot lock their own account', async () => {
        const admin = anAdmin({username: 'admin'})
        const ctx = adminRequest(admin, {username: admin.username})

        await api.lock(ctx)

        expect(ctx.status).toBe(400)
        expect(users.get(admin.username).status).toBe('ACTIVE')
    })

    test('an admin can lock another user', async () => {
        const admin = anAdmin({username: 'admin'})
        const other = anActiveUser({username: 'bob'})
        const ctx = adminRequest(admin, {username: other.username})

        await api.lock(ctx)

        expect(users.get(other.username).status).toBe('LOCKED')
        expect(ctx.body).toMatchObject({username: other.username, status: 'LOCKED'})
    })
})

describe('POST /details', () => {
    test('writes the details when the caller holds the current revision', async () => {
        const admin = anAdmin({username: 'admin'})
        const bob = anActiveUser({username: 'bob'})
        const ctx = adminRequest(admin, {...detailsOf(bob), name: 'Robert', revision: bob.revision})

        await api.updateDetails(ctx)

        expect(ctx.body).toMatchObject({username: 'bob', name: 'Robert', revision: bob.revision + 1})
    })

    test('rejects a stale revision with the current record, changing nothing', async () => {
        const admin = anAdmin({username: 'admin'})
        const bob = anActiveUser({username: 'bob'})
        const changed = collect(userChanged$)
        const ctx = adminRequest(admin, {...detailsOf(bob), name: 'Robert', revision: bob.revision - 1})

        await api.updateDetails(ctx)

        expect(ctx.status).toBe(409)
        expect(ctx.body.user).toMatchObject({username: 'bob', name: bob.name, revision: bob.revision})
        expect(users.get('bob').name).toBe(bob.name)
        expect(changed()).toEqual([])
    })

    test('writes the details unchecked when no revision is given', async () => {
        const admin = anAdmin({username: 'admin'})
        const bob = anActiveUser({username: 'bob'})
        const ctx = adminRequest(admin, {...detailsOf(bob), name: 'Robert'})

        await api.updateDetails(ctx)

        expect(ctx.body).toMatchObject({name: 'Robert'})
    })
})

describe('POST /unlock', () => {
    test('an unlock is published as a user change', async () => {
        const admin = anAdmin({username: 'admin'})
        const locked = aLockedUser({username: 'bob'})
        const ctx = adminRequest(admin, {username: locked.username})
        const changed = collect(userChanged$)

        await api.unlock(ctx)

        expect(changed()).toMatchObject([{username: locked.username, status: 'PENDING'}])
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
