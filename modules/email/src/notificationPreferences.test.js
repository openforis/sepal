import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

const store = new Map()
const remotePreference = mock.fn(async () => true)

mock.module('ioredis', {defaultExport: class {
    async get(key) {
        return store.get(key) ?? null
    }

    async set(key, value, mode) {
        if (mode === 'NX' && store.has(key)) {
            return null
        }
        store.set(key, value)
        return 'OK'
    }

    async scan(_cursor, _match, pattern) {
        const prefix = pattern.replace(/\*$/, '')
        return ['0', [...store.keys()].filter(key => key.startsWith(prefix))]
    }

    async del(...keys) {
        keys.forEach(key => store.delete(key))
        return keys.length
    }
}})
// The real configuration parses process arguments at import and exits the process when a mandatory
// one is missing, which under a test runner they all are.
mock.module('./config.js', {exports: {redisHost: 'redis.test'}})
mock.module('./http.js', {namedExports: {getEmailNotificationsEnabled: remotePreference, getUser: async () => ({})}})
mock.module('./emailQueue.js', {namedExports: {enqueue: async () => {}}})

const {clearEmailNotificationsEnabled} = await import('./cache.js')
const {messageHandler} = await import('./messageHandler.js')
const {filterEmailNotificationsEnabled} = await import('./user.js')

const email = 'alice@example.org'

beforeEach(() => {
    store.clear()
    remotePreference.mock.resetCalls()
    remotePreference.mock.mockImplementation(async () => true)
})

test('stops notifying a user who opts out after their preference was cached', async () => {
    assert.deepEqual(await filterEmailNotificationsEnabled(email), [email])

    await messageHandler('user.UserUpdated', userUpdated({email, emailNotificationsEnabled: false}))

    assert.deepEqual(await filterEmailNotificationsEnabled(email), [])
})

test('starts notifying a user who opts in after their preference was cached', async () => {
    remotePreference.mock.mockImplementation(async () => false)
    assert.deepEqual(await filterEmailNotificationsEnabled(email), [])

    await messageHandler('user.UserUpdated', userUpdated({email, emailNotificationsEnabled: true}))

    assert.deepEqual(await filterEmailNotificationsEnabled(email), [email])
})

test('keeps an opt-out that arrives while the preference is being fetched', async () => {
    const fetched = deferred()
    remotePreference.mock.mockImplementationOnce(() => fetched.promise)
    const filtering = filterEmailNotificationsEnabled(email)

    await messageHandler('user.UserUpdated', userUpdated({email, emailNotificationsEnabled: false}))
    fetched.resolve(true)
    await filtering

    assert.deepEqual(await filterEmailNotificationsEnabled(email), [])
})

test('fetches the preference again after the cache is cleared', async () => {
    await filterEmailNotificationsEnabled(email)
    remotePreference.mock.mockImplementation(async () => false)

    await clearEmailNotificationsEnabled()

    assert.deepEqual(await filterEmailNotificationsEnabled(email), [])
})

const userUpdated = overrides => ({
    username: 'alice',
    email,
    emailNotificationsEnabled: true,
    ...overrides
})

const deferred = () => {
    let resolve
    const promise = new Promise(r => resolve = r)
    return {promise, resolve}
}
