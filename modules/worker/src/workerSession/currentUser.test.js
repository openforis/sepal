import {SANDBOX, TASK_EXECUTOR} from '../workerInstance/workerTypes.js'
import {parseCurrentUser, requireAdmin, requireAuth, requireTaskExecutorSession} from './currentUser.js'

const ctx = (headers = {}) => ({headers, state: {}})
const userHeader = roles => ({'sepal-user': JSON.stringify({username: 'u', roles})})

test('parses a valid sepal-user header', () => {
    const c = {headers: {'sepal-user': JSON.stringify({username: 'bob', roles: []})}}
    expect(parseCurrentUser(c)).toEqual({username: 'bob', roles: []})
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

const sessionHeader = (workerType, sessionId = 's-1') =>
    ({'sepal-session': JSON.stringify({sessionId, workerType})})

describe('requireTaskExecutorSession', () => {
    test('passes through for a task-executor session, exposing the session it authenticated as', async () => {
        const c = ctx({...userHeader([]), ...sessionHeader(TASK_EXECUTOR)})
        let called = 0

        await requireTaskExecutorSession(c, async () => { called++ })

        expect(called).toBe(1)
        expect(c.state.currentUser.username).toBe('u')
        expect(c.state.workerSession).toEqual({sessionId: 's-1', workerType: TASK_EXECUTOR})
    })

    test.each([
        ['an ordinary user with no session', userHeader([])],
        ['an administrator with no session', userHeader(['application_admin'])],
        ['an interactive sandbox session', {...userHeader([]), ...sessionHeader(SANDBOX)}],
        ['a session with no id', {...userHeader([]), 'sepal-session': JSON.stringify({workerType: TASK_EXECUTOR})}],
        ['an unparseable session header', {...userHeader([]), 'sepal-session': 'not-json'}],
    ])('returns 403 for %s', async (_description, headers) => {
        const c = ctx(headers)
        let called = 0

        await requireTaskExecutorSession(c, async () => { called++ })

        expect(c.status).toBe(403)
        expect(called).toBe(0)
    })

    test('returns 401 with no authenticated user', async () => {
        const c = ctx(sessionHeader(TASK_EXECUTOR))

        await requireTaskExecutorSession(c, async () => {})

        expect(c.status).toBe(401)
    })
})
