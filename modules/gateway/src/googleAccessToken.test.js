import assert from 'node:assert/strict'
import {beforeEach, describe, mock, test} from 'node:test'

import {filter, firstValueFrom, of, Subject} from 'rxjs'

import {GOOGLE_ACCESS_TOKEN_ADDED, GOOGLE_ACCESS_TOKEN_REMOVED, GOOGLE_ACCESS_TOKEN_UPDATED, USER_DOWN, USER_UP} from '#sepal/event/definitions'

let refreshResponse$
let refreshStarted
let backendUser
let backendResponse$
let backendLoadStarted
let refreshRequests

mock.module('#sepal/httpClient', {
    exports: {
        get$: () => {
            backendLoadStarted.resolve()
            return backendResponse$ ?? of({body: backendUser})
        },
        postJson$: url => {
            if (url.endsWith('/google/revoke-access')) {
                return of({body: backendUser})
            }
            refreshRequests++
            refreshStarted.resolve()
            return refreshResponse$
        }
    }
})

const {initializeGoogleAccessTokenRefresher} = await import('./googleAccessToken.js')
const {GoogleAccessTokenMiddleware} = await import('./googleAccessTokenMiddleware.js')
const {UserStore} = await import('./userStore.js')

const oldTokens = {accessToken: 'old-token', accessTokenExpiryDate: 1}
const newTokens = () => ({accessToken: 'new-token', accessTokenExpiryDate: Date.now() + 3600000})
const admin = () => ({
    id: 1, username: 'alice', status: 'ACTIVE', admin: true, roles: ['application_admin'],
    name: 'Alice', revision: 1, googleTokens: oldTokens
})
const demoted = () => ({...admin(), admin: false, roles: [], name: 'Updated Alice', revision: 2})

beforeEach(() => {
    refreshResponse$ = new Subject()
    refreshStarted = Promise.withResolvers()
    backendUser = admin()
    backendResponse$ = undefined
    backendLoadStarted = Promise.withResolvers()
    refreshRequests = 0
})

for (const revoked of [false, true]) {
    const result = revoked ? 'revoked' : 'refreshed'

    describe(`Google tokens ${result} after administrator demotion`, () => {
        test('foreground refresh preserves current cache and forwarded roles', async () => {
            const {store, events} = fixture()
            const req = {headers: {'sepal-user': JSON.stringify(admin())}, originalUrl: '/api/gee/job'}
            const res = response()
            const next = mock.fn()
            const {googleAccessTokenMiddleware} = GoogleAccessTokenMiddleware(store)

            const pending = googleAccessTokenMiddleware(req, res, next)
            await refreshStarted.promise
            await firstValueFrom(store.setUser$(demoted()))
            events.length = 0
            const googleTokens = completeRefresh(revoked)
            await pending

            assert.equal(next.mock.callCount(), 1)
            assert.equal(res.status.mock.callCount(), 0)
            assertCurrentIdentity(JSON.parse(req.headers['sepal-user']), googleTokens)
            assert.deepEqual(await firstValueFrom(store.getUser$('alice')), cached({...demoted(), googleTokens}))
            assertTokenEvents(events, revoked)
        })

        test('background refresh preserves current cache and emitted roles', async t => {
            const {store, event$, events} = fixture()
            t.after(() => {
                event$.next({type: USER_DOWN, data: {user: demoted()}})
                event$.complete()
            })
            initializeGoogleAccessTokenRefresher({userStore: store, event$})

            event$.next({type: USER_UP, data: {user: admin()}})
            await refreshStarted.promise
            await firstValueFrom(store.setUser$(demoted()))
            events.length = 0
            const tokenEvent = revoked ? GOOGLE_ACCESS_TOKEN_REMOVED : GOOGLE_ACCESS_TOKEN_UPDATED
            const finished = firstValueFrom(event$.pipe(filter(({type}) => type === tokenEvent)))
            const googleTokens = completeRefresh(revoked)
            await finished

            assert.deepEqual(await firstValueFrom(store.getUser$('alice')), cached({...demoted(), googleTokens}))
            assertTokenEvents(events, revoked)
        })
    })
}

test('a demotion between the cache read and write causes a retry', async () => {
    const {store, redis, events} = fixture()
    const compareAndSet = redis.eval
    let firstAttempt = true
    redis.eval = mock.fn(async (...args) => {
        if (firstAttempt) {
            firstAttempt = false
            await firstValueFrom(store.setUser$(demoted()))
            events.length = 0
        }
        return compareAndSet(...args)
    })
    const googleTokens = newTokens()

    const user = await firstValueFrom(store.updateGoogleTokens$({username: 'Alice', googleTokens}))

    assert.equal(redis.eval.mock.callCount(), 2)
    assert.deepEqual(user, {...demoted(), googleTokens})
    assert.deepEqual(await firstValueFrom(store.getUser$('alice')), user)
    assertTokenEvents(events, false)
})

test('adding tokens preserves other user fields and announces the addition', async () => {
    const initial = cached({...demoted(), googleTokens: undefined})
    const {store, events} = fixture(initial)
    const googleTokens = newTokens()

    const user = await firstValueFrom(store.updateGoogleTokens$({username: 'alice', googleTokens}))

    assert.deepEqual(user, {...initial, googleTokens})
    assert.deepEqual(events.map(({type}) => type), ['userUpdated', GOOGLE_ACCESS_TOKEN_ADDED])
})

