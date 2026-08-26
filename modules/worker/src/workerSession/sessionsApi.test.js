// sessionsApi unit tests — verify each handler calls the right sessionManager method with the
// right args (currentUser vs path username), the response status codes, and the serialization
// (STARTING/ACTIVE, path self vs admin, report shape, api-key 200/401).
//
// Runs with TZ=UTC (package.json test script) so timestamp formatting is deterministic.

import {jest} from '@jest/globals'

import {instanceName} from './instanceName.js'
import {createSessionsApi} from './sessionsApi.js'

const sessionManager = {
    generateUserSessionReport: jest.fn(),
    generateUserUsageReport: jest.fn(),
    mostRecentlyClosedSessionByUser: jest.fn(),
    mostRecentlyClosedSession: jest.fn(),
    requestSession: jest.fn(),
    heartbeat: jest.fn(),
    setSessionTimeoutHours: jest.fn(),
    manualExtension: jest.fn(),
    openExtension: jest.fn(),
    dismissExpiryNotification: jest.fn(),
    redeemExtension: jest.fn(),
    redeemTermination: jest.fn(),
    instanceDescription: jest.fn(),
    closeSession: jest.fn(),
    closeUserSessions: jest.fn(),
    findUsernameByApiKey: jest.fn(),
    userWorkerSessions: jest.fn(),
    allOpenSessions: jest.fn(),
    associateApp: jest.fn(),
    dissociateApp: jest.fn(),
    userAppSessions: jest.fn(),
}

const sandboxServers = {ensureServerStarted: jest.fn()}

const fixedClock = () => new Date('2026-07-01T12:00:00.000Z')
const expiryPolicy = {mode: 'notify', graceMinutes: 60}
const api = createSessionsApi({sessionManager, sandboxServers, clock: fixedClock, expiryPolicy})

const ctx = (overrides = {}) => ({
    params: {},
    query: {},
    request: {body: {}},
    state: {currentUser: {username: 'Alice', roles: []}},
    ...overrides,
})

const pendingSession = (over = {}) => ({
    id: 's1',
    state: 'PENDING',
    username: 'alice',
    instance: {id: 'i1', host: 'host-1'},
    creationTime: new Date('2026-07-01T10:00:00.000Z'),
    timeoutTime: null,
    notificationState: 'NONE',
    notifiedTime: null,
    ...over,
})

beforeEach(() => Object.values(sessionManager).forEach(fn => fn.mockReset()))

// ── request session ──────────────────────────────────────────────────────────

test('requestSessionSelf → 201, uses currentUser (lowercased), self path, STARTING status', async () => {
    sessionManager.requestSession.mockResolvedValue(pendingSession())
    const c = ctx({params: {instanceType: 'T3aSmall'}})
    await api.requestSessionSelf(c)
    expect(sessionManager.requestSession).toHaveBeenCalledWith({
        instanceType: 'T3aSmall', workerType: 'sandbox', username: 'alice',
    })
    expect(c.status).toBe(201)
    expect(c.body).toEqual({
        id: 's1', path: 'sessions/session/s1', username: 'alice', status: 'STARTING', host: 'host-1',
    })
})

test('requestSessionSelf → 503 {code: INSTANCE_UNAVAILABLE} when the launch hits an AZ capacity error', async () => {
    sessionManager.requestSession.mockRejectedValue(
        Object.assign(new Error('Insufficient capacity.'), {name: 'InsufficientInstanceCapacity'}))
    const c = ctx({params: {instanceType: 'T3aMedium'}})
    await api.requestSessionSelf(c)
    expect(c.status).toBe(503)
    expect(c.body).toEqual({code: 'INSTANCE_UNAVAILABLE', message: 'Insufficient capacity.'})
})

test('requestSessionSelf → 503 {code: QUOTA_EXCEEDED} when the account limit is hit', async () => {
    sessionManager.requestSession.mockRejectedValue(
        Object.assign(new Error('vCPU limit exceeded.'), {name: 'VcpuLimitExceeded'}))
    const c = ctx({params: {instanceType: 'T3aMedium'}})
    await api.requestSessionSelf(c)
    expect(c.status).toBe(503)
    expect(c.body).toEqual({code: 'QUOTA_EXCEEDED', message: 'vCPU limit exceeded.'})
})

test('requestSessionSelf rethrows unclassified errors', async () => {
    sessionManager.requestSession.mockRejectedValue(new Error('boom'))
    const c = ctx({params: {instanceType: 'T3aMedium'}})
    await expect(api.requestSessionSelf(c)).rejects.toThrow('boom')
})

test('requestSessionOther → uses path username, admin path form', async () => {
    sessionManager.requestSession.mockResolvedValue(pendingSession({username: 'bob', state: 'ACTIVE'}))
    const c = ctx({params: {username: 'Bob', instanceType: 'M6aLarge'}})
    await api.requestSessionOther(c)
    expect(sessionManager.requestSession).toHaveBeenCalledWith({
        instanceType: 'M6aLarge', workerType: 'sandbox', username: 'bob',
    })
    expect(c.status).toBe(201)
    expect(c.body).toEqual({
        id: 's1', path: 'sessions/bob/session/s1', username: 'bob', status: 'ACTIVE', host: 'host-1',
    })
})

