import assert from 'node:assert/strict'
import {describe, it, mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {createSandboxSessionManager, PORT_BY_ENDPOINT, toClientStatus} from './sandboxSessionManager.js'

const noopLog = {
    info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {},
    isTrace: () => false, isDebug: () => false
}

const jsonResponse = (body, {ok = true, status = 200} = {}) => ({
    ok,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body))
})

const errorResponse = status => ({
    ok: false,
    status,
    text: async () => ''
})

// The bodies of the heartbeat POSTs, in order — `undefined` is a bare beat, which extends nothing.
const heartbeatBodies = fetch => callsOf(fetch)
    .filter(([url, options]) => url.includes('/session/') && options?.method === 'POST')
    .map(([, options]) => options.body)

const create = fetch => createSandboxSessionManager({
    workerBaseUrl: 'http://worker',
    defaultInstanceType: 'sepal-default',
    log: noopLog,
    fetch
})

// Route-keyed fetch stub: responds by "<METHOD> <path>" key. Worker calls (base http://worker)
// are keyed by pathname; kernel-probe calls (absolute http://<host>:<port>/...) keep their full
// URL. Every request is recorded; an unmatched route → 404. This copes with the non-deterministic
// call ORDER the attribution logic produces (unlike the sequential mockResolvedValueOnce style).
const fetchStub = routes => {
    const fn = mock.fn(async (url, options = {}) => {
        const method = options.method ?? 'GET'
        const path = url.startsWith('http://worker') ? new URL(url).pathname : url
        const key = `${method} ${path}`
        fn.keys.push(key)
        const route = routes[key]
        return route === undefined
            ? {ok: false, status: 404, text: async () => ''}
            : {ok: true, status: 200, text: async () => JSON.stringify(route)}
    })
    fn.keys = []
    fn.requested = key => fn.keys.includes(key)
    return fn
}

// A worker call that never answers: it settles only when the caller's signal gives up on it.
const unanswered = ({signal}) => new Promise((_resolve, reject) =>
    signal?.addEventListener('abort', () => reject(signal.reason)))

// A legacy (no appPath) start is associated under '/sandbox/<endpoint>' like any other app, so
// what the worker holds for it — and hands back to a restarted gateway — is an ordinary
// GET /sessions/app-sessions row.
const legacyAppSession = ({endpoint, sessionId, host, status = 'ACTIVE'}) =>
    ({path: `/sandbox/${endpoint}`, label: null, sessionId, host, status})

// Any request under the endpoint; resolveTarget attributes by path, so tests must pass a real one.
const pathUnder = endpoint => `/api/sandbox/${endpoint}/some/path`

const associateBody = fetch => callsOf(fetch)
    .filter(([url, options]) => url.endsWith('/app') && options?.method === 'POST')
    .map(([, options]) => JSON.parse(options.body))

const createManager = ({fetch, defaultInstanceType = 'T3aSmall', ...options} = {}) =>
    createSandboxSessionManager({
        workerBaseUrl: 'http://worker',
        defaultInstanceType,
        heartbeatIntervalMs: 999999,
        log: noopLog,
        fetch,
        ...options
    })

describe('toClientStatus', () => {
    test('ACTIVE → STARTED, STARTING → STARTING', () => {
        assert.equal(toClientStatus('ACTIVE'), 'STARTED')
        assert.equal(toClientStatus('STARTING'), 'STARTING')
    })
})

describe('legacy endpoint start (no appPath)', () => {
    test('creates a session and associates it under the legacy app path', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'POST /sessions/instance-type/T3aSmall': {id: 's1', host: 'h1', status: 'STARTING'},
            'POST /sessions/session/s1/app': {sessionId: 's1', path: '/sandbox/rstudio'}
        })
        const mgr = createManager({fetch})

        const result = await mgr.startApp({username: 'alice', endpoint: 'rstudio'})

        assert.deepEqual(result, {id: 's1', status: 'STARTING'})
        // The association is what survives a gateway restart — without it the binding would live
        // only here, and closed-session traffic would have nothing to attribute itself to.
        assert.deepEqual(associateBody(fetch), [{path: '/sandbox/rstudio', label: 'RStudio'}])
        assert.partialDeepStrictEqual(
            mgr._cache.get('alice').get('/sandbox/rstudio'),
            {sessionId: 's1', host: 'h1', status: 'STARTING', endpoint: 'rstudio'}
        )
    })

    test('reuses the cached association without creating', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'POST /sessions/instance-type/T3aSmall': {id: 's1', host: 'h1', status: 'ACTIVE'},
            'POST /sessions/session/s1/app': {sessionId: 's1', path: '/sandbox/shiny'},
            'POST /sessions/session/s1/server/shiny': null
        })
        const mgr = createManager({fetch})

        await mgr.startApp({username: 'bob', endpoint: 'shiny'})
        fetch.mock.resetCalls()

        assert.deepEqual(
            await mgr.startApp({username: 'bob', endpoint: 'shiny'}),
            {id: 's1', status: 'STARTED'}
        )
        assert.equal(fetch.mock.callCount(), 0)
    })

    test('a cold gateway reuses the association the worker still holds', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'jupyter', sessionId: 's9', host: 'h9'})],
            'POST /sessions/session/s9/server/jupyter': null
        })
        const mgr = createManager({fetch})

        assert.deepEqual(
            await mgr.startApp({username: 'carol', endpoint: 'jupyter'}),
            {id: 's9', status: 'STARTED'}
        )
        assert.equal(fetch.requested('POST /sessions/instance-type/T3aSmall'), false)
        assert.partialDeepStrictEqual(
            mgr._cache.get('carol').get('/sandbox/jupyter'),
            {sessionId: 's9', host: 'h9'}
        )
    })

    test('per-instance-type lock: concurrent starts of different endpoints create only ONE session', async () => {
        let createCalls = 0
        const fetch = mock.fn(async (url, opts) => {
            if (url.endsWith('/sessions/app-sessions')) {
                return jsonResponse([])
            }
            if (opts.method === 'POST' && url.includes('/instance-type/')) {
                createCalls++
                await new Promise(r => setTimeout(r, 10))
                return jsonResponse({id: 'once', host: 'h', status: 'STARTING'})
            }
            if (opts.method === 'POST' && url.endsWith('/app')) {
                return jsonResponse({sessionId: 'once', path: '/sandbox/x'})
            }
            throw new Error(`unexpected ${url}`)
        })
        const mgr = create(fetch)

        const [a, b, c] = await Promise.all([
            mgr.startApp({username: 'dan', endpoint: 'rstudio'}),
            mgr.startApp({username: 'dan', endpoint: 'shiny'}),
            mgr.startApp({username: 'dan', endpoint: 'jupyter'})
        ])
        assert.equal(createCalls, 1)
        assert.deepEqual([a.id, b.id, c.id], ['once', 'once', 'once'])
    })
})

