import {jest} from '@jest/globals'

const users = new Map()

const repository = {
    findByUsername: async username => users.get(username) ?? null,
    updateStatus: async (username, status) => users.set(username, {...users.get(username), status}),
    updateToken: async (username, token) => users.set(username, {...users.get(username), token})
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

const anActiveUser = ({username, roles = []}) => {
    const user = {id: users.size + 1, username, status: 'ACTIVE', roles, email: `${username}@example.org`}
    users.set(username, user)
    return user
}

const anAdmin = ({username}) => anActiveUser({username, roles: ['application_admin']})

const adminRequest = (admin, body) => ({
    state: {currentUser: admin},
    request: {body},
    query: {},
    set: () => {}
})