// ── heartbeat ──────────────────────────────────────────────────────────────────

test('heartbeatSelf → currentUser, sessionId, self path', async () => {
    sessionManager.heartbeat.mockResolvedValue(pendingSession({state: 'ACTIVE'}))
    const c = ctx({params: {sessionId: 's1'}})
    await api.heartbeatSelf(c)
    expect(sessionManager.heartbeat).toHaveBeenCalledWith({sessionId: 's1', username: 'alice', interaction: false})
    expect(c.body).toEqual({
        id: 's1', path: 'sessions/session/s1', username: 'alice', status: 'ACTIVE', host: 'host-1',
    })
})

test('heartbeatOther → path username', async () => {
    sessionManager.heartbeat.mockResolvedValue(pendingSession({username: 'bob'}))
    const c = ctx({params: {username: 'bob', sessionId: 's1'}})
    await api.heartbeatOther(c)
    expect(sessionManager.heartbeat).toHaveBeenCalledWith({sessionId: 's1', username: 'bob', interaction: false})
    expect(c.body.path).toBe('sessions/bob/session/s1')
})

test('heartbeat forwards interaction: true only for an exact boolean true body flag', async () => {
    sessionManager.heartbeat.mockResolvedValue(pendingSession())
    await api.heartbeatSelf(ctx({params: {sessionId: 's1'}, request: {body: {interaction: true}}}))
    expect(sessionManager.heartbeat).toHaveBeenLastCalledWith({sessionId: 's1', username: 'alice', interaction: true})
    await api.heartbeatSelf(ctx({params: {sessionId: 's1'}, request: {body: {interaction: 'yes'}}}))
    expect(sessionManager.heartbeat).toHaveBeenLastCalledWith({sessionId: 's1', username: 'alice', interaction: false})
})

// A bare beat is what the gateway sends for every cached session regardless of use. Reading it as
// liveness is the failure this design removes, so it must reach the worker as interaction: false.
test('a bodiless heartbeat is not an interaction', async () => {
    sessionManager.heartbeat.mockResolvedValue(pendingSession())
    await api.heartbeatSelf(ctx({params: {sessionId: 's1'}, request: {}}))
    expect(sessionManager.heartbeat).toHaveBeenLastCalledWith({sessionId: 's1', username: 'alice', interaction: false})
})

// ── deadline extension ───────────────────────────────────────────────────────

test('extendSession → 204, ratchets by the requested hours, self user', async () => {
    const c = ctx({params: {sessionId: 's1'}, query: {hours: '2'}})
    await api.setKeepAlive(c)
    expect(c.status).toBe(204)
    expect(sessionManager.setSessionTimeoutHours).toHaveBeenCalledWith(
        {sessionId: 's1', hours: 2, username: 'alice'})
})

test('extendSession → 400 when hours missing', async () => {
    const c = ctx({params: {sessionId: 's1'}, query: {}})
    await api.setKeepAlive(c)
    expect(c.status).toBe(400)
    expect(sessionManager.setSessionTimeoutHours).not.toHaveBeenCalled()
})

// One-shots are acknowledged rather than fire-and-forget: a button that appears to work while
// doing nothing is the worst available outcome.
test('the Extend button reports whether the extension landed', async () => {
    sessionManager.manualExtension.mockResolvedValue(true)
    const extended = ctx({params: {sessionId: 's1'}})
    await api.extendNow(extended)
    expect(extended.status).toBe(200)
    expect(extended.body).toEqual({extended: true})

    sessionManager.manualExtension.mockResolvedValue(false)
    const gone = ctx({params: {sessionId: 's1'}})
    await api.extendNow(gone)
    expect(gone.status).toBe(409)
})

test('the terminal-opened one-shot reports the same way', async () => {
    sessionManager.openExtension.mockResolvedValue(true)
    const c = ctx({params: {sessionId: 's1'}})
    await api.openExtension(c)
    expect(sessionManager.openExtension).toHaveBeenCalledWith({sessionId: 's1', username: 'alice'})
    expect(c.status).toBe(200)
})

test('dismiss → 204, and does not extend', async () => {
    const c = ctx({params: {sessionId: 's1'}})
    await api.dismissExpiry(c)
    expect(c.status).toBe(204)
    expect(sessionManager.dismissExpiryNotification).toHaveBeenCalledWith(
        {sessionId: 's1', username: 'alice'})
    expect(sessionManager.setSessionTimeoutHours).not.toHaveBeenCalled()
})

// ── the email management link ────────────────────────────────────────────────