describe('status', () => {
    test('a cached STARTING session is re-checked against the worker on every poll (no 30s heartbeat lag)', async () => {
        // A cached STARTING entry must not be trusted until the heartbeat loop happens to refresh it:
        // the GUI's 2s poll has to flip to STARTED as soon as the session goes ACTIVE.
        const routes = {
            'GET /sessions/app-sessions': [],
            'POST /sessions/instance-type/T3aSmall': {id: 's1', host: 'h1', status: 'STARTING'},
            'POST /sessions/session/s1/app': {sessionId: 's1', path: '/sandbox/rstudio'}
        }
        const mgr = createManager({fetch: fetchStub(routes)})
        await mgr.startApp({username: 'gia', endpoint: 'rstudio'})

        routes['GET /sessions/app-sessions'] = [legacyAppSession({endpoint: 'rstudio', sessionId: 's1', host: 'h1'})]
        assert.deepEqual(await mgr.status('gia', 'rstudio'), {id: 's1', status: 'STARTED'})
        assert.partialDeepStrictEqual(mgr._cache.get('gia').get('/sandbox/rstudio'), {status: 'ACTIVE'})
    })

    test('a cached STARTING session the worker no longer knows is dropped (null status)', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'POST /sessions/instance-type/T3aSmall': {id: 's1', host: 'h1', status: 'STARTING'},
            'POST /sessions/session/s1/app': {sessionId: 's1', path: '/sandbox/rstudio'}
        })
        const mgr = createManager({fetch})
        await mgr.startApp({username: 'hal', endpoint: 'rstudio'})

        assert.equal(await mgr.status('hal', 'rstudio'), null)
        assert.equal(mgr._cache.get('hal'), undefined)
    })

    test('cached hit returns {id, status}', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'POST /sessions/instance-type/T3aSmall': {id: 's1', host: 'h1', status: 'ACTIVE'},
            'POST /sessions/session/s1/app': {sessionId: 's1', path: '/sandbox/shiny'},
            'POST /sessions/session/s1/server/shiny': null
        })
        const mgr = createManager({fetch})
        await mgr.startApp({username: 'eve', endpoint: 'shiny'})
        fetch.mock.resetCalls()

        assert.deepEqual(await mgr.status('eve', 'shiny'), {id: 's1', status: 'STARTED'})
        assert.equal(fetch.mock.callCount(), 0)
    })

    test('cache-miss → worker association lookup', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [
                legacyAppSession({endpoint: 'rstudio', sessionId: 's2', host: 'h2', status: 'STARTING'})
            ]
        })
        const mgr = createManager({fetch})
        assert.deepEqual(await mgr.status('frank', 'rstudio'), {id: 's2', status: 'STARTING'})
    })

    test('none → null', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': []})
        const mgr = createManager({fetch})
        assert.equal(await mgr.status('grace', 'rstudio'), null)
    })
})

