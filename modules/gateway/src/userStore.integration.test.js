import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {after, afterEach, before, beforeEach, describe, mock, test} from 'node:test'

import {createClient} from 'redis'
import {firstValueFrom, from, Subject} from 'rxjs'

import {configureNoLogging} from '#sepal/log'

import {MemoryRedis} from './testSupport/memoryRedis.js'

// The user cache's write rules. Against the Redis GATEWAY_TEST_REDIS_URL names, which must be a disposable instance,
// they also show the compare-and-set is atomic: each test writes and then deletes its own user:alice-<uuid> key and
// nothing is flushed. Without it they run against an in-process stand-in, which checks the rules but not atomicity.
// The user module is faked; each user load answers when the test releases it.

const REDIS_URL = process.env.GATEWAY_TEST_REDIS_URL

let backendLoads
mock.module('#sepal/httpClient', {
    exports: {
        get$: () => {
            const load = Promise.withResolvers()
            backendLoads.push(load)
            return from(load.promise)
        },
        postJson$: () => {
            throw new Error('No Google token call expected')
        }
    }
})

const {UserStore} = await import('./userStore.js')

describe('user cache', () => {
    let redis
    let username
    let events
    let store

    before(async () => {
        configureNoLogging()
        redis = REDIS_URL ? await createClient({url: REDIS_URL}).connect() : new MemoryRedis()
    })

    beforeEach(() => {
        backendLoads = []
        username = `alice-${randomUUID()}`
        events = []
        store = storeOver(redis)
    })

    afterEach(() => redis.del(`user:${username}`))

    after(() => REDIS_URL && redis?.quit())

    test('an administrator reload finishing after a newer demotion leaves the demotion cached and announced alone', async () => {
        await firstValueFrom(store.setUser$(admin()))
        events.length = 0
        const olderReload = firstValueFrom(store.updateUser$(username), {defaultValue: null})
        const newerReload = firstValueFrom(store.updateUser$(username), {defaultValue: null})
        const [olderLoad, newerLoad] = backendLoads

        newerLoad.resolve({body: demoted()})
        await newerReload
        olderLoad.resolve({body: admin()})
        await olderReload

        assert.deepEqual(await cached(), demoted())
        assert.deepEqual(events.map(({type, data: {user}}) => [type, user.revision]), [['userUpdated', 2]])
    })

    test('a snapshot no newer than the cached user is refused, and answers with the cached user', async () => {
        await firstValueFrom(store.setUser$(demoted()))
        events.length = 0

        const answered = [
            await firstValueFrom(store.setUser$(admin())),
            await firstValueFrom(store.setUser$({...admin(), revision: 2})),
            await firstValueFrom(store.setUser$(unversioned(admin())))
        ]

        assert.deepEqual(answered, [demoted(), demoted(), demoted()])
        assert.deepEqual(await cached(), demoted())
        assert.deepEqual(events, [])
    })

    test('a newer write landing between the cache read and the write wins', async () => {
        await firstValueFrom(store.setUser$(admin()))
        const competitor = storeOver(redis)
        const racing = storeOver(withFirstReadFollowedBy(redis, () => firstValueFrom(competitor.setUser$(locked()))))
        events.length = 0

        const answered = await firstValueFrom(racing.setUser$(demoted()))

        assert.deepEqual(answered, locked())
        assert.deepEqual(await cached(), locked())
        assert.deepEqual(events.map(({data: {user}}) => user.revision), [3])
    })

    test('an older snapshot racing the first write of an absent entry loses', async () => {
        const competitor = storeOver(redis)
        const racing = storeOver(withFirstReadFollowedBy(redis, () => firstValueFrom(competitor.setUser$(demoted()))))

        const answered = await firstValueFrom(racing.setUser$(admin()))

        assert.deepEqual(answered, demoted())
        assert.deepEqual(await cached(), demoted())
    })

    test('a versioned snapshot replaces an unversioned entry left by an earlier gateway', async () => {
        await redis.set(`user:${username}`, JSON.stringify(unversioned(admin())))

        const answered = await firstValueFrom(store.setUser$(demoted()))

        assert.deepEqual(answered, demoted())
        assert.deepEqual(await cached(), demoted())
    })

    test('a reload older than a token refresh keeps the refreshed tokens', async () => {
        await firstValueFrom(store.setUser$(admin()))
        await firstValueFrom(store.updateGoogleTokens$({username, googleTokens: newTokens}))
        events.length = 0

        await firstValueFrom(store.setUser$(admin()))

        assert.deepEqual(await cached(), {...admin(), googleTokens: newTokens})
        assert.deepEqual(events, [])
    })

    test('a token refresh keeps a demotion landing between its cache read and write', async () => {
        await firstValueFrom(store.setUser$(admin()))
        const competitor = storeOver(redis)
        const refreshing = storeOver(withFirstReadFollowedBy(redis, () => firstValueFrom(competitor.setUser$(demoted()))))

        const answered = await firstValueFrom(refreshing.updateGoogleTokens$({username, googleTokens: newTokens}))

        assert.deepEqual(answered, {...demoted(), googleTokens: newTokens})
        assert.deepEqual(await cached(), {...demoted(), googleTokens: newTokens})
    })

    describe('a write that fails', () => {
        test('before it is applied leaves the cache as it was and announces nothing', async () => {
            await firstValueFrom(store.setUser$(admin()))
            const failing = storeOver(failingFirst(redis, 'eval', {applied: false}))
            events.length = 0

            await assert.rejects(firstValueFrom(failing.setUser$(demoted())), /cannot be saved/)

            assert.deepEqual(await cached(), admin())
            assert.deepEqual(events, [])
        })

        test('after it is applied, with its reply lost, leaves the write cached and unannounced', async () => {
            await firstValueFrom(store.setUser$(admin()))
            const failing = storeOver(failingFirst(redis, 'eval', {applied: true}))
            events.length = 0

            await assert.rejects(firstValueFrom(failing.setUser$(demoted())), /cannot be saved/)

            assert.deepEqual(await firstValueFrom(failing.getUser$(username)), demoted())
            assert.deepEqual(events, [])
        })
    })

    const storeOver = client => {
        const event$ = new Subject()
        event$.subscribe(event => events.push(event))
        return UserStore(client, event$)
    }

    const cached = async () => JSON.parse(await redis.get(`user:${username}`))

    const admin = () => ({
        id: 1, username, status: 'ACTIVE', admin: true, roles: ['application_admin'], revision: 1, googleTokens: oldTokens
    })
    const demoted = () => ({...admin(), admin: false, roles: [], revision: 2})
    const locked = () => ({...demoted(), status: 'LOCKED', revision: 3})
})

// A client whose first read is followed, before the caller sees it, by another writer's write.
const withFirstReadFollowedBy = (redis, write) => {
    let pending = write
    return {
        get: async key => {
            const value = await redis.get(key)
            if (pending) {
                const interleaved = pending
                pending = null
                await interleaved()
            }
            return value
        },
        set: (...args) => redis.set(...args),
        eval: (...args) => redis.eval(...args)
    }
}

// A client whose first `command` fails, either before Redis applies it or after, with the reply lost.
const failingFirst = (redis, command, {applied}) => {
    let failing = true
    return Object.fromEntries(['get', 'set', 'eval'].map(name => [name, async (...args) => {
        if (failing && name === command) {
            failing = false
            applied && await redis[name](...args)
            throw new Error('Connection lost')
        }
        return redis[name](...args)
    }]))
}

const unversioned = ({revision: _revision, ...user}) => user

const oldTokens = {accessToken: 'old-token', accessTokenExpiryDate: 1}
const newTokens = {accessToken: 'new-token', accessTokenExpiryDate: 2}