describe('the email management link', () => {
    const tokens = {verify: jest.fn()}
    const tokenApi = createSessionsApi({
        sessionManager, clock: fixedClock,
        expiryPolicy: {...expiryPolicy, emailExtensionMinutes: 60},
        expiryTokens: tokens,
    })

    const claim = (notifiedTime = new Date()) => ({sessionId: 's1', notifiedTime})
    const post = (token, action) => ctx({params: {token}, request: {body: action ? {action} : {}}})

    beforeEach(() => {
        tokens.verify.mockReset()
        sessionManager.instanceDescription.mockReset()
        sessionManager.instanceDescription.mockResolvedValue({name: 'jazzy-anchor', ordinal: 1, typeName: 't3a.small', hourlyCost: 0.02})
    })

    // ONE link in the mail, both choices on the page it opens.
    test('GET renders both buttons and mutates NOTHING', async () => {
        tokens.verify.mockReturnValue(claim())
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        expect(c.type).toBe('html')
        expect(c.body).toContain('Keep it running')
        expect(c.body).toContain('Terminate now')
        expect(sessionManager.redeemExtension).not.toHaveBeenCalled()
        expect(sessionManager.redeemTermination).not.toHaveBeenCalled()
    })

    // Mail-client link scanners, URL-rewriting proxies and preview fetchers all fire the GET, so
    // the page it renders is the ONLY thing a GET may do.
    // A user with two instances must be able to tell WHICH one this page is about, named the same
    // way the notification, the mail and the SSH menu name it.
    test('the page names the instance, its type and what it costs', async () => {
        tokens.verify.mockReturnValue(claim())
        sessionManager.instanceDescription.mockResolvedValue({
            name: 'crazy-banana', ordinal: 2, typeName: 't3a.small', hourlyCost: 0.0204})
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        expect(sessionManager.instanceDescription).toHaveBeenCalledWith('s1')
        expect(c.body).toContain('Instance <b>crazy-banana</b> (t3a.small, $0.02/h)')
        expect(c.body).not.toContain('Instance 2')
    })

    test('a type with no known cost is named without a price', async () => {
        tokens.verify.mockReturnValue(claim())
        sessionManager.instanceDescription.mockResolvedValue({
            name: 'crazy-banana', ordinal: 1, typeName: 't3a.small', hourlyCost: null})
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        expect(c.body).toContain('Instance <b>crazy-banana</b> (t3a.small)')
    })

    test('an instance with no derivable name is still named, not left blank', async () => {
        tokens.verify.mockReturnValue(claim())
        sessionManager.instanceDescription.mockResolvedValue({name: null, ordinal: null, typeName: null})
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        expect(c.body).toContain('One of your instances')
    })

    // The ordinal is a position among OPEN sessions, so it must be read before the close or the
    // result page would name whichever instance inherited the number.
    test('the terminated page names the instance as it was BEFORE the close', async () => {
        tokens.verify.mockReturnValue(claim())
        sessionManager.instanceDescription.mockResolvedValue({
            name: 'crazy-banana', ordinal: 2, typeName: 't3a.small', hourlyCost: 0.02})
        sessionManager.redeemTermination.mockImplementation(async () => {
            sessionManager.instanceDescription.mockResolvedValue({name: null, ordinal: null, typeName: null})
            return true
        })
        const c = post('tok', 'terminate')
        await tokenApi.redeemExpiryToken(c)
        expect(c.body).toContain('crazy-banana')
    })

    // The page is the notification, for someone who is not looking at SEPAL — so it uses the
    // notification's own words and its own colours, not a second vocabulary for the same choice.
    test('the buttons carry the in-app notification labels', async () => {
        tokens.verify.mockReturnValue(claim())
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        expect(c.body).toContain('Keep it running 60 min')
        expect(c.body).toContain('Terminate now')
    })

    test('the terminate button is the notification\'s red', async () => {
        tokens.verify.mockReturnValue(claim())
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        expect(c.body).toMatch(/hsl\(0, ?45%, ?33%\)/)
    })

    test('GET of a spent or expired token says so instead of erroring', async () => {
        tokens.verify.mockReturnValue(null)
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        expect(c.body).toContain('no longer valid')
    })

    test('POST extend runs the extension and nothing else', async () => {
        const notifiedTime = new Date('2026-07-01T11:00:00Z')
        tokens.verify.mockReturnValue(claim(notifiedTime))
        sessionManager.redeemExtension.mockResolvedValue(true)
        const c = post('tok', 'extend')
        await tokenApi.redeemExpiryToken(c)
        expect(sessionManager.redeemExtension).toHaveBeenCalledWith({sessionId: 's1', notifiedTime})
        expect(sessionManager.redeemTermination).not.toHaveBeenCalled()
        expect(c.body).toContain('keep running')
    })

    test('POST terminate runs the termination and nothing else', async () => {
        const notifiedTime = new Date('2026-07-01T11:00:00Z')
        tokens.verify.mockReturnValue(claim(notifiedTime))
        sessionManager.redeemTermination.mockResolvedValue(true)
        const c = post('tok', 'terminate')
        await tokenApi.redeemExpiryToken(c)
        expect(sessionManager.redeemTermination).toHaveBeenCalledWith({sessionId: 's1', notifiedTime})
        expect(sessionManager.redeemExtension).not.toHaveBeenCalled()
        expect(c.body).toContain('stopped')
    })

    // A POST naming no action, or one this server does not implement, must do NOTHING — guessing
    // would eventually guess `terminate` for someone who never asked for it.
    test.each([['no action', undefined], ['an unknown action', 'reboot']])(
        'POST with %s acts on neither and re-offers the choice', async (_name, action) => {
            tokens.verify.mockReturnValue(claim())
            const c = post('tok', action)
            await tokenApi.redeemExpiryToken(c)
            expect(sessionManager.redeemExtension).not.toHaveBeenCalled()
            expect(sessionManager.redeemTermination).not.toHaveBeenCalled()
            expect(c.status).toBe(400)
            expect(c.body).toContain('Keep it running')
            expect(c.body).toContain('Terminate now')
        })

    // Someone clicked a link in an email and needs to be told what happened.
    test.each([
        ['extend', 'redeemExtension'],
        ['terminate', 'redeemTermination'],
    ])('POST of an already-spent token (%s) explains rather than erroring', async (action, method) => {
        tokens.verify.mockReturnValue(claim())
        sessionManager[method].mockResolvedValue(false)
        const c = post('tok', action)
        await tokenApi.redeemExpiryToken(c)
        expect(c.body).toContain('no longer valid')
    })

    test('POST of a malformed token is 410, not 500', async () => {
        tokens.verify.mockReturnValue(null)
        const c = post('nope', 'extend')
        await tokenApi.redeemExpiryToken(c)
        expect(c.status).toBe(410)
    })
})