describe('resolveTarget', () => {
    for (const [endpoint, port] of [
        ['rstudio', 8787],
        ['shiny', 3838],
        ['jupyter', 8888]
    ]) {
        test(`cached hit for ${endpoint} → correct port`, async () => {
            const fetch = fetchStub({
                'GET /sessions/app-sessions': [legacyAppSession({endpoint, sessionId: 's1', host: 'the-host'})]
            })
            const mgr = createManager({fetch})
            assert.deepEqual(
                await mgr.resolveTarget('h', endpoint, pathUnder(endpoint)),
                {host: 'the-host', port, sessionId: 's1'}
            )
            assert.equal(PORT_BY_ENDPOINT[endpoint], port)
        })
    }

    test('a restarted gateway resolves a legacy binding from the worker', async () => {
        // The whole point of associating the legacy start: an empty cache is not an empty answer.
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'shiny', sessionId: 's3', host: 'remote'})]
        })
        const mgr = createManager({fetch})
        assert.deepEqual(
            await mgr.resolveTarget('ivan', 'shiny', pathUnder('shiny')),
            {host: 'remote', port: 3838, sessionId: 's3'}
        )
    })

    test('none → null', async () => {
        const fetch = mock.fn(() => undefined, async () => jsonResponse([]), {times: 1})
        const mgr = create(fetch)
        assert.equal(await mgr.resolveTarget('judy', 'shiny'), null)
    })

    test('endpoint never bound → null, not an unrelated open session of the same user', async () => {
        // The user's jupyter session has closed (its associations went with it) but another sandbox
        // session — opened for a terminal, never for jupyter — is still up. The orphaned tab's
        // remaining jupyter traffic must NOT be re-targeted at it, and must not start jupyter there.
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'GET /sessions/active': [{id: 's-terminal', host: 'terminal-host', status: 'ACTIVE', instanceType: 'T3aSmall'}]
        })
        const mgr = createManager({fetch})

        assert.equal(
            await mgr.resolveTarget('admin', 'jupyter', '/api/sandbox/jupyter/lab/api/status'),
            null
        )
    })

    test('a kernel websocket on a cold gateway probes the hosts the worker knows', async () => {
        // Kernel traffic carries no app path, and a ws upgrade carries no Referer either (browsers
        // send Origin), so the probe is the only branch that can attribute it — and with two jupyter
        // sessions open, the single-candidate fallback cannot break the tie. On a cold cache the
        // probe has no hosts until the associations are loaded.
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [
                {path: '/sandbox/jupyter/lab', label: 'Lab', sessionId: 's-a', host: 'host-a', status: 'ACTIVE'},
                {path: '/sandbox/jupyter/tree', label: 'Notebook', sessionId: 's-b', host: 'host-b', status: 'ACTIVE'}
            ],
            'GET http://host-b:8888/api/sandbox/jupyter/api/kernels/k1': {id: 'k1'}
        })
        const mgr = createManager({fetch})

        assert.deepEqual(
            await mgr.resolveTarget('admin', 'jupyter', '/api/sandbox/jupyter/api/kernels/k1/channels'),
            {host: 'host-b', port: 8888, sessionId: 's-b'}
        )
    })

    test('unknown endpoint → null (no worker call)', async () => {
        const fetch = mock.fn()
        const mgr = create(fetch)
        assert.equal(await mgr.resolveTarget('ken', 'bogus'), null)
        assert.equal(fetch.mock.callCount(), 0)
    })
})

