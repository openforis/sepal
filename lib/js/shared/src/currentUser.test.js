import assert from 'node:assert/strict'
import {test} from 'node:test'

import {parseCurrentUser, requireAdmin, requireAuth} from './currentUser.js'

const ctx = (headers = {}) => ({headers, state: {}})
const userHeader = roles => ({'sepal-user': JSON.stringify({username: 'u', roles})})

test('parses a valid sepal-user header', () => {
    const ctx = {headers: {'sepal-user': JSON.stringify({username: 'bob', roles: []})}}
    assert.deepEqual(parseCurrentUser(ctx), {username: 'bob', roles: []})
})

test('returns null when the header is absent', () => {
    assert.equal(parseCurrentUser({headers: {}}), null)
})

test('returns null when the header is not valid JSON', () => {
    assert.equal(parseCurrentUser({headers: {'sepal-user': 'not-json'}}), null)
})

test('requireAuth passes through and sets currentUser for a valid header', async () => {
    const c = ctx(userHeader([]))
    let called = 0
    await requireAuth(c, async () => { called++ })
    assert.equal(called, 1)
    assert.deepEqual(c.state.currentUser, {username: 'u', roles: []})
})

test('requireAuth returns 401 with no header and does not call next', async () => {
    const c = ctx()
    let called = 0
    await requireAuth(c, async () => { called++ })
    assert.equal(c.status, 401)
    assert.equal(called, 0)
})

test('requireAdmin passes through for an application_admin user', async () => {
    const c = ctx(userHeader(['application_admin']))
    let called = 0
    await requireAdmin(c, async () => { called++ })
    assert.equal(called, 1)
    assert.equal(c.state.currentUser.username, 'u')
})

test('requireAdmin returns 403 for a non-admin user', async () => {
    const c = ctx(userHeader([]))
    let called = 0
    await requireAdmin(c, async () => { called++ })
    assert.equal(c.status, 403)
    assert.equal(called, 0)
})

test('requireAdmin returns 401 with no header', async () => {
    const c = ctx()
    await requireAdmin(c, async () => {})
    assert.equal(c.status, 401)
})