// ── close ────────────────────────────────────────────────────────────────────

test('closeSessionSelf → 204 with {status: OK}, self user', async () => {
    const c = ctx({params: {sessionId: 's1'}})
    await api.closeSessionSelf(c)
    expect(sessionManager.closeSession).toHaveBeenCalledWith({sessionId: 's1', username: 'alice'})
    expect(c.status).toBe(204)
    expect(c.body).toEqual({status: 'OK'})
})

test('closeSessionOther → path username, 204', async () => {
    const c = ctx({params: {username: 'bob', sessionId: 's1'}})
    await api.closeSessionOther(c)
    expect(sessionManager.closeSession).toHaveBeenCalledWith({sessionId: 's1', username: 'bob'})
    expect(c.status).toBe(204)
})

test('closeUserSessions → path username, 204', async () => {
    const c = ctx({params: {username: 'Bob'}})
    await api.closeUserSessions(c)
    expect(sessionManager.closeUserSessions).toHaveBeenCalledWith('bob')
    expect(c.status).toBe(204)
})

// ── active/pending sandbox sessions (gateway cache-miss fallback) ──────────────

test('activeSessions → queries self (lowercased) for PENDING+ACTIVE SANDBOX sessions', async () => {
    sessionManager.userWorkerSessions.mockResolvedValue([])
    const c = ctx()
    await api.activeSessions(c)
    expect(sessionManager.userWorkerSessions).toHaveBeenCalledWith({
        username: 'alice',
        states: ['PENDING', 'ACTIVE'],
        workerType: 'sandbox',
    })
})

test('activeSessions → maps to [{id, host, status, instanceType}] with STARTING/ACTIVE mapping', async () => {
    sessionManager.userWorkerSessions.mockResolvedValue([
        pendingSession({id: 's1', state: 'ACTIVE', instanceType: 'T3aSmall', instance: {id: 'i1', host: 'host-1'}}),
        pendingSession({id: 's2', state: 'PENDING', instanceType: 'M6aLarge', instance: {id: 'i2', host: 'host-2'}}),
    ])
    const c = ctx()
    await api.activeSessions(c)
    expect(c.body).toEqual([
        {id: 's1', host: 'host-1', status: 'ACTIVE', instanceType: 'T3aSmall'},
        {id: 's2', host: 'host-2', status: 'STARTING', instanceType: 'M6aLarge'},
    ])
})

test('activeSessions → empty array when the user has no pending/active sandbox session', async () => {
    sessionManager.userWorkerSessions.mockResolvedValue([])
    const c = ctx()
    await api.activeSessions(c)
    expect(c.body).toEqual([])
})

// CLOSED and non-SANDBOX sessions are filtered out by the query (states=[PENDING,ACTIVE],
// workerType=SANDBOX); the handler must not widen that filter.
test('activeSessions → filter args exclude CLOSED and non-SANDBOX at the query', async () => {
    sessionManager.userWorkerSessions.mockResolvedValue([])
    const c = ctx()
    await api.activeSessions(c)
    const {states, workerType} = sessionManager.userWorkerSessions.mock.calls[0][0]
    expect(states).toEqual(['PENDING', 'ACTIVE'])
    expect(states).not.toContain('CLOSED')
    expect(workerType).toBe('sandbox')
})

// Only the current user's sessions: the query is scoped to currentUser.username, never a path param.
test('activeSessions → scoped to the current user, ignores any :username path param', async () => {
    sessionManager.userWorkerSessions.mockResolvedValue([])
    const c = ctx({params: {username: 'bob'}})
    await api.activeSessions(c)
    expect(sessionManager.userWorkerSessions).toHaveBeenCalledWith(
        expect.objectContaining({username: 'alice'})
    )
})

// ── all open sessions (admin; budget seed/reconciler) ──────────────────────────