test('a missing cache record reloads current backend identity instead of recreating the old snapshot', async () => {
    const {store, redis} = fixture()
    redis.values.clear()
    backendUser = demoted()

    const user = await firstValueFrom(store.updateGoogleTokens$({username: 'alice', googleTokens: newTokens()}))

    assert.deepEqual(user, backendUser)
    assert.equal(redis.eval.mock.callCount(), 0)
    assert.deepEqual(await firstValueFrom(store.getUser$('alice')), backendUser)
})

test('a delayed initial cache fill cannot overwrite a demotion', async () => {
    const {store, redis, events} = fixture()
    redis.values.clear()
    backendResponse$ = new Subject()

    const pending = firstValueFrom(store.updateGoogleTokens$({username: 'alice', googleTokens: newTokens()}))
    await backendLoadStarted.promise
    await firstValueFrom(store.setUser$(demoted()))
    events.length = 0
    backendResponse$.next({body: admin()})
    backendResponse$.complete()

    assert.deepEqual(await pending, demoted())
    assert.deepEqual(await firstValueFrom(store.getUser$('alice')), demoted())
    assert.deepEqual(events, [])
})

for (const failure of ['refresh', 'cache write']) {
    test(`a failed ${failure} forwards current roles instead of the pre-refresh snapshot`, async () => {
        const {store, redis} = fixture()
        const req = {headers: {'sepal-user': JSON.stringify(admin())}, originalUrl: '/api/gee/job'}
        const next = mock.fn()
        const {googleAccessTokenMiddleware} = GoogleAccessTokenMiddleware(store)

        const pending = googleAccessTokenMiddleware(req, response(), next)
        await refreshStarted.promise
        await firstValueFrom(store.setUser$(demoted()))
        if (failure === 'refresh') {
            refreshResponse$.error(new Error('Google unavailable'))
        } else {
            redis.eval = async () => { throw new Error('Redis write failed') }
            completeRefresh(false)
        }
        await pending

        assert.equal(next.mock.callCount(), 1)
        assertCurrentIdentity(JSON.parse(req.headers['sepal-user']), oldTokens)
        assert.deepEqual(await firstValueFrom(store.getUser$('alice')), demoted())
    })
}

test('a refresh failure with unavailable current identity does not forward the request', async () => {
    const {store, redis} = fixture()
    const req = {headers: {'sepal-user': JSON.stringify(admin())}, originalUrl: '/api/gee/job'}
    const res = response()
    const next = mock.fn()
    const {googleAccessTokenMiddleware} = GoogleAccessTokenMiddleware(store)

    const pending = googleAccessTokenMiddleware(req, res, next)
    await refreshStarted.promise
    redis.get = async () => { throw new Error('Redis unavailable') }
    refreshResponse$.error(new Error('Google unavailable'))
    await pending

    assert.equal(next.mock.callCount(), 0)
    assert.deepEqual(res.status.mock.calls[0].arguments, [500])
    assert.equal(res.end.mock.callCount(), 1)
})

test('a request with valid Google tokens needs no refresh', async () => {
    const user = {...admin(), googleTokens: newTokens()}
    const {store} = fixture(user)
    const req = {headers: {'sepal-user': JSON.stringify(user)}, originalUrl: '/api/gee/job'}
    const next = mock.fn()
    const {googleAccessTokenMiddleware} = GoogleAccessTokenMiddleware(store)

    await googleAccessTokenMiddleware(req, response(), next)

    assert.equal(next.mock.callCount(), 1)
    assert.equal(refreshRequests, 0)
    assert.deepEqual(await firstValueFrom(store.getUser$('alice')), user)
})

const completeRefresh = revoked => {
    const googleTokens = revoked ? undefined : newTokens()
    refreshResponse$.next({statusCode: revoked ? 204 : 200, body: googleTokens})
    refreshResponse$.complete()
    return googleTokens
}

const assertCurrentIdentity = (user, googleTokens) => {
    assert.equal(user.username, 'alice')
    assert.equal(user.admin, false)
    assert.deepEqual(user.roles, [])
    assert.deepEqual(user.googleTokens, googleTokens)
}

const assertTokenEvents = (events, revoked) => {
    assert.deepEqual(events.map(({type}) => type), [
        'userUpdated', revoked ? GOOGLE_ACCESS_TOKEN_REMOVED : GOOGLE_ACCESS_TOKEN_UPDATED
    ])
    for (const {data: {user}} of events) {
        assert.equal(user.admin, false)
        assert.deepEqual(user.roles, [])
    }
}

const cached = user => JSON.parse(JSON.stringify(user))

const response = () => ({
    status: mock.fn(),
    end: mock.fn()
})

const fixture = (initial = admin()) => {
    const event$ = new Subject()
    const events = []
    event$.subscribe(event => events.push(event))
    const values = new Map([[`user:${initial.username}`, JSON.stringify(initial)]])
    const redis = {
        values,
        get: async key => values.get(key) ?? null,
        set: async (key, value, options) => {
            const previous = values.get(key) ?? null
            if (options?.NX && previous !== null) {
                return null
            }
            values.set(key, value)
            return options?.GET ? previous : 'OK'
        },
        eval: mock.fn(async (_script, {keys: [key], arguments: [expected, replacement]}) => {
            if (values.get(key) !== expected) {
                return 0
            }
            values.set(key, replacement)
            return 1
        })
    }
    return {store: UserStore(redis, event$), redis, event$, events}
}
