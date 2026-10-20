import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {Subject} from 'rxjs'

import {UserStore} from './userStore.js'

describe('userMiddleware', () => {
    test('an ACTIVE session user is injected into the request', async () => {
        const user = aUser({status: 'ACTIVE'})
        const {userMiddleware} = UserStore(redisHolding(user), new Subject())
        const req = requestWithSession(user.username)

        await run(userMiddleware, req)

        assert.partialDeepStrictEqual(
            JSON.parse(req.headers['sepal-user']),
            {username: user.username, status: 'ACTIVE'}
        )
    })

    test('a LOCKED session user is treated as unauthenticated', async () => {
        const user = aUser({status: 'LOCKED'})
        const {userMiddleware} = UserStore(redisHolding(user), new Subject())
        const req = requestWithSession(user.username)

        await run(userMiddleware, req)

        assert.equal(req.headers['sepal-user'], undefined)
    })
})

const aUser = ({username = 'alice', status}) => ({id: 1, username, status, roles: []})

const requestWithSession = username => ({session: {username}, headers: {}})

const run = (middleware, req) =>
    new Promise((resolve, reject) => middleware(req, {}, err => err ? reject(err) : resolve()))

const redisHolding = user => {
    const store = new Map([[`user:${user.username}`, JSON.stringify(user)]])
    return {
        get: mock.fn(async key => store.get(key) ?? null),
        set: mock.fn(async (key, value) => {
            const prev = store.get(key) ?? null
            store.set(key, value)
            return prev
        })
    }
}