test('openSessions → passes through sessionManager.allOpenSessions(), unscoped by currentUser', async () => {
    const openList = [
        {username: 'alice', sessionId: 's1', instanceType: 'T3aSmall', creationTime: '2026-07-01T10:00:00'},
        {username: 'bob', sessionId: 's2', instanceType: 'M6aLarge', creationTime: '2026-07-01T11:00:00'},
    ]
    sessionManager.allOpenSessions.mockResolvedValue(openList)
    const c = ctx()
    await api.openSessions(c)
    expect(sessionManager.allOpenSessions).toHaveBeenCalledWith()
    expect(c.body).toBe(openList)
})

// ── mostRecentlyClosed ────────────────────────────────────────────────────────

test('mostRecentlyClosedByUser → passes through repo map', async () => {
    sessionManager.mostRecentlyClosedSessionByUser.mockResolvedValue({bob: '2026-01-01'})
    const c = ctx()
    await api.mostRecentlyClosedByUser(c)
    expect(c.body).toEqual({bob: '2026-01-01'})
})

test('mostRecentlyClosed → uses query username (route has no :username path segment)', async () => {
    sessionManager.mostRecentlyClosedSession.mockResolvedValue({timestamp: 'x'})
    const c = ctx({query: {username: 'Bob'}})
    await api.mostRecentlyClosed(c)
    // The handler passes the raw query username; sessionManager lowercases internally.
    expect(sessionManager.mostRecentlyClosedSession).toHaveBeenCalledWith('Bob')
    expect(c.body).toEqual({timestamp: 'x'})
})

test('mostRecentlyClosed → 400 when username missing', async () => {
    const c = ctx({query: {}})
    await api.mostRecentlyClosed(c)
    expect(c.status).toBe(400)
    expect(sessionManager.mostRecentlyClosedSession).not.toHaveBeenCalled()
})

// ── api-key authenticate ────────────────────────────────────────────────────

test('apiKeyAuthenticate → 200 {username} when found', async () => {
    sessionManager.findUsernameByApiKey.mockResolvedValue('bob')
    const c = ctx({request: {body: {apiKey: 'k'}}})
    await api.apiKeyAuthenticate(c)
    expect(sessionManager.findUsernameByApiKey).toHaveBeenCalledWith('k')
    expect(c.body).toEqual({username: 'bob'})
})

test('apiKeyAuthenticate → 401 {} when not found', async () => {
    sessionManager.findUsernameByApiKey.mockResolvedValue(null)
    const c = ctx({request: {body: {apiKey: 'k'}}})
    await api.apiKeyAuthenticate(c)
    expect(c.status).toBe(401)
    expect(c.body).toEqual({})
})

test('apiKeyAuthenticate → 400 when apiKey missing', async () => {
    const c = ctx({request: {body: {}}})
    await api.apiKeyAuthenticate(c)
    expect(c.status).toBe(400)
    expect(sessionManager.findUsernameByApiKey).not.toHaveBeenCalled()
})

test('apiKeyAuthenticate → reads apiKey from query too', async () => {
    sessionManager.findUsernameByApiKey.mockResolvedValue('bob')
    const c = ctx({request: {body: {}}, query: {apiKey: 'qk'}})
    await api.apiKeyAuthenticate(c)
    expect(sessionManager.findUsernameByApiKey).toHaveBeenCalledWith('qk')
})

// ── report serialization ──────────────────────────────────────────────────────

test('generateReportSelf → full report map with session + instanceType', async () => {
    const instanceType = {
        id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2,
        description: '1 CPU, 2 GiB', hourlyCost: 0.02,
    }
    sessionManager.generateUserSessionReport.mockResolvedValue({
        sessions: [pendingSession({
            state: 'ACTIVE',
            instanceType: 'T3aSmall',
            creationTime: new Date('2026-07-01T10:00:00.000Z'),
        })],
        instanceTypes: [instanceType],
    })
    const c = ctx()
    await api.generateReportSelf(c)
    expect(sessionManager.generateUserSessionReport).toHaveBeenCalledWith({
        username: 'alice', workerType: 'sandbox',
    })
    const s = c.body.sessions[0]
    expect(s).toEqual({
        id: 's1',
        name: instanceName('s1'),
        path: 'sessions/session/s1',
        username: 'alice',
        status: 'ACTIVE',
        host: 'host-1',
        timeoutHours: 0,
        instanceType: {
            id: 'T3aSmall', path: 'sessions/instance-type/T3aSmall', name: 't3a.small',
            tag: 't1', cpuCount: 1, ramGiB: 2, gpuCount: 0, description: '1 CPU, 2 GiB', hourlyCost: 0.02,
        },
        creationTime: '2026-07-01T10:00:00.000Z',
        // 2h since creation (clock 12:00, creation 10:00) → ceil(2) * 0.02 = 0.04
        costSinceCreation: 0.04,
        apps: [],
        terminals: 0,
        verdict: 'unknown',
        usage: null,
        expiry: {state: 'NONE', timeoutTime: null, notifiedTime: null, closeTime: null},
    })
    expect(c.body.instanceTypes[0].path).toBe('sessions/instance-type/T3aSmall')
    // spending is NOT part of the report anymore — it is pushed by the budget module's ws
    expect(c.body).not.toHaveProperty('spending')
    expect(c.body).not.toHaveProperty('budgetUpdateRequest')
})