describe('heartbeat', () => {
    test('POSTs /sessions/session/{id} for each cached session', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [
                legacyAppSession({endpoint: 'rstudio', sessionId: 's1', host: 'h1', status: 'STARTING'})
            ],
            'POST /sessions/session/s1': {id: 's1', host: 'h1', status: 'ACTIVE'}
        })
        const mgr = createManager({fetch})
        await mgr.status('leo', 'rstudio')
        fetch.mock.resetCalls()

        await mgr.heartbeatOnce()
        assert.equal(fetch.mock.callCount(), 1)
        assert.equal(fetch.mock.calls[0].arguments[0], 'http://worker/sessions/session/s1')
        assert.equal(fetch.mock.calls[0].arguments[1].method, 'POST')
        assert.equal(mgr._cache.get('leo').get('/sandbox/rstudio').status, 'ACTIVE')
    })

    test('a hung heartbeat times out instead of holding back the sessions after it', {timeout: 1000}, async () => {
        const routes = fetchStub({
            'GET /sessions/app-sessions': [
                legacyAppSession({endpoint: 'rstudio', sessionId: 'hung', host: 'h1'}),
                legacyAppSession({endpoint: 'shiny', sessionId: 's2', host: 'h2'})
            ],
            'POST /sessions/session/s2': {id: 's2', host: 'h2', status: 'ACTIVE'}
        })
        const fetch = (url, options = {}) =>
            url.endsWith('/sessions/session/hung') ? unanswered(options) : routes(url, options)
        const mgr = createManager({fetch, heartbeatTimeoutMs: 10})
        await mgr.status('leo', 'rstudio')
        await mgr.status('leo', 'shiny')

        await mgr.heartbeatOnce()

        assert.equal(routes.requested('POST /sessions/session/s2'), true)
    })

    test('a timer tick while a heartbeat is still running starts no second one', async t => {
        t.mock.timers.enable({apis: ['setInterval']})
        const routes = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'rstudio', sessionId: 'hung', host: 'h1'})]
        })
        const fetch = mock.fn((url, options = {}) =>
            url.endsWith('/sessions/session/hung') ? unanswered(options) : routes(url, options))
        const mgr = createManager({fetch, heartbeatIntervalMs: 1000})
        await mgr.status('leo', 'rstudio')
        mgr.start()
        t.after(() => mgr.stop())

        t.mock.timers.tick(1000)
        t.mock.timers.tick(1000)

        assert.equal(heartbeatBodies(fetch).length, 1)
    })

    test('dedupes multiple endpoints sharing one session into a single heartbeat', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [
                legacyAppSession({endpoint: 'rstudio', sessionId: 'shared', host: 'h'}),
                legacyAppSession({endpoint: 'shiny', sessionId: 'shared', host: 'h'})
            ],
            'POST /sessions/session/shared': {id: 'shared', host: 'h', status: 'ACTIVE'}
        })
        const mgr = createManager({fetch})
        await mgr.status('mia', 'rstudio')
        await mgr.status('mia', 'shiny')
        fetch.mock.resetCalls()

        await mgr.heartbeatOnce()
        const hbCalls = callsOf(fetch).filter(c => c[0].includes('/session/'))
        assert.equal(hbCalls.length, 1)
    })

    // THIS TEST IS THE FILTER'S GUARANTEE. JupyterLab and RStudio poll their backends
    // continuously; every poll is a proxied request. Counting those as liveness is precisely what
    // made an open tab immortal, and deleting this test should look alarming.
    test('A PROXIED REQUEST ALONE IS NOT AN INTERACTION', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'rstudio', sessionId: 's1', host: 'h1'})],
            'POST /sessions/session/s1': {id: 's1', host: 'h1', status: 'ACTIVE'},
        })
        const mgr = createManager({fetch})
        await mgr.status('leo', 'rstudio')

        const target = await mgr.resolveTarget('leo', 'rstudio', pathUnder('rstudio'))
        assert.deepEqual(target, {host: 'h1', port: PORT_BY_ENDPOINT.rstudio, sessionId: 's1'})
        await mgr.heartbeatOnce()
        assert.deepEqual(heartbeatBodies(fetch), [undefined])
    })

    test('carries interaction only after the GUI reports one, then resets', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'rstudio', sessionId: 's1', host: 'h1'})],
            'POST /sessions/session/s1': {id: 's1', host: 'h1', status: 'ACTIVE'},
        })
        const mgr = createManager({fetch})
        await mgr.status('leo', 'rstudio')

        // 1) nothing reported yet → bodiless heartbeat
        await mgr.heartbeatOnce()
        assert.deepEqual(heartbeatBodies(fetch), [undefined])

        // 2) the GUI observed real input in an app iframe → next heartbeat carries it
        mgr.recordInteraction({username: 'leo', sessionId: 's1'})
        await mgr.heartbeatOnce()
        assert.deepEqual(heartbeatBodies(fetch), [undefined, JSON.stringify({interaction: true})])

        // 3) no further input → bodiless again
        await mgr.heartbeatOnce()
        assert.deepEqual(
            heartbeatBodies(fetch),
            [undefined, JSON.stringify({interaction: true}), undefined]
        )
    })

    describe('the observable declaration (§4c rule 1)', () => {
        const setup = async () => {
            const fetch = fetchStub({
                'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'rstudio', sessionId: 's1', host: 'h1'})],
                'POST /sessions/session/s1': {id: 's1', host: 'h1', status: 'ACTIVE'},
            })
            const mgr = createManager({fetch})
            await mgr.status('leo', 'rstudio')
            return {fetch, mgr}
        }

        // The gateway cannot tell "the GUI cannot observe this app" from "the GUI can observe it
        // and nobody is touching it", and those must produce opposite outcomes — so the GUI
        // declares it.
        test('an unobservable session falls back to counting proxied requests', async () => {
            const {fetch, mgr} = await setup()
            mgr.recordInteraction({username: 'leo', sessionId: 's1', observable: false})
            await mgr.resolveTarget('leo', 'rstudio', pathUnder('rstudio'))
            await mgr.heartbeatOnce()
            assert.deepEqual(heartbeatBodies(fetch), [JSON.stringify({interaction: true})])
        })

        // The default with NO report is observable — a deliberate exception to fail-open, chosen
        // on which failure gets noticed. Defaulting the other way means one bug in GUI reporting
        // silently reverts every session to the old behaviour, with no symptom at all.
        test('the default with no report is observable', async () => {
            const {fetch, mgr} = await setup()
            await mgr.resolveTarget('leo', 'rstudio', pathUnder('rstudio'))
            await mgr.heartbeatOnce()
            assert.deepEqual(heartbeatBodies(fetch), [undefined])
        })

        test('the declaration expires unless refreshed', async () => {
            const fetch = fetchStub({
                'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'rstudio', sessionId: 's1', host: 'h1'})],
                'POST /sessions/session/s1': {id: 's1', host: 'h1', status: 'ACTIVE'},
            })
            const mgr = createSandboxSessionManager({
                workerBaseUrl: 'http://worker',
                defaultInstanceType: 'sepal-default',
                observableTtlMs: -1, // already expired
                log: noopLog,
                fetch
            })
            await mgr.status('leo', 'rstudio')
            mgr.recordInteraction({username: 'leo', sessionId: 's1', observable: false})
            await mgr.resolveTarget('leo', 'rstudio', pathUnder('rstudio'))
            await mgr.heartbeatOnce()
            assert.deepEqual(heartbeatBodies(fetch), [undefined])
        })

        test('an observable report clears a previous unobservable one', async () => {
            const {fetch, mgr} = await setup()
            mgr.recordInteraction({username: 'leo', sessionId: 's1', observable: false})
            mgr.recordInteraction({username: 'leo', sessionId: 's1', observable: true})
            await mgr.heartbeatOnce() // consumes the interaction the observable report recorded
            await mgr.resolveTarget('leo', 'rstudio', pathUnder('rstudio'))
            await mgr.heartbeatOnce()
            assert.deepEqual(heartbeatBodies(fetch), [JSON.stringify({interaction: true}), undefined])
        })

        test('a report without a session is ignored', async () => {
            const {mgr} = await setup()
            assert.equal(mgr.recordInteraction({username: 'leo'}), false)
            assert.equal(mgr.recordInteraction({sessionId: 's1'}), false)
        })
    })

    describe('state for a session the gateway no longer serves', () => {
        const setup = async () => {
            const fetch = fetchStub({
                'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'rstudio', sessionId: 's1', host: 'h1'})],
                'POST /sessions/session/s1': {id: 's1', host: 'h1', status: 'ACTIVE'},
            })
            const mgr = createManager({fetch})
            await mgr.status('leo', 'rstudio')
            mgr.onAppDissociated({username: 'leo', appPath: '/sandbox/rstudio'})
            return {fetch, mgr}
        }

        test('an interaction reported meanwhile is not carried once it is served again', async () => {
            const {fetch, mgr} = await setup()
            mgr.recordInteraction({username: 'leo', sessionId: 's1'})
            await mgr.heartbeatOnce()

            await mgr.status('leo', 'rstudio')
            await mgr.heartbeatOnce()

            assert.deepEqual(heartbeatBodies(fetch), [undefined])
        })

        test('an unobservable declaration made meanwhile does not survive', async () => {
            const {fetch, mgr} = await setup()
            mgr.recordInteraction({username: 'leo', sessionId: 's1', observable: false})
            await mgr.heartbeatOnce()

            await mgr.resolveTarget('leo', 'rstudio', pathUnder('rstudio'))
            await mgr.heartbeatOnce()

            assert.deepEqual(heartbeatBodies(fetch), [undefined])
        })
    })

    // A worker that is down must not look like a worker that closed the session: the cache has to
    // SURVIVE the outage so heartbeats — and any interaction they carry — resume when it is back.
    test('keeps the cache entry when the worker is unreachable', async () => {
        const fetch = mock.fn(
            () => undefined,
            async () => jsonResponse([legacyAppSession({endpoint: 'shiny', sessionId: 's1', host: 'h1'})]),
            {times: 1}
        )
        const mgr = create(fetch)
        await mgr.status('nina', 'shiny')
        fetch.mock.resetCalls()

        // A whole outage's worth of failed beats: connection refused, then 503.
        fetch.mock.mockImplementationOnce(async () => {
            throw new Error('ECONNREFUSED')
        })
        await mgr.heartbeatOnce()
        assert.equal(mgr._cache.has('nina'), true)
        fetch.mock.mockImplementationOnce(async () => errorResponse(503))
        await mgr.heartbeatOnce()
        assert.equal(mgr._cache.has('nina'), true)

        // Worker back: the very next beat re-asserts the session and refreshes it.
        fetch.mock.mockImplementationOnce(async () => jsonResponse({id: 's1', host: 'h1', status: 'ACTIVE'}))
        await mgr.heartbeatOnce()
        assert.equal(mgr._cache.has('nina'), true)
        assert.ok(fetch.mock.calls.at(-1).arguments[0].includes('/sessions/session/s1'))
    })

    test('drops cache entry when worker reports 404 (closed)', async () => {
        const fetch = mock.fn(
            () => undefined,
            async () => jsonResponse([legacyAppSession({endpoint: 'shiny', sessionId: 's1', host: 'h1'})]),
            {times: 1}
        )
        const mgr = create(fetch)
        await mgr.status('nina', 'shiny')
        fetch.mock.resetCalls()
        fetch.mock.mockImplementationOnce(async () => errorResponse(404))

        await mgr.heartbeatOnce()
        assert.equal(mgr._cache.has('nina'), false)
    })
})

