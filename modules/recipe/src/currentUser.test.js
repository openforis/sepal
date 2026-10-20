import assert from 'node:assert/strict'
import {beforeEach, test} from 'node:test'

import {createRequireAuth} from './currentUser.js'

let received

beforeEach(() => {
    received = []
    warnings.length = 0
})

test('an authenticated request reaches the next middleware as its user', async () => {
    const ctx = authenticatedRequest()

    await requireAuth(ctx, observeDownstream(ctx))

    assert.deepEqual(received, [authenticatedUser])
})

test('a request without the header is unauthorized, and goes no further', async () => {
    const ctx = request()

    await requireAuth(ctx, observeDownstream(ctx))

    assert.deepEqual(received, [])
    assert.equal(ctx.status, 401)
})

// The 401 body cannot tell a missing header from an unparseable one, so the warning is the only signal
// that the gateway sent something malformed.
test('a header that will not parse is unauthorized, and reported', async () => {
    const ctx = request({'sepal-user': 'not-json'})

    await requireAuth(ctx, observeDownstream(ctx))

    assert.deepEqual(received, [])
    assert.equal(ctx.status, 401)
    assert.equal(warnings.length, 1)
})

const observeDownstream = ctx => async () => received.push(ctx.state.currentUser)

const authenticatedRequest = () => request({'sepal-user': JSON.stringify(authenticatedUser)})

const request = (headers = {}) => ({headers, state: {}})

const authenticatedUser = {username: 'bob', roles: []}

const warnings = []
const requireAuth = createRequireAuth({log: {warn: message => warnings.push(message)}})
