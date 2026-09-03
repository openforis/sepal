import {isAdmin, parseCurrentUser, requireAdmin, requireAuth} from './currentUser.js'

const ctx = (headers = {}) => ({headers, state: {}})
const userHeader = roles => ({'sepal-user': JSON.stringify({username: 'u', roles})})

test('parses a valid sepal-user header', () => {
    const ctx = {headers: {'sepal-user': JSON.stringify({username: 'bob', roles: []})}}
    expect(parseCurrentUser(ctx)).toEqual({username: 'bob', roles: []})
})

test('returns null when the header is absent', () => {
    expect(parseCurrentUser({headers: {}})).toBeNull()
})

test('returns null when the header is not valid JSON', () => {
    expect(parseCurrentUser({headers: {'sepal-user': 'not-json'}})).toBeNull()
})

test('requireAuth passes through and sets currentUser for a valid header', async () => {
    const c = ctx(userHeader([]))
    let called = 0
    await requireAuth(c, async () => { called++ })
    expect(called).toBe(1)
    expect(c.state.currentUser).toEqual({username: 'u', roles: []})
})

test('requireAuth returns 401 with no header and does not call next', async () => {
    const c = ctx()
    let called = 0
    await requireAuth(c, async () => { called++ })
    expect(c.status).toBe(401)
    expect(called).toBe(0)
})

test('requireAdmin passes through for an application_admin user', async () => {
    const c = ctx(userHeader(['application_admin']))
    let called = 0
    await requireAdmin(c, async () => { called++ })
    expect(called).toBe(1)
    expect(c.state.currentUser.username).toBe('u')
})

test('requireAdmin returns 403 for a non-admin user', async () => {
    const c = ctx(userHeader([]))
    let called = 0
    await requireAdmin(c, async () => { called++ })
    expect(c.status).toBe(403)
    expect(called).toBe(0)
})

test('requireAdmin returns 401 with no header', async () => {
    const c = ctx()
    await requireAdmin(c, async () => {})
    expect(c.status).toBe(401)
})

test('isAdmin is true for an application_admin user', () => {
    expect(isAdmin({username: 'u', roles: ['application_admin']})).toBe(true)
})

test('isAdmin is false for a user without the admin role', () => {
    expect(isAdmin({username: 'u', roles: []})).toBe(false)
})

test('isAdmin is false for a user without roles, or no user at all', () => {
    expect(isAdmin({username: 'u'})).toBe(false)
    expect(isAdmin(null)).toBe(false)
})