describe('onSessionClosed', () => {
    test('removes cached endpoints for {username, sessionId}', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [
                legacyAppSession({endpoint: 'rstudio', sessionId: 'sX', host: 'h'}),
                legacyAppSession({endpoint: 'shiny', sessionId: 'sX', host: 'h'})
            ]
        })
        const mgr = createManager({fetch})
        await mgr.status('oscar', 'rstudio')
        await mgr.status('oscar', 'shiny')
        assert.equal(mgr._cache.get('oscar').size, 2)

        mgr.onSessionClosed({username: 'oscar', sessionId: 'sX'})
        assert.equal(mgr._cache.has('oscar'), false)
    })

    test('host fallback removes matching entries when username absent', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'jupyter', sessionId: 'sY', host: 'hostY'})]
        })
        const mgr = createManager({fetch})
        await mgr.status('paul', 'jupyter')
        mgr.onSessionClosed({host: 'hostY'})
        assert.equal(mgr._cache.has('paul'), false)
    })

    test('does not touch a different session', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'shiny', sessionId: 'sZ', host: 'h'})]
        })
        const mgr = createManager({fetch})
        await mgr.status('quinn', 'shiny')
        mgr.onSessionClosed({username: 'quinn', sessionId: 'other'})
        assert.equal(mgr._cache.get('quinn').size, 1)
    })
})