// A creationTime without a timezone designator is parsed by the browser as LOCAL time, so the GUI
// would render the UTC wall clock and compute a "time ago" off by the viewer's UTC offset.
test('creationTime carries the instant, not a bare wall clock', async () => {
    sessionManager.generateUserSessionReport.mockResolvedValue({
        sessions: [pendingSession({
            instanceType: 'T3aSmall',
            creationTime: new Date('2026-07-01T10:00:00.000Z'),
        })],
        instanceTypes: [{id: 'T3aSmall', hourlyCost: 0.02}],
    })
    const c = ctx()
    await api.generateReportSelf(c)
    const {creationTime} = c.body.sessions[0]
    expect(creationTime).toMatch(/Z$/)
    expect(Date.parse(creationTime)).toBe(Date.parse('2026-07-01T10:00:00.000Z'))
})

test('generateReportOther → admin path form in session + instanceType', async () => {
    const instanceType = {
        id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2,
        description: '1 CPU, 2 GiB', hourlyCost: 0.02,
    }
    sessionManager.generateUserSessionReport.mockResolvedValue({
        sessions: [pendingSession({username: 'bob', instanceType: 'T3aSmall'})],
        instanceTypes: [instanceType],
    })
    const c = ctx({params: {username: 'Bob'}})
    await api.generateReportOther(c)
    expect(sessionManager.generateUserSessionReport).toHaveBeenCalledWith({
        username: 'bob', workerType: 'sandbox',
    })
    expect(c.body.sessions[0].path).toBe('sessions/bob/session/s1')
    expect(c.body.sessions[0].instanceType.path).toBe('sessions/bob/instance-type/T3aSmall')
    expect(c.body.sessions[0].status).toBe('STARTING')
})

test('report sessions include their associated apps', () => {
    const instanceType = {
        id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2,
        description: '1 CPU, 2 GiB', hourlyCost: 0.02,
    }
    const report = {
        sessions: [pendingSession({
            state: 'ACTIVE',
            instanceType: 'T3aSmall',
            apps: [{path: '/sandbox/shiny/foo', label: 'Foo'}],
        })],
        instanceTypes: [instanceType],
    }
    const map = api._internal.reportAsMap(report, 'alice', true)
    expect(map.sessions[0].apps).toEqual([{path: '/sandbox/shiny/foo', label: 'Foo'}])
})

// What is running and whether anything is using it — the two things the Usage panel says about an
// instance beyond its cost.
test('report sessions carry the terminal count and the busy verdict', () => {
    const report = {
        sessions: [pendingSession({
            state: 'ACTIVE', instanceType: 'T3aSmall', apps: [], terminals: 2, verdict: 'busy',
        })],
        instanceTypes: [{id: 'T3aSmall', name: 't3a.small', hourlyCost: 0.02}],
    }
    const map = api._internal.reportAsMap(report, 'alice', true)
    expect(map.sessions[0].terminals).toBe(2)
    expect(map.sessions[0].verdict).toBe('busy')
})

// A session the sampler has not reached yet has no verdict, and 'unused' is the one word that must
// never be guessed: it is what tells a user their instance is about to be stopped.
test('an unsampled session reports no terminals and an unknown verdict', () => {
    const report = {
        sessions: [pendingSession({state: 'ACTIVE', instanceType: 'T3aSmall', apps: []})],
        instanceTypes: [{id: 'T3aSmall', name: 't3a.small', hourlyCost: 0.02}],
    }
    const map = api._internal.reportAsMap(report, 'alice', true)
    expect(map.sessions[0].terminals).toBe(0)
    expect(map.sessions[0].verdict).toBe('unknown')
})

const notifiedReport = () => ({
    sessions: [pendingSession({
        state: 'ACTIVE', instanceType: 'T3aSmall', apps: [],
        notificationState: 'NOTIFIED', notifiedTime: new Date('2026-08-02T11:00:00Z'),
        timeoutTime: new Date('2026-08-02T10:55:00Z'),
    })],
    instanceTypes: [{
        id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2,
        description: '1 CPU, 2 GiB', hourlyCost: 0.02,
    }],
})

// The GUI session list names instances the same way the notification, the mail and the SSH menu
// do, so it needs the name on every row rather than deriving its own.
test('every session in the report carries its derived name', () => {
    const map = api._internal.reportAsMap(notifiedReport(), 'alice', true)
    expect(map.sessions[0].name).toBe(instanceName(map.sessions[0].id))
})

test('serializes the expiry cycle state and the stored deadline', () => {
    const map = api._internal.reportAsMap(notifiedReport(), 'alice', true)
    expect(map.sessions[0].expiry).toEqual({
        state: 'NOTIFIED',
        timeoutTime: '2026-08-02T10:55:00.000Z',
        notifiedTime: '2026-08-02T11:00:00.000Z',
        // notify mode: nothing will actually close, so there is no close time to count down to
        closeTime: null,
    })
})

