import assert from 'node:assert/strict'
import {beforeEach, describe, mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {instanceName} from '../instanceName.js'
import {createSessionsApi} from './sessionsApi.js'

const sessionManager = {
    generateUserSessionReport: mock.fn(),
    generateUserUsageReport: mock.fn(),
    mostRecentlyClosedSessionByUser: mock.fn(),
    mostRecentlyClosedSession: mock.fn(),
    requestSession: mock.fn(),
    heartbeat: mock.fn(),
    setSessionTimeoutHours: mock.fn(),
    manualExtension: mock.fn(),
    openExtension: mock.fn(),
    dismissExpiryNotification: mock.fn(),
    redeemExtension: mock.fn(),
    redeemTermination: mock.fn(),
    instanceDescription: mock.fn(),
    closeSession: mock.fn(),
    closeUserSessions: mock.fn(),
    findSessionByApiKey: mock.fn(),
    userWorkerSessions: mock.fn(),
    allOpenSessions: mock.fn(),
    associateApp: mock.fn(),
    dissociateApp: mock.fn(),
    userAppSessions: mock.fn(),
}

const sandboxServers = {ensureServerStarted: mock.fn()}

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

beforeEach(() => Object.values(sessionManager).forEach(fn => {
    fn.mock.resetCalls()
    fn.mock.mockImplementation(() => undefined)
}))

// ── request session ──────────────────────────────────────────────────────────

test('requestSessionSelf → 201, uses currentUser (lowercased), self path, STARTING status', async () => {
    sessionManager.requestSession.mock.mockImplementation(async () => pendingSession())
    const c = ctx({params: {instanceType: 'T3aSmall'}})
    await api.requestSessionSelf(c)
    assert.deepEqual(callsOf(sessionManager.requestSession), [[{
        instanceType: 'T3aSmall', workerType: 'sandbox', username: 'alice',
    }]])
    assert.equal(c.status, 201)
    assert.deepEqual(c.body, {
        id: 's1', path: 'sessions/session/s1', username: 'alice', status: 'STARTING', host: 'host-1',
    })
})

test('requestSessionSelf → 503 {code: INSTANCE_UNAVAILABLE} when the launch hits an AZ capacity error', async () => {
    sessionManager.requestSession.mock.mockImplementation(async () => {
        throw Object.assign(new Error('Insufficient capacity.'), {name: 'InsufficientInstanceCapacity'})
    })
    const c = ctx({params: {instanceType: 'T3aMedium'}})
    await api.requestSessionSelf(c)
    assert.equal(c.status, 503)
    assert.deepEqual(c.body, {code: 'INSTANCE_UNAVAILABLE', message: 'Insufficient capacity.'})
})

test('requestSessionSelf → 503 {code: QUOTA_EXCEEDED} when the account limit is hit', async () => {
    sessionManager.requestSession.mock.mockImplementation(async () => {
        throw Object.assign(new Error('vCPU limit exceeded.'), {name: 'VcpuLimitExceeded'})
    })
    const c = ctx({params: {instanceType: 'T3aMedium'}})
    await api.requestSessionSelf(c)
    assert.equal(c.status, 503)
    assert.deepEqual(c.body, {code: 'QUOTA_EXCEEDED', message: 'vCPU limit exceeded.'})
})

test('requestSessionSelf rethrows unclassified errors', async () => {
    sessionManager.requestSession.mock.mockImplementation(async () => {
        throw new Error('boom')
    })
    const c = ctx({params: {instanceType: 'T3aMedium'}})
    await assert.rejects(api.requestSessionSelf(c), /boom/)
})

test('requestSessionOther → uses path username, admin path form', async () => {
    sessionManager.requestSession.mock.mockImplementation(async () => pendingSession({username: 'bob', state: 'ACTIVE'}))
    const c = ctx({params: {username: 'Bob', instanceType: 'M6aLarge'}})
    await api.requestSessionOther(c)
    assert.deepEqual(callsOf(sessionManager.requestSession), [[{
        instanceType: 'M6aLarge', workerType: 'sandbox', username: 'bob',
    }]])
    assert.equal(c.status, 201)
    assert.deepEqual(c.body, {
        id: 's1', path: 'sessions/bob/session/s1', username: 'bob', status: 'ACTIVE', host: 'host-1',
    })
})

// ── heartbeat ──────────────────────────────────────────────────────────────────

test('heartbeatSelf → currentUser, sessionId, self path', async () => {
    sessionManager.heartbeat.mock.mockImplementation(async () => pendingSession({state: 'ACTIVE'}))
    const c = ctx({params: {sessionId: 's1'}})
    await api.heartbeatSelf(c)
    assert.deepEqual(
        callsOf(sessionManager.heartbeat),
        [[{sessionId: 's1', username: 'alice', interaction: false}]]
    )
    assert.deepEqual(c.body, {
        id: 's1', path: 'sessions/session/s1', username: 'alice', status: 'ACTIVE', host: 'host-1',
    })
})

test('heartbeatOther → path username', async () => {
    sessionManager.heartbeat.mock.mockImplementation(async () => pendingSession({username: 'bob'}))
    const c = ctx({params: {username: 'bob', sessionId: 's1'}})
    await api.heartbeatOther(c)
    assert.deepEqual(
        callsOf(sessionManager.heartbeat),
        [[{sessionId: 's1', username: 'bob', interaction: false}]]
    )
    assert.equal(c.body.path, 'sessions/bob/session/s1')
})

test('heartbeat forwards interaction: true only for an exact boolean true body flag', async () => {
    sessionManager.heartbeat.mock.mockImplementation(async () => pendingSession())
    await api.heartbeatSelf(ctx({params: {sessionId: 's1'}, request: {body: {interaction: true}}}))
    assert.deepEqual(
        callsOf(sessionManager.heartbeat).at(-1),
        [{sessionId: 's1', username: 'alice', interaction: true}]
    )
    await api.heartbeatSelf(ctx({params: {sessionId: 's1'}, request: {body: {interaction: 'yes'}}}))
    assert.deepEqual(
        callsOf(sessionManager.heartbeat).at(-1),
        [{sessionId: 's1', username: 'alice', interaction: false}]
    )
})

// A bare beat is what the gateway sends for every cached session regardless of use. Reading it as
// liveness is the failure this design removes, so it must reach the worker as interaction: false.
test('a bodiless heartbeat is not an interaction', async () => {
    sessionManager.heartbeat.mock.mockImplementation(async () => pendingSession())
    await api.heartbeatSelf(ctx({params: {sessionId: 's1'}, request: {}}))
    assert.deepEqual(
        callsOf(sessionManager.heartbeat).at(-1),
        [{sessionId: 's1', username: 'alice', interaction: false}]
    )
})

// ── deadline extension ───────────────────────────────────────────────────────

test('extendSession → 204, ratchets by the requested hours, self user', async () => {
    const c = ctx({params: {sessionId: 's1'}, query: {hours: '2'}})
    await api.setKeepAlive(c)
    assert.equal(c.status, 204)
    assert.deepEqual(
        callsOf(sessionManager.setSessionTimeoutHours),
        [[{sessionId: 's1', hours: 2, username: 'alice'}]]
    )
})

test('extendSession → 400 when hours missing', async () => {
    const c = ctx({params: {sessionId: 's1'}, query: {}})
    await api.setKeepAlive(c)
    assert.equal(c.status, 400)
    assert.equal(sessionManager.setSessionTimeoutHours.mock.callCount(), 0)
})

// One-shots are acknowledged rather than fire-and-forget: a button that appears to work while
// doing nothing is the worst available outcome.
test('the Extend button reports whether the extension landed', async () => {
    sessionManager.manualExtension.mock.mockImplementation(async () => true)
    const extended = ctx({params: {sessionId: 's1'}})
    await api.extendNow(extended)
    assert.equal(extended.status, 200)
    assert.deepEqual(extended.body, {extended: true})

    sessionManager.manualExtension.mock.mockImplementation(async () => false)
    const gone = ctx({params: {sessionId: 's1'}})
    await api.extendNow(gone)
    assert.equal(gone.status, 409)
})

test('the terminal-opened one-shot reports the same way', async () => {
    sessionManager.openExtension.mock.mockImplementation(async () => true)
    const c = ctx({params: {sessionId: 's1'}})
    await api.openExtension(c)
    assert.deepEqual(
        callsOf(sessionManager.openExtension),
        [[{sessionId: 's1', username: 'alice'}]]
    )
    assert.equal(c.status, 200)
})

test('dismiss → 204, and does not extend', async () => {
    const c = ctx({params: {sessionId: 's1'}})
    await api.dismissExpiry(c)
    assert.equal(c.status, 204)
    assert.deepEqual(
        callsOf(sessionManager.dismissExpiryNotification),
        [[{sessionId: 's1', username: 'alice'}]]
    )
    assert.equal(sessionManager.setSessionTimeoutHours.mock.callCount(), 0)
})

// ── the email management link ────────────────────────────────────────────────

describe('the email management link', () => {
    const tokens = {verify: mock.fn()}
    const tokenApi = createSessionsApi({
        sessionManager, clock: fixedClock,
        expiryPolicy: {...expiryPolicy, emailExtensionMinutes: 60},
        expiryTokens: tokens,
    })

    const claim = (notifiedTime = new Date()) => ({sessionId: 's1', notifiedTime})
    const post = (token, action) => ctx({params: {token}, request: {body: action ? {action} : {}}})

    beforeEach(() => {
        tokens.verify.mock.resetCalls()
        tokens.verify.mock.mockImplementation(() => undefined)
        sessionManager.instanceDescription.mock.resetCalls()
        sessionManager.instanceDescription.mock.mockImplementation(async () => ({
            name: 'jazzy-anchor',
            ordinal: 1,
            typeName: 't3a.small',
            hourlyCost: 0.02
        }))
    })

    // ONE link in the mail, both choices on the page it opens.
    test('GET renders both buttons and mutates NOTHING', async () => {
        tokens.verify.mock.mockImplementation(() => claim())
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        assert.equal(c.type, 'html')
        assert.ok(c.body.includes('Keep it running'))
        assert.ok(c.body.includes('Terminate now'))
        assert.equal(sessionManager.redeemExtension.mock.callCount(), 0)
        assert.equal(sessionManager.redeemTermination.mock.callCount(), 0)
    })

    // Mail-client link scanners, URL-rewriting proxies and preview fetchers all fire the GET, so
    // the page it renders is the ONLY thing a GET may do.
    // A user with two instances must be able to tell WHICH one this page is about, named the same
    // way the notification, the mail and the SSH menu name it.
    test('the page names the instance, its type and what it costs', async () => {
        tokens.verify.mock.mockImplementation(() => claim())
        sessionManager.instanceDescription.mock.mockImplementation(async () => ({
            name: 'crazy-banana',
            ordinal: 2,
            typeName: 't3a.small',
            hourlyCost: 0.0204
        }))
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        assert.deepEqual(callsOf(sessionManager.instanceDescription), [['s1']])
        assert.ok(c.body.includes('Instance <b>crazy-banana</b> (t3a.small, $0.02/h)'))
        assert.ok(!c.body.includes('Instance 2'))
    })

    test('a type with no known cost is named without a price', async () => {
        tokens.verify.mock.mockImplementation(() => claim())
        sessionManager.instanceDescription.mock.mockImplementation(async () => ({
            name: 'crazy-banana',
            ordinal: 1,
            typeName: 't3a.small',
            hourlyCost: null
        }))
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        assert.ok(c.body.includes('Instance <b>crazy-banana</b> (t3a.small)'))
    })

    test('an instance with no derivable name is still named, not left blank', async () => {
        tokens.verify.mock.mockImplementation(() => claim())
        sessionManager.instanceDescription.mock.mockImplementation(async () => ({
            name: null,
            ordinal: null,
            typeName: null
        }))
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        assert.ok(c.body.includes('One of your instances'))
    })

    // The ordinal is a position among OPEN sessions, so it must be read before the close or the
    // result page would name whichever instance inherited the number.
    test('the terminated page names the instance as it was BEFORE the close', async () => {
        tokens.verify.mock.mockImplementation(() => claim())
        sessionManager.instanceDescription.mock.mockImplementation(async () => ({
            name: 'crazy-banana',
            ordinal: 2,
            typeName: 't3a.small',
            hourlyCost: 0.02
        }))
        sessionManager.redeemTermination.mock.mockImplementation(async () => {
            sessionManager.instanceDescription.mock.mockImplementation(async () => ({
                name: null,
                ordinal: null,
                typeName: null
            }))
            return true
        })
        const c = post('tok', 'terminate')
        await tokenApi.redeemExpiryToken(c)
        assert.ok(c.body.includes('crazy-banana'))
    })

    // The page is the notification, for someone who is not looking at SEPAL — so it uses the
    // notification's own words and its own colours, not a second vocabulary for the same choice.
    test('the buttons carry the in-app notification labels', async () => {
        tokens.verify.mock.mockImplementation(() => claim())
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        assert.ok(c.body.includes('Keep it running 60 min'))
        assert.ok(c.body.includes('Terminate now'))
    })

    test('the terminate button is the notification\'s red', async () => {
        tokens.verify.mock.mockImplementation(() => claim())
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        assert.match(c.body, /hsl\(0, ?45%, ?33%\)/)
    })

    test('GET of a spent or expired token says so instead of erroring', async () => {
        tokens.verify.mock.mockImplementation(() => null)
        const c = ctx({params: {token: 'tok'}})
        await tokenApi.expiryPage(c)
        assert.ok(c.body.includes('no longer valid'))
    })

    test('POST extend runs the extension and nothing else', async () => {
        const notifiedTime = new Date('2026-07-01T11:00:00Z')
        tokens.verify.mock.mockImplementation(() => claim(notifiedTime))
        sessionManager.redeemExtension.mock.mockImplementation(async () => true)
        const c = post('tok', 'extend')
        await tokenApi.redeemExpiryToken(c)
        assert.deepEqual(
            callsOf(sessionManager.redeemExtension),
            [[{sessionId: 's1', notifiedTime}]]
        )
        assert.equal(sessionManager.redeemTermination.mock.callCount(), 0)
        assert.ok(c.body.includes('keep running'))
    })

    test('POST terminate runs the termination and nothing else', async () => {
        const notifiedTime = new Date('2026-07-01T11:00:00Z')
        tokens.verify.mock.mockImplementation(() => claim(notifiedTime))
        sessionManager.redeemTermination.mock.mockImplementation(async () => true)
        const c = post('tok', 'terminate')
        await tokenApi.redeemExpiryToken(c)
        assert.deepEqual(
            callsOf(sessionManager.redeemTermination),
            [[{sessionId: 's1', notifiedTime}]]
        )
        assert.equal(sessionManager.redeemExtension.mock.callCount(), 0)
        assert.ok(c.body.includes('stopped'))
    })

    // A POST naming no action, or one this server does not implement, must do NOTHING — guessing
    // would eventually guess `terminate` for someone who never asked for it.
    for (const [name, action] of [['no action', undefined], ['an unknown action', 'reboot']]) {
        test(
            `POST with ${name} acts on neither and re-offers the choice`,
            async () => {
                tokens.verify.mock.mockImplementation(() => claim())
                const c = post('tok', action)
                await tokenApi.redeemExpiryToken(c)
                assert.equal(sessionManager.redeemExtension.mock.callCount(), 0)
                assert.equal(sessionManager.redeemTermination.mock.callCount(), 0)
                assert.equal(c.status, 400)
                assert.ok(c.body.includes('Keep it running'))
                assert.ok(c.body.includes('Terminate now'))
            }
        )
    }

    // Someone clicked a link in an email and needs to be told what happened.
    for (const [action, method] of [
        ['extend', 'redeemExtension'],
        ['terminate', 'redeemTermination'],
    ]) {
        test(
            `POST of an already-spent token (${action}) explains rather than erroring`,
            async () => {
                tokens.verify.mock.mockImplementation(() => claim())
                sessionManager[method].mock.mockImplementation(async () => false)
                const c = post('tok', action)
                await tokenApi.redeemExpiryToken(c)
                assert.ok(c.body.includes('no longer valid'))
            }
        )
    }

    test('POST of a malformed token is 410, not 500', async () => {
        tokens.verify.mock.mockImplementation(() => null)
        const c = post('nope', 'extend')
        await tokenApi.redeemExpiryToken(c)
        assert.equal(c.status, 410)
    })
})

// ── close ────────────────────────────────────────────────────────────────────

test('closeSessionSelf → 204 with {status: OK}, self user', async () => {
    const c = ctx({params: {sessionId: 's1'}})
    await api.closeSessionSelf(c)
    assert.deepEqual(
        callsOf(sessionManager.closeSession),
        [[{sessionId: 's1', username: 'alice'}]]
    )
    assert.equal(c.status, 204)
    assert.deepEqual(c.body, {status: 'OK'})
})

test('closeSessionOther → path username, 204', async () => {
    const c = ctx({params: {username: 'bob', sessionId: 's1'}})
    await api.closeSessionOther(c)
    assert.deepEqual(
        callsOf(sessionManager.closeSession),
        [[{sessionId: 's1', username: 'bob'}]]
    )
    assert.equal(c.status, 204)
})

test('closeUserSessions → path username, 204', async () => {
    const c = ctx({params: {username: 'Bob'}})
    await api.closeUserSessions(c)
    assert.deepEqual(callsOf(sessionManager.closeUserSessions), [['bob']])
    assert.equal(c.status, 204)
})

// ── active/pending sandbox sessions (gateway cache-miss fallback) ──────────────

test('activeSessions → queries self (lowercased) for PENDING+ACTIVE SANDBOX sessions', async () => {
    sessionManager.userWorkerSessions.mock.mockImplementation(async () => [])
    const c = ctx()
    await api.activeSessions(c)
    assert.deepEqual(callsOf(sessionManager.userWorkerSessions), [[{
        username: 'alice',
        states: ['PENDING', 'ACTIVE'],
        workerType: 'sandbox',
    }]])
})

test('activeSessions → maps to [{id, host, status, instanceType}] with STARTING/ACTIVE mapping', async () => {
    sessionManager.userWorkerSessions.mock.mockImplementation(async () => [
        pendingSession({id: 's1', state: 'ACTIVE', instanceType: 'T3aSmall', instance: {id: 'i1', host: 'host-1'}}),
        pendingSession({id: 's2', state: 'PENDING', instanceType: 'M6aLarge', instance: {id: 'i2', host: 'host-2'}}),
    ])
    const c = ctx()
    await api.activeSessions(c)
    assert.deepEqual(c.body, [
        {id: 's1', host: 'host-1', status: 'ACTIVE', instanceType: 'T3aSmall'},
        {id: 's2', host: 'host-2', status: 'STARTING', instanceType: 'M6aLarge'},
    ])
})

test('activeSessions → empty array when the user has no pending/active sandbox session', async () => {
    sessionManager.userWorkerSessions.mock.mockImplementation(async () => [])
    const c = ctx()
    await api.activeSessions(c)
    assert.deepEqual(c.body, [])
})

// CLOSED and non-SANDBOX sessions are filtered out by the query (states=[PENDING,ACTIVE],
// workerType=SANDBOX); the handler must not widen that filter.
test('activeSessions → filter args exclude CLOSED and non-SANDBOX at the query', async () => {
    sessionManager.userWorkerSessions.mock.mockImplementation(async () => [])
    const c = ctx()
    await api.activeSessions(c)
    const {states, workerType} = sessionManager.userWorkerSessions.mock.calls[0].arguments[0]
    assert.deepEqual(states, ['PENDING', 'ACTIVE'])
    assert.ok(!states.includes('CLOSED'))
    assert.equal(workerType, 'sandbox')
})

// Only the current user's sessions: the query is scoped to currentUser.username, never a path param.
test('activeSessions → scoped to the current user, ignores any :username path param', async () => {
    sessionManager.userWorkerSessions.mock.mockImplementation(async () => [])
    const c = ctx({params: {username: 'bob'}})
    await api.activeSessions(c)
    assert.partialDeepStrictEqual(callsOf(sessionManager.userWorkerSessions), [[{username: 'alice'}]])
})

// ── all open sessions (admin; budget seed/reconciler) ──────────────────────────

test('openSessions → passes through sessionManager.allOpenSessions(), unscoped by currentUser', async () => {
    const openList = [
        {username: 'alice', sessionId: 's1', instanceType: 'T3aSmall', creationTime: '2026-07-01T10:00:00'},
        {username: 'bob', sessionId: 's2', instanceType: 'M6aLarge', creationTime: '2026-07-01T11:00:00'},
    ]
    sessionManager.allOpenSessions.mock.mockImplementation(async () => openList)
    const c = ctx()
    await api.openSessions(c)
    assert.deepEqual(callsOf(sessionManager.allOpenSessions), [[]])
    assert.equal(c.body, openList)
})

// ── mostRecentlyClosed ────────────────────────────────────────────────────────

test('mostRecentlyClosedByUser → passes through repo map', async () => {
    sessionManager.mostRecentlyClosedSessionByUser.mock.mockImplementation(async () => ({
        bob: '2026-01-01'
    }))
    const c = ctx()
    await api.mostRecentlyClosedByUser(c)
    assert.deepEqual(c.body, {bob: '2026-01-01'})
})

test('mostRecentlyClosed → uses query username (route has no :username path segment)', async () => {
    sessionManager.mostRecentlyClosedSession.mock.mockImplementation(async () => ({
        timestamp: 'x'
    }))
    const c = ctx({query: {username: 'Bob'}})
    await api.mostRecentlyClosed(c)
    // The handler passes the raw query username; sessionManager lowercases internally.
    assert.deepEqual(callsOf(sessionManager.mostRecentlyClosedSession), [['Bob']])
    assert.deepEqual(c.body, {timestamp: 'x'})
})

test('mostRecentlyClosed → 400 when username missing', async () => {
    const c = ctx({query: {}})
    await api.mostRecentlyClosed(c)
    assert.equal(c.status, 400)
    assert.equal(sessionManager.mostRecentlyClosedSession.mock.callCount(), 0)
})

// ── api-key authenticate ────────────────────────────────────────────────────

test('apiKeyAuthenticate → 200 with the user and the session the key belongs to', async () => {
    sessionManager.findSessionByApiKey.mock.mockImplementation(async () => ({
        sessionId: 's-1',
        username: 'bob',
        workerType: 'sandbox'
    }))
    const c = ctx({request: {body: {apiKey: 'k'}}})
    await api.apiKeyAuthenticate(c)
    assert.deepEqual(callsOf(sessionManager.findSessionByApiKey), [['k']])
    assert.deepEqual(c.body, {username: 'bob', sessionId: 's-1', workerType: 'sandbox'})
})

test('apiKeyAuthenticate → 401 {} when not found', async () => {
    sessionManager.findSessionByApiKey.mock.mockImplementation(async () => null)
    const c = ctx({request: {body: {apiKey: 'k'}}})
    await api.apiKeyAuthenticate(c)
    assert.equal(c.status, 401)
    assert.deepEqual(c.body, {})
})

test('apiKeyAuthenticate → 400 when apiKey missing', async () => {
    const c = ctx({request: {body: {}}})
    await api.apiKeyAuthenticate(c)
    assert.equal(c.status, 400)
    assert.equal(sessionManager.findSessionByApiKey.mock.callCount(), 0)
})

test('apiKeyAuthenticate → reads apiKey from query too', async () => {
    sessionManager.findSessionByApiKey.mock.mockImplementation(async () => ({
        sessionId: 's-1',
        username: 'bob',
        workerType: 'sandbox'
    }))
    const c = ctx({request: {body: {}}, query: {apiKey: 'qk'}})
    await api.apiKeyAuthenticate(c)
    assert.deepEqual(callsOf(sessionManager.findSessionByApiKey), [['qk']])
})

// ── report serialization ──────────────────────────────────────────────────────

test('generateReportSelf → full report map with session + instanceType', async () => {
    const instanceType = {
        id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2, performance: 1,
        description: '1 CPU, 2 GB', hourlyCost: 0.02,
    }
    sessionManager.generateUserSessionReport.mock.mockImplementation(async () => ({
        sessions: [pendingSession({
            state: 'ACTIVE',
            instanceType: 'T3aSmall',
            creationTime: new Date('2026-07-01T10:00:00.000Z'),
        })],

        instanceTypes: [instanceType]
    }))
    const c = ctx()
    await api.generateReportSelf(c)
    assert.deepEqual(callsOf(sessionManager.generateUserSessionReport), [[{
        username: 'alice', workerType: 'sandbox',
    }]])
    const s = c.body.sessions[0]
    assert.deepEqual(s, {
        id: 's1',
        name: instanceName('s1'),
        sshLogin: `alice+${instanceName('s1')}`,
        path: 'sessions/session/s1',
        username: 'alice',
        status: 'ACTIVE',
        host: 'host-1',
        timeoutHours: 0,
        instanceType: {
            id: 'T3aSmall', path: 'sessions/instance-type/T3aSmall', name: 't3a.small',
            tag: 't1', cpuCount: 1, ramGiB: 2, gpuCount: 0, ssdGB: 0, performance: 1, description: '1 CPU, 2 GB', hourlyCost: 0.02,
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
    assert.equal(c.body.instanceTypes[0].path, 'sessions/instance-type/T3aSmall')
    // spending is NOT part of the report anymore — it is pushed by the budget module's ws
    assert.ok(!('spending' in Object(c.body)))
    assert.ok(!('budgetUpdateRequest' in Object(c.body)))
})

// A creationTime without a timezone designator is parsed by the browser as LOCAL time, so the GUI
// would render the UTC wall clock and compute a "time ago" off by the viewer's UTC offset.
test('creationTime carries the instant, not a bare wall clock', async () => {
    sessionManager.generateUserSessionReport.mock.mockImplementation(async () => ({
        sessions: [pendingSession({
            instanceType: 'T3aSmall',
            creationTime: new Date('2026-07-01T10:00:00.000Z'),
        })],

        instanceTypes: [{id: 'T3aSmall', hourlyCost: 0.02}]
    }))
    const c = ctx()
    await api.generateReportSelf(c)
    const {creationTime} = c.body.sessions[0]
    assert.match(creationTime, /Z$/)
    assert.equal(Date.parse(creationTime), Date.parse('2026-07-01T10:00:00.000Z'))
})

test('generateReportOther → admin path form in session + instanceType', async () => {
    const instanceType = {
        id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2,
        description: '1 CPU, 2 GB', hourlyCost: 0.02,
    }
    sessionManager.generateUserSessionReport.mock.mockImplementation(async () => ({
        sessions: [pendingSession({username: 'bob', instanceType: 'T3aSmall'})],
        instanceTypes: [instanceType]
    }))
    const c = ctx({params: {username: 'Bob'}})
    await api.generateReportOther(c)
    assert.deepEqual(callsOf(sessionManager.generateUserSessionReport), [[{
        username: 'bob', workerType: 'sandbox',
    }]])
    assert.equal(c.body.sessions[0].path, 'sessions/bob/session/s1')
    assert.equal(
        c.body.sessions[0].instanceType.path,
        'sessions/bob/instance-type/T3aSmall'
    )
    assert.equal(c.body.sessions[0].status, 'STARTING')
})

test('report sessions include their associated apps', () => {
    const instanceType = {
        id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2,
        description: '1 CPU, 2 GB', hourlyCost: 0.02,
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
    assert.deepEqual(map.sessions[0].apps, [{path: '/sandbox/shiny/foo', label: 'Foo'}])
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
    assert.equal(map.sessions[0].terminals, 2)
    assert.equal(map.sessions[0].verdict, 'busy')
})

// A session the sampler has not reached yet has no verdict, and 'unused' is the one word that must
// never be guessed: it is what tells a user their instance is about to be stopped.
test('an unsampled session reports no terminals and an unknown verdict', () => {
    const report = {
        sessions: [pendingSession({state: 'ACTIVE', instanceType: 'T3aSmall', apps: []})],
        instanceTypes: [{id: 'T3aSmall', name: 't3a.small', hourlyCost: 0.02}],
    }
    const map = api._internal.reportAsMap(report, 'alice', true)
    assert.equal(map.sessions[0].terminals, 0)
    assert.equal(map.sessions[0].verdict, 'unknown')
})

const notifiedReport = () => ({
    sessions: [pendingSession({
        state: 'ACTIVE', instanceType: 'T3aSmall', apps: [],
        notificationState: 'NOTIFIED', notifiedTime: new Date('2026-08-02T11:00:00Z'),
        timeoutTime: new Date('2026-08-02T10:55:00Z'),
    })],
    instanceTypes: [{
        id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2,
        description: '1 CPU, 2 GB', hourlyCost: 0.02,
    }],
})

// The GUI session list names instances the same way the notification, the mail and the SSH menu
// do, so it needs the name on every row rather than deriving its own.
test('every session in the report carries its derived name', () => {
    const map = api._internal.reportAsMap(notifiedReport(), 'alice', true)
    assert.equal(map.sessions[0].name, instanceName(map.sessions[0].id))
})

// What goes after `ssh`: the user, the instance to route to, and the gateway's own address.
test('every session carries the ssh login that reaches it', () => {
    const withSshHost = createSessionsApi({sessionManager, clock: fixedClock, expiryPolicy, sshHost: 'ssh.sepal.io'})
    const [session] = withSshHost._internal.reportAsMap(notifiedReport(), 'alice', true).sessions
    assert.equal(session.sshLogin, `alice+${session.name}@ssh.sepal.io`)
})

// The web address is not the gateway's, so without a configured one there is no host to give.
test('the ssh login has no host when the gateway address is not configured', () => {
    const [session] = api._internal.reportAsMap(notifiedReport(), 'alice', true).sessions
    assert.equal(session.sshLogin, `alice+${session.name}`)
})

test('serializes the expiry cycle state and the stored deadline', () => {
    const map = api._internal.reportAsMap(notifiedReport(), 'alice', true)
    assert.deepEqual(map.sessions[0].expiry, {
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
    assert.equal(map.sessions[0].expiry.closeTime, '2026-08-02T12:00:00.000Z')
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
    assert.ok(future.sessions[0].timeoutHours > 1.9)

    const past = api._internal.reportAsMap(notifiedReport(), 'alice', true)
    assert.equal(past.sessions[0].timeoutHours, 0)
})

test('userUsageOther → admin path user (lowercased), default days 30, body passthrough', async () => {
    sessionManager.generateUserUsageReport.mock.mockImplementation(async () => ({
        days: 30,
        overall: null,
        byInstanceType: []
    }))
    const c = ctx({params: {username: 'Bob'}})
    await api.userUsageOther(c)
    assert.deepEqual(
        callsOf(sessionManager.generateUserUsageReport),
        [[{username: 'bob', days: 30}]]
    )
    assert.deepEqual(c.body, {days: 30, overall: null, byInstanceType: []})
})

test('userUsageSelf → currentUser (lowercased), never a path param', async () => {
    sessionManager.generateUserUsageReport.mock.mockImplementation(async () => ({
        days: 30,
        overall: null,
        byInstanceType: []
    }))
    await api.userUsageSelf(ctx({params: {username: 'bob'}}))
    assert.deepEqual(
        callsOf(sessionManager.generateUserUsageReport),
        [[{username: 'alice', days: 30}]]
    )
})

test('userUsage → days parsed and clamped to 1..365', async () => {
    sessionManager.generateUserUsageReport.mock.mockImplementation(async () => ({}))
    await api.userUsageOther(ctx({params: {username: 'bob'}, query: {days: '90'}}))
    assert.deepEqual(
        callsOf(sessionManager.generateUserUsageReport).at(-1),
        [{username: 'bob', days: 90}]
    )
    await api.userUsageOther(ctx({params: {username: 'bob'}, query: {days: '9999'}}))
    assert.deepEqual(
        callsOf(sessionManager.generateUserUsageReport).at(-1),
        [{username: 'bob', days: 365}]
    )
    await api.userUsageOther(ctx({params: {username: 'bob'}, query: {days: '0'}}))
    assert.deepEqual(
        callsOf(sessionManager.generateUserUsageReport).at(-1),
        [{username: 'bob', days: 1}]
    )
    await api.userUsageOther(ctx({params: {username: 'bob'}, query: {days: 'nope'}}))
    assert.deepEqual(
        callsOf(sessionManager.generateUserUsageReport).at(-1),
        [{username: 'bob', days: 30}]
    )
})

test('serializes fresh usage and nulls stale or missing usage', () => {
    // The module-level api's clock is fixed at 2026-07-01T12:00:00Z; usage older than 5 minutes
    // is stale.
    const instanceType = {
        id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2,
        description: '1 CPU, 2 GB', hourlyCost: 0.02,
    }
    const reportWithUsage = usage => ({
        sessions: [pendingSession({state: 'ACTIVE', instanceType: 'T3aSmall', apps: [], usage})],
        instanceTypes: [instanceType],
    })

    const fresh = api._internal.reportAsMap(reportWithUsage({
        cpuPct: 12.3, ramPct: 45.6, gpuPct: null, netBytesPerS: 1234,
        sampleTime: new Date('2026-07-01T11:59:30Z'),
    }), 'alice', true)
    assert.deepEqual(fresh.sessions[0].usage, {
        cpuPct: 12.3, ramPct: 45.6, gpuPct: null, netBytesPerS: 1234,
        sampleTime: '2026-07-01T11:59:30.000Z',
    })

    const stale = api._internal.reportAsMap(reportWithUsage({
        cpuPct: 12.3, ramPct: 45.6, gpuPct: null, sampleTime: new Date('2026-07-01T11:50:00Z'),
    }), 'alice', true)
    assert.equal(stale.sessions[0].usage, null)

    const missing = api._internal.reportAsMap(reportWithUsage(null), 'alice', true)
    assert.equal(missing.sessions[0].usage, null)
})

// ── app ↔ session association ────────────────────────────────────────────────

test('startServer ensures the endpoint server and answers 204, using currentUser (lowercased)', async () => {
    const c = ctx({params: {sessionId: 's1', endpoint: 'jupyter'}})
    await api.startServer(c)
    assert.deepEqual(callsOf(sandboxServers.ensureServerStarted), [[{
        username: 'alice', sessionId: 's1', endpoint: 'jupyter'}]])
    assert.equal(c.status, 204)
})

test('associateApp → 201, uses currentUser (lowercased), passes sessionId/path/label', async () => {
    sessionManager.associateApp.mock.mockImplementation(async () => ({
        sessionId: 's1',
        path: '/sandbox/shiny/foo',
        label: 'Foo'
    }))
    const c = ctx({params: {sessionId: 's1'}, request: {body: {path: '/sandbox/shiny/foo', label: 'Foo'}}})
    await api.associateApp(c)
    assert.deepEqual(callsOf(sessionManager.associateApp), [[{
        username: 'alice', sessionId: 's1', appPath: '/sandbox/shiny/foo', label: 'Foo',
        clientId: undefined, reassert: false,
    }]])
    assert.equal(c.status, 201)
    assert.deepEqual(c.body, {sessionId: 's1', path: '/sandbox/shiny/foo', label: 'Foo'})
})

test('associateApp passes the owning clientId through', async () => {
    sessionManager.associateApp.mock.mockImplementation(async () => ({
        sessionId: 's1',
        path: '/sandbox/shiny/foo',
        label: 'Foo'
    }))
    const c = ctx({params: {sessionId: 's1'}, request: {body: {path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-1'}}})
    await api.associateApp(c)
    assert.partialDeepStrictEqual(callsOf(sessionManager.associateApp), [[{clientId: 'c-1'}]])
})

test('associateApp passes the reconnect re-assert flag through', async () => {
    sessionManager.associateApp.mock.mockImplementation(async () => ({
        sessionId: 's1',
        path: '/sandbox/shiny/foo',
        label: 'Foo'
    }))
    const c = ctx({params: {sessionId: 's1'}, request: {body: {path: '/sandbox/shiny/foo', reassert: true}}})
    await api.associateApp(c)
    assert.partialDeepStrictEqual(callsOf(sessionManager.associateApp), [[{reassert: true}]])
})

// Anything other than a literal true is a real open: a garbled body must err toward keeping the
// session alive, never toward silently dropping every ratchet.
test('associateApp treats a non-boolean reassert as a real open', async () => {
    sessionManager.associateApp.mock.mockImplementation(async () => ({
        sessionId: 's1',
        path: '/sandbox/shiny/foo',
        label: 'Foo'
    }))
    const c = ctx({params: {sessionId: 's1'}, request: {body: {path: '/sandbox/shiny/foo', reassert: 'true'}}})
    await api.associateApp(c)
    assert.partialDeepStrictEqual(callsOf(sessionManager.associateApp), [[{reassert: false}]])
})

test('associateApp → 400 when path missing', async () => {
    const c = ctx({params: {sessionId: 's1'}, request: {body: {}}})
    await api.associateApp(c)
    assert.equal(c.status, 400)
    assert.equal(sessionManager.associateApp.mock.callCount(), 0)
})

test('dissociateApp → 204, uses currentUser (lowercased), passes the query path', async () => {
    sessionManager.dissociateApp.mock.mockImplementation(async () => true)
    const c = ctx({query: {path: '/sandbox/shiny/foo'}})
    await api.dissociateApp(c)
    assert.deepEqual(callsOf(sessionManager.dissociateApp), [[{
        username: 'alice', appPath: '/sandbox/shiny/foo', requestingClientId: undefined,
    }]])
    assert.equal(c.status, 204)
})

test('dissociateApp passes the requesting clientId through (takeover attribution)', async () => {
    sessionManager.dissociateApp.mock.mockImplementation(async () => true)
    const c = ctx({query: {path: '/sandbox/shiny/foo', clientId: 'c-2'}})
    await api.dissociateApp(c)
    assert.partialDeepStrictEqual(callsOf(sessionManager.dissociateApp), [[{requestingClientId: 'c-2'}]])
})

test('dissociateApp → 204 even when no association existed (idempotent)', async () => {
    sessionManager.dissociateApp.mock.mockImplementation(async () => false)
    const c = ctx({query: {path: '/sandbox/shiny/foo'}})
    await api.dissociateApp(c)
    assert.equal(c.status, 204)
})

test('dissociateApp → 400 when path missing', async () => {
    const c = ctx({query: {}})
    await api.dissociateApp(c)
    assert.equal(c.status, 400)
    assert.equal(sessionManager.dissociateApp.mock.callCount(), 0)
})

test('appSessions → maps PENDING/ACTIVE to STARTING/ACTIVE, self user', async () => {
    sessionManager.userAppSessions.mock.mockImplementation(async () => [
        {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's1', host: 'host-1', status: 'PENDING', instanceType: 'T3aSmall'},
        {path: '/sandbox/shiny/bar', label: 'Bar', sessionId: 's2', host: 'host-2', status: 'ACTIVE', instanceType: 'M6aLarge'},
    ])
    const c = ctx()
    await api.appSessions(c)
    assert.deepEqual(callsOf(sessionManager.userAppSessions), [['alice']])
    assert.deepEqual(c.body, [
        {path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's1', host: 'host-1', status: 'STARTING', instanceType: 'T3aSmall'},
        {path: '/sandbox/shiny/bar', label: 'Bar', sessionId: 's2', host: 'host-2', status: 'ACTIVE', instanceType: 'M6aLarge'},
    ])
})

test('serializes gpuCount on instance types', () => {
    const instanceType = {id: 'G5Xlarge', name: 'g5.xlarge', tag: 'g4', cpuCount: 4,
        ramGiB: 16, hourlyCost: 1.123, description: '4 CPU, 1 GPU, 16 GB', gpuCount: 1}
    const report = {sessions: [], instanceTypes: [instanceType]}
    const map = api._internal.reportAsMap(report, 'bob', true)
    assert.equal(map.instanceTypes[0].gpuCount, 1)
})

test('serializes the local SSD capacity and relative performance of instance types', () => {
    const instanceType = {id: 'R8idXlarge', name: 'r8id.xlarge', tag: 'r4d', cpuCount: 4,
        ramGiB: 32, hourlyCost: 0.3696, description: '4 CPU, 32 GB', ssdGB: 237, performance: 4.3}
    const report = {sessions: [], instanceTypes: [instanceType]}
    const map = api._internal.reportAsMap(report, 'bob', true)
    assert.partialDeepStrictEqual(map.instanceTypes[0], {ssdGB: 237, performance: 4.3})
})