describe('startApp', () => {
    it('reuses a live worker association even when a different pick is requested', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [{path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}]
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', instanceType: 'M6aXlarge'})
        // the explicit instanceType pick was overridden by the live association → reused
        assert.deepEqual(result, {id: 's-1', status: 'STARTED', reused: true})
        assert.equal(fetch.requested('POST /sessions/instance-type/M6aXlarge'), false)
    })

    it('bare re-open of an associated app (no pick) does not flag reused', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [{path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}]
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo'})
        assert.deepEqual(result, {id: 's-1', status: 'STARTED'}) // exact: no reused key
    })

    it('joins a chosen running session and associates the app', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'GET /sessions/active': [{id: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'M6aXlarge'}],
            'POST /sessions/session/s-2/app': {sessionId: 's-2', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: 's-2'})
        assert.deepEqual(result, {id: 's-2', status: 'STARTED'})
        assert.equal(fetch.requested('POST /sessions/session/s-2/app'), true)
    })

    it('rejects joining a session the worker does not report', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': [], 'GET /sessions/active': []})
        const manager = createManager({fetch})
        await assert.rejects(
            manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', sessionId: 'ghost'}),
            {statusCode: 404}
        )
    })

    it('does not start the endpoint server — that is the GUI\'s explicit next step', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [{path: '/sandbox/jupyter/foo', label: 'Foo', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}]
        })
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', endpoint: 'jupyter', appPath: '/sandbox/jupyter/foo'})
        assert.equal(fetch.requested('POST /sessions/session/s-1/server/jupyter'), false)
    })

    it('creates a session of the requested type and associates the app', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'POST /sessions/instance-type/M6aXlarge': {id: 's-3', path: 'sessions/session/s-3', username: 'bob', status: 'STARTING', host: 'h3'},
            'POST /sessions/session/s-3/app': {sessionId: 's-3', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', instanceType: 'M6aXlarge'})
        assert.deepEqual(result, {id: 's-3', status: 'STARTING'})
    })

    it('parallel creates for different apps with different instance types do not share a lock', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'POST /sessions/instance-type/T3aSmall': {id: 's-a', path: 'sessions/session/s-a', username: 'bob', status: 'STARTING', host: 'ha'},
            'POST /sessions/instance-type/M6aXlarge': {id: 's-b', path: 'sessions/session/s-b', username: 'bob', status: 'STARTING', host: 'hb'},
            'POST /sessions/session/s-a/app': {sessionId: 's-a', path: '/sandbox/shiny/small', label: null},
            'POST /sessions/session/s-b/app': {sessionId: 's-b', path: '/sandbox/shiny/big', label: null}
        })
        const manager = createManager({fetch})
        const [a, b] = await Promise.all([
            manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/small', instanceType: 'T3aSmall'}),
            manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/big', instanceType: 'M6aXlarge'})
        ])
        assert.deepEqual(a, {id: 's-a', status: 'STARTING'})
        assert.deepEqual(b, {id: 's-b', status: 'STARTING'})
        assert.equal(fetch.requested('POST /sessions/instance-type/T3aSmall'), true)
        assert.equal(fetch.requested('POST /sessions/instance-type/M6aXlarge'), true)
    })

    it('adopts the worker-returned association when it differs from the pick, flagging reused', async () => {
        // worker refuses to move a live association: POST .../app returns s-OTHER
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'GET /sessions/active': [
                {id: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'M6aXlarge'},
                {id: 's-OTHER', host: 'h9', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ],
            'POST /sessions/session/s-2/app': {sessionId: 's-OTHER', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: 's-2'})
        assert.deepEqual(result, {id: 's-OTHER', status: 'STARTED', reused: true})
    })
})

describe('resolveTarget per app', () => {
    it('routes by longest app-path prefix', async () => {
        const manager = createManager({fetch: fetchStub({'GET /sessions/app-sessions': [
            {path: '/sandbox/shiny/foo', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'},
            {path: '/sandbox/shiny/foobar', sessionId: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'T3aSmall'}
        ]})})
        const target = await manager.resolveTarget('bob', 'shiny', '/api/sandbox/shiny/foobar/x')
        assert.deepEqual(target, {host: 'h2', port: 3838, sessionId: 's-2'})
    })

    it('falls back to Referer attribution', async () => {
        const manager = createManager({fetch: fetchStub({'GET /sessions/app-sessions': [
            {path: '/sandbox/jupyter/voila/render/foo.ipynb', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}
        ]})})
        const target = await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/api/sessions',
            'https://sepal.io/api/sandbox/jupyter/voila/render/foo.ipynb?x=1')
        assert.deepEqual(target, {host: 'h1', port: 8888, sessionId: 's-1'})
    })

    it('falls back to the single candidate session', async () => {
        const manager = createManager({fetch: fetchStub({'GET /sessions/app-sessions': [
            {path: '/sandbox/jupyter/voila/render/foo.ipynb', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}
        ]})})
        const target = await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/api/kernels/k-1/channels')
        assert.deepEqual(target, {host: 'h1', port: 8888, sessionId: 's-1'})
    })

    it('does not count a cross-endpoint app as a single-candidate for another endpoint', async () => {
        // The user has a shiny app on h1 and a jupyter app on h2. A jupyter request for an
        // unattributable path (no matching app-path prefix, no referer) must resolve to the
        // ONLY jupyter candidate (h2) — the shiny entry must not be mislabeled as jupyter.
        const manager = createManager({fetch: fetchStub({'GET /sessions/app-sessions': [
            {path: '/sandbox/shiny/foo', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'},
            {path: '/sandbox/jupyter/voila/render/b.ipynb', sessionId: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'T3aSmall'}
        ]})})
        const target = await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/api/sessions')
        assert.deepEqual(target, {host: 'h2', port: 8888, sessionId: 's-2'})
    })

    it('probes candidate instances for an unknown kernel id when several sessions exist', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [
                {path: '/sandbox/jupyter/voila/render/a.ipynb', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'},
                {path: '/sandbox/jupyter/voila/render/b.ipynb', sessionId: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ],
            // probe hits: only h2 owns kernel k-9 (h1 falls through to the stub's 404 default)
            'GET http://h2:8888/api/sandbox/jupyter/api/kernels/k-9': {id: 'k-9'}
        })
        const manager = createManager({fetch})
        // prime the app-path entries (kernel probe candidates come from cached entries)
        await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/voila/render/a.ipynb')
        const target = await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/api/kernels/k-9/channels')
        assert.deepEqual(target, {host: 'h2', port: 8888, sessionId: 's-2'})
        const probeCallsBefore = callsOf(fetch).filter(([url]) => url.includes('/api/kernels/k-9')).length
        await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/api/kernels/k-9/channels')
        const probeCallsAfter = callsOf(fetch).filter(([url]) => url.includes('/api/kernels/k-9')).length
        assert.equal(probeCallsAfter, probeCallsBefore) // cached — no re-probe
    })

    it('probes a known kernel again once its session is no longer served', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [
                {path: '/sandbox/jupyter/voila/render/a.ipynb', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}
            ],
            'GET http://h1:8888/api/sandbox/jupyter/api/kernels/k-9': {id: 'k-9'}
        })
        const manager = createManager({fetch})
        await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/api/kernels/k-9/channels')
        manager.onAppDissociated({username: 'bob', appPath: '/sandbox/jupyter/voila/render/a.ipynb'})
        await manager.heartbeatOnce()

        await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/api/kernels/k-9/channels')

        const probes = fetch.keys.filter(key => key === 'GET http://h1:8888/api/sandbox/jupyter/api/kernels/k-9')
        assert.equal(probes.length, 2)
    })
})