test('closeTime appears only under enforcement', () => {
    const enforcing = createSessionsApi({
        sessionManager, clock: fixedClock,
        expiryPolicy: {mode: 'enforce', graceMinutes: 60},
    })
    const map = enforcing._internal.reportAsMap(notifiedReport(), 'alice', true)
    expect(map.sessions[0].expiry.closeTime).toBe('2026-08-02T12:00:00.000Z')
})

// The slider's position is hours left on the stored deadline.
test('timeoutHours counts down the stored deadline and never goes negative', () => {
    const future = api._internal.reportAsMap({
        ...notifiedReport(),
        sessions: [pendingSession({
            state: 'ACTIVE', instanceType: 'T3aSmall', apps: [],
            timeoutTime: new Date(Date.now() + 2 * 3600 * 1000),
        })],
    }, 'alice', true)
    expect(future.sessions[0].timeoutHours).toBeGreaterThan(1.9)

    const past = api._internal.reportAsMap(notifiedReport(), 'alice', true)
    expect(past.sessions[0].timeoutHours).toBe(0)
})

test('userUsage → admin path user (lowercased), default days 30, body passthrough', async () => {
    sessionManager.generateUserUsageReport.mockResolvedValue({days: 30, overall: null, byInstanceType: []})
    const c = ctx({params: {username: 'Bob'}})
    await api.userUsage(c)
    expect(sessionManager.generateUserUsageReport).toHaveBeenCalledWith({username: 'bob', days: 30})
    expect(c.body).toEqual({days: 30, overall: null, byInstanceType: []})
})

test('userUsage → days parsed and clamped to 1..365', async () => {
    sessionManager.generateUserUsageReport.mockResolvedValue({})
    await api.userUsage(ctx({params: {username: 'bob'}, query: {days: '90'}}))
    expect(sessionManager.generateUserUsageReport).toHaveBeenLastCalledWith({username: 'bob', days: 90})
    await api.userUsage(ctx({params: {username: 'bob'}, query: {days: '9999'}}))
    expect(sessionManager.generateUserUsageReport).toHaveBeenLastCalledWith({username: 'bob', days: 365})
    await api.userUsage(ctx({params: {username: 'bob'}, query: {days: '0'}}))
    expect(sessionManager.generateUserUsageReport).toHaveBeenLastCalledWith({username: 'bob', days: 1})
    await api.userUsage(ctx({params: {username: 'bob'}, query: {days: 'nope'}}))
    expect(sessionManager.generateUserUsageReport).toHaveBeenLastCalledWith({username: 'bob', days: 30})
})

test('serializes fresh usage and nulls stale or missing usage', () => {
    // The module-level api's clock is fixed at 2026-07-01T12:00:00Z; usage older than 5 minutes
    // is stale.
    const instanceType = {
        id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2,
        description: '1 CPU, 2 GiB', hourlyCost: 0.02,
    }
    const reportWithUsage = usage => ({
        sessions: [pendingSession({state: 'ACTIVE', instanceType: 'T3aSmall', apps: [], usage})],
        instanceTypes: [instanceType],
    })

    const fresh = api._internal.reportAsMap(reportWithUsage({
        cpuPct: 12.3, ramPct: 45.6, gpuPct: null, netBytesPerS: 1234,
        sampleTime: new Date('2026-07-01T11:59:30Z'),
    }), 'alice', true)
    expect(fresh.sessions[0].usage).toEqual({
        cpuPct: 12.3, ramPct: 45.6, gpuPct: null, netBytesPerS: 1234,
        sampleTime: '2026-07-01T11:59:30.000Z',
    })

    const stale = api._internal.reportAsMap(reportWithUsage({
        cpuPct: 12.3, ramPct: 45.6, gpuPct: null, sampleTime: new Date('2026-07-01T11:50:00Z'),
    }), 'alice', true)
    expect(stale.sessions[0].usage).toBeNull()

    const missing = api._internal.reportAsMap(reportWithUsage(null), 'alice', true)
    expect(missing.sessions[0].usage).toBeNull()
})

// ── app ↔ session association ────────────────────────────────────────────────

test('startServer ensures the endpoint server and answers 204, using currentUser (lowercased)', async () => {
    const c = ctx({params: {sessionId: 's1', endpoint: 'jupyter'}})
    await api.startServer(c)
    expect(sandboxServers.ensureServerStarted).toHaveBeenCalledWith({
        username: 'alice', sessionId: 's1', endpoint: 'jupyter'})
    expect(c.status).toBe(204)
})

test('associateApp → 201, uses currentUser (lowercased), passes sessionId/path/label', async () => {
    sessionManager.associateApp.mockResolvedValue({sessionId: 's1', path: '/sandbox/shiny/foo', label: 'Foo'})
    const c = ctx({params: {sessionId: 's1'}, request: {body: {path: '/sandbox/shiny/foo', label: 'Foo'}}})
    await api.associateApp(c)
    expect(sessionManager.associateApp).toHaveBeenCalledWith({
        username: 'alice', sessionId: 's1', appPath: '/sandbox/shiny/foo', label: 'Foo',
        clientId: undefined, reassert: false,
    })
    expect(c.status).toBe(201)
    expect(c.body).toEqual({sessionId: 's1', path: '/sandbox/shiny/foo', label: 'Foo'})
})

test('associateApp passes the owning clientId through', async () => {
    sessionManager.associateApp.mockResolvedValue({sessionId: 's1', path: '/sandbox/shiny/foo', label: 'Foo'})
    const c = ctx({params: {sessionId: 's1'}, request: {body: {path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-1'}}})
    await api.associateApp(c)
    expect(sessionManager.associateApp).toHaveBeenCalledWith(
        expect.objectContaining({clientId: 'c-1'}))
})

test('associateApp passes the reconnect re-assert flag through', async () => {
    sessionManager.associateApp.mockResolvedValue({sessionId: 's1', path: '/sandbox/shiny/foo', label: 'Foo'})
    const c = ctx({params: {sessionId: 's1'}, request: {body: {path: '/sandbox/shiny/foo', reassert: true}}})
    await api.associateApp(c)
    expect(sessionManager.associateApp).toHaveBeenCalledWith(
        expect.objectContaining({reassert: true}))
})

// Anything other than a literal true is a real open: a garbled body must err toward keeping the
// session alive, never toward silently dropping every ratchet.
test('associateApp treats a non-boolean reassert as a real open', async () => {
    sessionManager.associateApp.mockResolvedValue({sessionId: 's1', path: '/sandbox/shiny/foo', label: 'Foo'})
    const c = ctx({params: {sessionId: 's1'}, request: {body: {path: '/sandbox/shiny/foo', reassert: 'true'}}})
    await api.associateApp(c)
    expect(sessionManager.associateApp).toHaveBeenCalledWith(
        expect.objectContaining({reassert: false}))
})

test('associateApp → 400 when path missing', async () => {
    const c = ctx({params: {sessionId: 's1'}, request: {body: {}}})
    await api.associateApp(c)
    expect(c.status).toBe(400)
    expect(sessionManager.associateApp).not.toHaveBeenCalled()
})

test('dissociateApp → 204, uses currentUser (lowercased), passes the query path', async () => {
    sessionManager.dissociateApp.mockResolvedValue(true)
    const c = ctx({query: {path: '/sandbox/shiny/foo'}})
    await api.dissociateApp(c)
    expect(sessionManager.dissociateApp).toHaveBeenCalledWith({
        username: 'alice', appPath: '/sandbox/shiny/foo', requestingClientId: undefined,
    })
    expect(c.status).toBe(204)
})

test('dissociateApp passes the requesting clientId through (takeover attribution)', async () => {
    sessionManager.dissociateApp.mockResolvedValue(true)
    const c = ctx({query: {path: '/sandbox/shiny/foo', clientId: 'c-2'}})
    await api.dissociateApp(c)
    expect(sessionManager.dissociateApp).toHaveBeenCalledWith(
        expect.objectContaining({requestingClientId: 'c-2'}))
})

test('dissociateApp → 204 even when no association existed (idempotent)', async () => {
    sessionManager.dissociateApp.mockResolvedValue(false)
    const c = ctx({query: {path: '/sandbox/shiny/foo'}})
    await api.dissociateApp(c)
    expect(c.status).toBe(204)
})

test('dissociateApp → 400 when path missing', async () => {
    const c = ctx({query: {}})
    await api.dissociateApp(c)
    expect(c.status).toBe(400)
    expect(sessionManager.dissociateApp).not.toHaveBeenCalled()
})

test('appSessions → maps PENDING/ACTIVE to STARTING/ACTIVE, self user', async () => {
    sessionManager.userAppSessions.mockResolvedValue([
        {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's1', host: 'host-1', status: 'PENDING', instanceType: 'T3aSmall'},
        {path: '/sandbox/shiny/bar', label: 'Bar', sessionId: 's2', host: 'host-2', status: 'ACTIVE', instanceType: 'M6aLarge'},
    ])
    const c = ctx()
    await api.appSessions(c)
    expect(sessionManager.userAppSessions).toHaveBeenCalledWith('alice')
    expect(c.body).toEqual([
        {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's1', host: 'host-1', status: 'STARTING', instanceType: 'T3aSmall'},
        {path: '/sandbox/shiny/bar', label: 'Bar', sessionId: 's2', host: 'host-2', status: 'ACTIVE', instanceType: 'M6aLarge'},
    ])
})

test('serializes gpuCount on instance types', () => {
    const instanceType = {id: 'G5Xlarge', name: 'g5.xlarge', tag: 'g4', cpuCount: 4,
        ramGiB: 16, hourlyCost: 1.123, description: '4 CPU, 1 GPU, 16 GiB', gpuCount: 1}
    const report = {sessions: [], instanceTypes: [instanceType]}
    const map = api._internal.reportAsMap(report, 'bob', true)
    expect(map.instanceTypes[0].gpuCount).toBe(1)
})