describe('releaseApp', () => {
    const seedAppEntry = (manager, username, appPath, sessionId) =>
        manager._cache.set(username, new Map([[appPath, {
            sessionId, host: 'h1', status: 'ACTIVE', endpoint: 'shiny', appPath, lastSeen: 0
        }]]))

    it('deletes the worker association and drops the cached app entry', async () => {
        const fetch = fetchStub({'DELETE /sessions/app': null})
        const manager = createManager({fetch})
        seedAppEntry(manager, 'bob', '/sandbox/shiny/foo', 's-1')
        await manager.releaseApp({username: 'bob', appPath: '/sandbox/shiny/foo'})
        assert.equal(fetch.requested('DELETE /sessions/app'), true)
        const [url] = callsOf(fetch).find(([, options]) => options?.method === 'DELETE')
        assert.equal(url, 'http://worker/sessions/app?path=%2Fsandbox%2Fshiny%2Ffoo')
        assert.equal(manager._cache.get('bob'), undefined)
    })

    it('tolerates a worker 404 (no association) and still drops the cache entry', async () => {
        const fetch = fetchStub({}) // every route → 404
        const manager = createManager({fetch})
        seedAppEntry(manager, 'bob', '/sandbox/shiny/foo', 's-1')
        await manager.releaseApp({username: 'bob', appPath: '/sandbox/shiny/foo'})
        assert.equal(manager._cache.get('bob'), undefined)
    })

    // The worker's classified launch failure travels with the error, for the start route to pass on.
    it('carries what the worker said about a failed launch', async () => {
        const fetch = mock.fn(async () => ({
            ok: false,
            status: 503,
            text: async () => JSON.stringify({code: 'INSTANCE_UNAVAILABLE', message: 'Insufficient capacity.'})
        }))
        const manager = createManager({fetch})
        await assert.rejects(
            manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo'}),
            {statusCode: 503, body: {code: 'INSTANCE_UNAVAILABLE', message: 'Insufficient capacity.'}}
        )
    })

    it('propagates a non-404 worker error and keeps the cache entry', async () => {
        const fetch = mock.fn(async () => errorResponse(500))
        const manager = createManager({fetch})
        seedAppEntry(manager, 'bob', '/sandbox/shiny/foo', 's-1')
        await assert.rejects(
            manager.releaseApp({username: 'bob', appPath: '/sandbox/shiny/foo'}),
            {statusCode: 500}
        )
        assert.notEqual(manager._cache.get('bob')?.get('/sandbox/shiny/foo'), undefined)
    })

    it('is a no-op without an appPath', async () => {
        const fetch = mock.fn()
        const manager = createManager({fetch})
        await manager.releaseApp({username: 'bob'})
        assert.equal(fetch.mock.callCount(), 0)
    })
})

describe('app ownership (clientId passthrough)', () => {
    const APP_SESSIONS = [{path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}]

    const associateBody = fetch => {
        const call = callsOf(fetch).find(([url, options]) =>
            options?.method === 'POST' && url.includes('/app'))
        return call ? JSON.parse(call[1].body) : null
    }

    it('create path passes clientId to the worker associate', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'POST /sessions/instance-type/T3aSmall': {id: 's-3', path: 'sessions/session/s-3', username: 'bob', status: 'STARTING', host: 'h3'},
            'POST /sessions/session/s-3/app': {sessionId: 's-3', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', clientId: 'c-1'})
        assert.deepEqual(
            associateBody(fetch),
            {path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-1'}
        )
    })

    it('join path passes clientId to the worker associate', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'GET /sessions/active': [{id: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'M6aXlarge'}],
            'POST /sessions/session/s-2/app': {sessionId: 's-2', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: 's-2', clientId: 'c-1'})
        assert.deepEqual(
            associateBody(fetch),
            {path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-1'}
        )
    })

    it('an existing association still triggers a worker associate to refresh ownership', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': APP_SESSIONS,
            'POST /sessions/session/s-1/app': {sessionId: 's-1', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', clientId: 'c-2'})
        assert.deepEqual(result, {id: 's-1', status: 'STARTED'})
        assert.equal(fetch.requested('POST /sessions/session/s-1/app'), true)
        assert.deepEqual(
            associateBody(fetch),
            {path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-2'}
        )
    })

    it('an existing association skips the ownership refresh without a clientId', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': APP_SESSIONS})
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo'})
        assert.equal(fetch.requested('POST /sessions/session/s-1/app'), false)
    })

    it('a failing ownership refresh does not break the start (best-effort)', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': APP_SESSIONS}) // associate POST → 404
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo', clientId: 'c-2'})
        assert.deepEqual(result, {id: 's-1', status: 'STARTED'})
    })

    // A ws reconnect replays every open tab's association. It refreshes ownership and must extend
    // nothing — the flag is what lets the worker tell it from a user opening the app.
    it('a reconnect re-assert marks the worker associate as a re-assert', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': APP_SESSIONS,
            'POST /sessions/session/s-1/app': {sessionId: 's-1', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', clientId: 'c-2', reassert: true})
        assert.deepEqual(
            associateBody(fetch),
            {path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-2', reassert: true}
        )
    })

    // The old clientId's clientDown usually sweeps the association first, so the re-assert lands on
    // the join path instead — which must carry the flag too.
    it('a reconnect re-assert marks the join path too', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'GET /sessions/active': [{id: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'M6aXlarge'}],
            'POST /sessions/session/s-2/app': {sessionId: 's-2', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: 's-2', clientId: 'c-1', reassert: true})
        assert.deepEqual(
            associateBody(fetch),
            {path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-1', reassert: true}
        )
    })

    it('an ordinary start sends no reassert flag', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': APP_SESSIONS,
            'POST /sessions/session/s-1/app': {sessionId: 's-1', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', clientId: 'c-2'})
        assert.ok(!('reassert' in Object(associateBody(fetch))))
    })

    it('releaseApp forwards the requesting clientId to the worker DELETE', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': APP_SESSIONS, 'DELETE /sessions/app': null})
        const manager = createManager({fetch})
        await manager.releaseApp({username: 'bob', appPath: '/sandbox/shiny/foo', clientId: 'c-1'})
        const [url] = callsOf(fetch).find(([, options]) => options?.method === 'DELETE')
        assert.equal(
            url,
            'http://worker/sessions/app?path=%2Fsandbox%2Fshiny%2Ffoo&clientId=c-1'
        )
    })

    it('onAppDissociated drops the cached app entry (worker-initiated dissociation)', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': APP_SESSIONS})
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo'})
        assert.notEqual(manager._cache.get('bob').get('/sandbox/shiny/foo'), undefined)
        manager.onAppDissociated({username: 'bob', appPath: '/sandbox/shiny/foo'})
        assert.equal(manager._cache.get('bob'), undefined)
    })

    it('onAppDissociated tolerates a malformed payload', async () => {
        const manager = createManager({fetch: fetchStub({})})
        assert.doesNotThrow(() => manager.onAppDissociated({}))
        assert.doesNotThrow(() => manager.onAppDissociated())
    })
})

describe('ensureServerStarted', () => {
    const startKey = 'POST /sessions/session/s-1/server/jupyter'

    it('POSTs the worker start-server route once per (session, endpoint)', async () => {
        const fetch = fetchStub({[startKey]: null})
        const manager = createManager({fetch})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'jupyter'})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'jupyter'})
        assert.equal(fetch.keys.filter(key => key === startKey).length, 1)
    })

    it('starts a second endpoint on the same session separately', async () => {
        const fetch = fetchStub({
            [startKey]: null,
            'POST /sessions/session/s-1/server/shiny': null
        })
        const manager = createManager({fetch})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'jupyter'})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'shiny'})
        assert.equal(fetch.requested(startKey), true)
        assert.equal(fetch.requested('POST /sessions/session/s-1/server/shiny'), true)
    })

    it('does not cache a failed ensure', async () => {
        // No route registered → the stub answers 404 → workerRequest throws.
        const fetch = fetchStub({})
        const manager = createManager({fetch})
        await assert.rejects(
            manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'shiny'})
        )
        await assert.rejects(
            manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'shiny'})
        )
        assert.equal(
            fetch.keys.filter(key => key === 'POST /sessions/session/s-1/server/shiny').length,
            2
        )
    })

    it('starts a forgotten server again', async () => {
        const fetch = fetchStub({[startKey]: null})
        const manager = createManager({fetch})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'jupyter'})
        manager.forgetServerStarted({sessionId: 's-1', endpoint: 'jupyter'})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'jupyter'})
        assert.equal(fetch.keys.filter(key => key === startKey).length, 2)
    })

    it('starts a server again once its session is no longer served', async () => {
        const fetch = fetchStub({[startKey]: null})
        const manager = createManager({fetch})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'jupyter'})
        await manager.heartbeatOnce()

        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'jupyter'})

        assert.equal(fetch.keys.filter(key => key === startKey).length, 2)
    })

    it('is a no-op without a sessionId, and for an unknown endpoint', async () => {
        const fetch = fetchStub({})
        const manager = createManager({fetch})
        await manager.ensureServerStarted({username: 'bob', sessionId: null, endpoint: 'shiny'})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'sshd'})
        assert.deepEqual(fetch.keys, [])
    })
})
