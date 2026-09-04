import {jest} from '@jest/globals'

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
const heartbeatBodies = fetch => fetch.mock.calls
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
    const fn = jest.fn(async (url, options = {}) => {
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

// A legacy (no appPath) start is associated under '/sandbox/<endpoint>' like any other app, so
// what the worker holds for it — and hands back to a restarted gateway — is an ordinary
// GET /sessions/app-sessions row.
const legacyAppSession = ({endpoint, sessionId, host, status = 'ACTIVE'}) =>
    ({path: `/sandbox/${endpoint}`, label: null, sessionId, host, status})

// Any request under the endpoint; resolveTarget attributes by path, so tests must pass a real one.
const pathUnder = endpoint => `/api/sandbox/${endpoint}/some/path`

const associateBody = fetch => fetch.mock.calls
    .filter(([url, options]) => url.endsWith('/app') && options?.method === 'POST')
    .map(([, options]) => JSON.parse(options.body))

const createManager = ({fetch, defaultInstanceType = 'T3aSmall'} = {}) =>
    createSandboxSessionManager({
        workerBaseUrl: 'http://worker',
        defaultInstanceType,
        heartbeatIntervalMs: 999999,
        log: noopLog,
        fetch
    })

describe('toClientStatus', () => {
    test('ACTIVE → STARTED, STARTING → STARTING', () => {
        expect(toClientStatus('ACTIVE')).toBe('STARTED')
        expect(toClientStatus('STARTING')).toBe('STARTING')
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

        expect(result).toEqual({id: 's1', status: 'STARTING'})
        // The association is what survives a gateway restart — without it the binding would live
        // only here, and closed-session traffic would have nothing to attribute itself to.
        expect(associateBody(fetch)).toEqual([{path: '/sandbox/rstudio', label: 'RStudio'}])
        expect(mgr._cache.get('alice').get('/sandbox/rstudio'))
            .toMatchObject({sessionId: 's1', host: 'h1', status: 'STARTING', endpoint: 'rstudio'})
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
        fetch.mockClear()

        expect(await mgr.startApp({username: 'bob', endpoint: 'shiny'})).toEqual({id: 's1', status: 'STARTED'})
        expect(fetch).not.toHaveBeenCalled()
    })

    test('a cold gateway reuses the association the worker still holds', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'jupyter', sessionId: 's9', host: 'h9'})],
            'POST /sessions/session/s9/server/jupyter': null
        })
        const mgr = createManager({fetch})

        expect(await mgr.startApp({username: 'carol', endpoint: 'jupyter'})).toEqual({id: 's9', status: 'STARTED'})
        expect(fetch.requested('POST /sessions/instance-type/T3aSmall')).toBe(false)
        expect(mgr._cache.get('carol').get('/sandbox/jupyter')).toMatchObject({sessionId: 's9', host: 'h9'})
    })

    test('per-instance-type lock: concurrent starts of different endpoints create only ONE session', async () => {
        let createCalls = 0
        const fetch = jest.fn(async (url, opts) => {
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
        expect(createCalls).toBe(1)
        expect([a.id, b.id, c.id]).toEqual(['once', 'once', 'once'])
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
        expect(await mgr.status('gia', 'rstudio')).toEqual({id: 's1', status: 'STARTED'})
        expect(mgr._cache.get('gia').get('/sandbox/rstudio')).toMatchObject({status: 'ACTIVE'})
    })

    test('a cached STARTING session the worker no longer knows is dropped (null status)', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'POST /sessions/instance-type/T3aSmall': {id: 's1', host: 'h1', status: 'STARTING'},
            'POST /sessions/session/s1/app': {sessionId: 's1', path: '/sandbox/rstudio'}
        })
        const mgr = createManager({fetch})
        await mgr.startApp({username: 'hal', endpoint: 'rstudio'})

        expect(await mgr.status('hal', 'rstudio')).toBeNull()
        expect(mgr._cache.get('hal')).toBeUndefined()
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
        fetch.mockClear()

        expect(await mgr.status('eve', 'shiny')).toEqual({id: 's1', status: 'STARTED'})
        expect(fetch).not.toHaveBeenCalled()
    })

    test('cache-miss → worker association lookup', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [
                legacyAppSession({endpoint: 'rstudio', sessionId: 's2', host: 'h2', status: 'STARTING'})
            ]
        })
        const mgr = createManager({fetch})
        expect(await mgr.status('frank', 'rstudio')).toEqual({id: 's2', status: 'STARTING'})
    })

    test('none → null', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': []})
        const mgr = createManager({fetch})
        expect(await mgr.status('grace', 'rstudio')).toBeNull()
    })
})

describe('resolveTarget', () => {
    test.each([
        ['rstudio', 8787],
        ['shiny', 3838],
        ['jupyter', 8888]
    ])('cached hit for %s → correct port', async (endpoint, port) => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint, sessionId: 's1', host: 'the-host'})]
        })
        const mgr = createManager({fetch})
        expect(await mgr.resolveTarget('h', endpoint, pathUnder(endpoint)))
            .toEqual({host: 'the-host', port, sessionId: 's1'})
        expect(PORT_BY_ENDPOINT[endpoint]).toBe(port)
    })

    test('a restarted gateway resolves a legacy binding from the worker', async () => {
        // The whole point of associating the legacy start: an empty cache is not an empty answer.
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'shiny', sessionId: 's3', host: 'remote'})]
        })
        const mgr = createManager({fetch})
        expect(await mgr.resolveTarget('ivan', 'shiny', pathUnder('shiny')))
            .toEqual({host: 'remote', port: 3838, sessionId: 's3'})
    })

    test('none → null', async () => {
        const fetch = jest.fn().mockResolvedValueOnce(jsonResponse([]))
        const mgr = create(fetch)
        expect(await mgr.resolveTarget('judy', 'shiny')).toBeNull()
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

        expect(await mgr.resolveTarget('admin', 'jupyter', '/api/sandbox/jupyter/lab/api/status')).toBeNull()
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

        expect(await mgr.resolveTarget('admin', 'jupyter', '/api/sandbox/jupyter/api/kernels/k1/channels'))
            .toEqual({host: 'host-b', port: 8888, sessionId: 's-b'})
    })

    test('unknown endpoint → null (no worker call)', async () => {
        const fetch = jest.fn()
        const mgr = create(fetch)
        expect(await mgr.resolveTarget('ken', 'bogus')).toBeNull()
        expect(fetch).not.toHaveBeenCalled()
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
        fetch.mockClear()

        await mgr.heartbeatOnce()
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(fetch.mock.calls[0][0]).toBe('http://worker/sessions/session/s1')
        expect(fetch.mock.calls[0][1].method).toBe('POST')
        expect(mgr._cache.get('leo').get('/sandbox/rstudio').status).toBe('ACTIVE')
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
        fetch.mockClear()

        await mgr.heartbeatOnce()
        const hbCalls = fetch.mock.calls.filter(c => c[0].includes('/session/'))
        expect(hbCalls).toHaveLength(1)
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
        expect(target).toEqual({host: 'h1', port: PORT_BY_ENDPOINT.rstudio, sessionId: 's1'})
        await mgr.heartbeatOnce()
        expect(heartbeatBodies(fetch)).toEqual([undefined])
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
        expect(heartbeatBodies(fetch)).toEqual([undefined])

        // 2) the GUI observed real input in an app iframe → next heartbeat carries it
        mgr.recordInteraction({username: 'leo', sessionId: 's1'})
        await mgr.heartbeatOnce()
        expect(heartbeatBodies(fetch)).toEqual([undefined, JSON.stringify({interaction: true})])

        // 3) no further input → bodiless again
        await mgr.heartbeatOnce()
        expect(heartbeatBodies(fetch)).toEqual([undefined, JSON.stringify({interaction: true}), undefined])
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
            expect(heartbeatBodies(fetch)).toEqual([JSON.stringify({interaction: true})])
        })

        // The default with NO report is observable — a deliberate exception to fail-open, chosen
        // on which failure gets noticed. Defaulting the other way means one bug in GUI reporting
        // silently reverts every session to the old behaviour, with no symptom at all.
        test('the default with no report is observable', async () => {
            const {fetch, mgr} = await setup()
            await mgr.resolveTarget('leo', 'rstudio', pathUnder('rstudio'))
            await mgr.heartbeatOnce()
            expect(heartbeatBodies(fetch)).toEqual([undefined])
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
            expect(heartbeatBodies(fetch)).toEqual([undefined])
        })

        test('an observable report clears a previous unobservable one', async () => {
            const {fetch, mgr} = await setup()
            mgr.recordInteraction({username: 'leo', sessionId: 's1', observable: false})
            mgr.recordInteraction({username: 'leo', sessionId: 's1', observable: true})
            await mgr.heartbeatOnce() // consumes the interaction the observable report recorded
            await mgr.resolveTarget('leo', 'rstudio', pathUnder('rstudio'))
            await mgr.heartbeatOnce()
            expect(heartbeatBodies(fetch)).toEqual([JSON.stringify({interaction: true}), undefined])
        })

        test('a report without a session is ignored', async () => {
            const {mgr} = await setup()
            expect(mgr.recordInteraction({username: 'leo'})).toBe(false)
            expect(mgr.recordInteraction({sessionId: 's1'})).toBe(false)
        })
    })

    // The worker's startup grace (workerSession/index.js STARTUP_GRACE_MS) only saves a session if
    // a heartbeat lands during it. That requires this cache to SURVIVE the outage — a worker that
    // is down must not look like a worker that closed the session.
    test('keeps the cache entry when the worker is unreachable', async () => {
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([legacyAppSession({endpoint: 'shiny', sessionId: 's1', host: 'h1'})]))
        const mgr = create(fetch)
        await mgr.status('nina', 'shiny')
        fetch.mockClear()

        // A whole outage's worth of failed beats: connection refused, then 503.
        fetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
        await mgr.heartbeatOnce()
        expect(mgr._cache.has('nina')).toBe(true)
        fetch.mockResolvedValueOnce(errorResponse(503))
        await mgr.heartbeatOnce()
        expect(mgr._cache.has('nina')).toBe(true)

        // Worker back: the very next beat re-asserts the session and refreshes it.
        fetch.mockResolvedValueOnce(jsonResponse({id: 's1', host: 'h1', status: 'ACTIVE'}))
        await mgr.heartbeatOnce()
        expect(mgr._cache.has('nina')).toBe(true)
        expect(fetch.mock.calls.at(-1)[0]).toContain('/sessions/session/s1')
    })

    test('drops cache entry when worker reports 404 (closed)', async () => {
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([legacyAppSession({endpoint: 'shiny', sessionId: 's1', host: 'h1'})]))
        const mgr = create(fetch)
        await mgr.status('nina', 'shiny')
        fetch.mockClear()
        fetch.mockResolvedValueOnce(errorResponse(404))

        await mgr.heartbeatOnce()
        expect(mgr._cache.has('nina')).toBe(false)
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
        expect(mgr._cache.get('oscar').size).toBe(2)

        mgr.onSessionClosed({username: 'oscar', sessionId: 'sX'})
        expect(mgr._cache.has('oscar')).toBe(false)
    })

    test('host fallback removes matching entries when username absent', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'jupyter', sessionId: 'sY', host: 'hostY'})]
        })
        const mgr = createManager({fetch})
        await mgr.status('paul', 'jupyter')
        mgr.onSessionClosed({host: 'hostY'})
        expect(mgr._cache.has('paul')).toBe(false)
    })

    test('does not touch a different session', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [legacyAppSession({endpoint: 'shiny', sessionId: 'sZ', host: 'h'})]
        })
        const mgr = createManager({fetch})
        await mgr.status('quinn', 'shiny')
        mgr.onSessionClosed({username: 'quinn', sessionId: 'other'})
        expect(mgr._cache.get('quinn').size).toBe(1)
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
        expect(result).toEqual({id: 's-1', status: 'STARTED', reused: true})
        expect(fetch.requested('POST /sessions/instance-type/M6aXlarge')).toBe(false)
    })

    it('bare re-open of an associated app (no pick) does not flag reused', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [{path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}]
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo'})
        expect(result).toEqual({id: 's-1', status: 'STARTED'}) // exact: no reused key
    })

    it('joins a chosen running session and associates the app', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'GET /sessions/active': [{id: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'M6aXlarge'}],
            'POST /sessions/session/s-2/app': {sessionId: 's-2', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: 's-2'})
        expect(result).toEqual({id: 's-2', status: 'STARTED'})
        expect(fetch.requested('POST /sessions/session/s-2/app')).toBe(true)
    })

    it('rejects joining a session the worker does not report', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': [], 'GET /sessions/active': []})
        const manager = createManager({fetch})
        await expect(manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', sessionId: 'ghost'}))
            .rejects.toMatchObject({statusCode: 404})
    })

    it('creates a session of the requested type and associates the app', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'POST /sessions/instance-type/M6aXlarge': {id: 's-3', path: 'sessions/session/s-3', username: 'bob', status: 'STARTING', host: 'h3'},
            'POST /sessions/session/s-3/app': {sessionId: 's-3', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', instanceType: 'M6aXlarge'})
        expect(result).toEqual({id: 's-3', status: 'STARTING'})
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
        expect(a).toEqual({id: 's-a', status: 'STARTING'})
        expect(b).toEqual({id: 's-b', status: 'STARTING'})
        expect(fetch.requested('POST /sessions/instance-type/T3aSmall')).toBe(true)
        expect(fetch.requested('POST /sessions/instance-type/M6aXlarge')).toBe(true)
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
        expect(result).toEqual({id: 's-OTHER', status: 'STARTED', reused: true})
    })
})

describe('resolveTarget per app', () => {
    it('routes by longest app-path prefix', async () => {
        const manager = createManager({fetch: fetchStub({'GET /sessions/app-sessions': [
            {path: '/sandbox/shiny/foo', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'},
            {path: '/sandbox/shiny/foobar', sessionId: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'T3aSmall'}
        ]})})
        const target = await manager.resolveTarget('bob', 'shiny', '/api/sandbox/shiny/foobar/x')
        expect(target).toEqual({host: 'h2', port: 3838, sessionId: 's-2'})
    })

    it('falls back to Referer attribution', async () => {
        const manager = createManager({fetch: fetchStub({'GET /sessions/app-sessions': [
            {path: '/sandbox/jupyter/voila/render/foo.ipynb', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}
        ]})})
        const target = await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/api/sessions',
            'https://sepal.io/api/sandbox/jupyter/voila/render/foo.ipynb?x=1')
        expect(target).toEqual({host: 'h1', port: 8888, sessionId: 's-1'})
    })

    it('falls back to the single candidate session', async () => {
        const manager = createManager({fetch: fetchStub({'GET /sessions/app-sessions': [
            {path: '/sandbox/jupyter/voila/render/foo.ipynb', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}
        ]})})
        const target = await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/api/kernels/k-1/channels')
        expect(target).toEqual({host: 'h1', port: 8888, sessionId: 's-1'})
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
        expect(target).toEqual({host: 'h2', port: 8888, sessionId: 's-2'})
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
        expect(target).toEqual({host: 'h2', port: 8888, sessionId: 's-2'})
        const probeCallsBefore = fetch.mock.calls.filter(([url]) => url.includes('/api/kernels/k-9')).length
        await manager.resolveTarget('bob', 'jupyter', '/api/sandbox/jupyter/api/kernels/k-9/channels')
        const probeCallsAfter = fetch.mock.calls.filter(([url]) => url.includes('/api/kernels/k-9')).length
        expect(probeCallsAfter).toBe(probeCallsBefore) // cached — no re-probe
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
        expect(fetch.requested('DELETE /sessions/app')).toBe(true)
        const [url] = fetch.mock.calls.find(([, options]) => options?.method === 'DELETE')
        expect(url).toBe('http://worker/sessions/app?path=%2Fsandbox%2Fshiny%2Ffoo')
        expect(manager._cache.get('bob')).toBeUndefined()
    })

    it('tolerates a worker 404 (no association) and still drops the cache entry', async () => {
        const fetch = fetchStub({}) // every route → 404
        const manager = createManager({fetch})
        seedAppEntry(manager, 'bob', '/sandbox/shiny/foo', 's-1')
        await manager.releaseApp({username: 'bob', appPath: '/sandbox/shiny/foo'})
        expect(manager._cache.get('bob')).toBeUndefined()
    })

    it('propagates a non-404 worker error and keeps the cache entry', async () => {
        const fetch = jest.fn(async () => errorResponse(500))
        const manager = createManager({fetch})
        seedAppEntry(manager, 'bob', '/sandbox/shiny/foo', 's-1')
        await expect(manager.releaseApp({username: 'bob', appPath: '/sandbox/shiny/foo'}))
            .rejects.toMatchObject({statusCode: 500})
        expect(manager._cache.get('bob')?.get('/sandbox/shiny/foo')).toBeDefined()
    })

    it('is a no-op without an appPath', async () => {
        const fetch = jest.fn()
        const manager = createManager({fetch})
        await manager.releaseApp({username: 'bob'})
        expect(fetch).not.toHaveBeenCalled()
    })
})

describe('app ownership (clientId passthrough)', () => {
    const APP_SESSIONS = [{path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-1', host: 'h1', status: 'ACTIVE', instanceType: 'T3aSmall'}]

    const associateBody = fetch => {
        const call = fetch.mock.calls.find(([url, options]) =>
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
        expect(associateBody(fetch)).toEqual({path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-1'})
    })

    it('join path passes clientId to the worker associate', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'GET /sessions/active': [{id: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'M6aXlarge'}],
            'POST /sessions/session/s-2/app': {sessionId: 's-2', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: 's-2', clientId: 'c-1'})
        expect(associateBody(fetch)).toEqual({path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-1'})
    })

    it('an existing association still triggers a worker associate to refresh ownership', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': APP_SESSIONS,
            'POST /sessions/session/s-1/app': {sessionId: 's-1', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', clientId: 'c-2'})
        expect(result).toEqual({id: 's-1', status: 'STARTED'})
        expect(fetch.requested('POST /sessions/session/s-1/app')).toBe(true)
        expect(associateBody(fetch)).toEqual({path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-2'})
    })

    it('an existing association skips the ownership refresh without a clientId', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': APP_SESSIONS})
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo'})
        expect(fetch.requested('POST /sessions/session/s-1/app')).toBe(false)
    })

    it('a failing ownership refresh does not break the start (best-effort)', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': APP_SESSIONS}) // associate POST → 404
        const manager = createManager({fetch})
        const result = await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo', clientId: 'c-2'})
        expect(result).toEqual({id: 's-1', status: 'STARTED'})
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
        expect(associateBody(fetch)).toEqual({path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-2', reassert: true})
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
        expect(associateBody(fetch)).toEqual({path: '/sandbox/shiny/foo', label: 'Foo', clientId: 'c-1', reassert: true})
    })

    it('an ordinary start sends no reassert flag', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': APP_SESSIONS,
            'POST /sessions/session/s-1/app': {sessionId: 's-1', path: '/sandbox/shiny/foo', label: 'Foo'}
        })
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', clientId: 'c-2'})
        expect(associateBody(fetch)).not.toHaveProperty('reassert')
    })

    it('releaseApp forwards the requesting clientId to the worker DELETE', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': APP_SESSIONS, 'DELETE /sessions/app': null})
        const manager = createManager({fetch})
        await manager.releaseApp({username: 'bob', appPath: '/sandbox/shiny/foo', clientId: 'c-1'})
        const [url] = fetch.mock.calls.find(([, options]) => options?.method === 'DELETE')
        expect(url).toBe('http://worker/sessions/app?path=%2Fsandbox%2Fshiny%2Ffoo&clientId=c-1')
    })

    it('onAppDissociated drops the cached app entry (worker-initiated dissociation)', async () => {
        const fetch = fetchStub({'GET /sessions/app-sessions': APP_SESSIONS})
        const manager = createManager({fetch})
        await manager.startApp({username: 'bob', appPath: '/sandbox/shiny/foo'})
        expect(manager._cache.get('bob').get('/sandbox/shiny/foo')).toBeDefined()
        manager.onAppDissociated({username: 'bob', appPath: '/sandbox/shiny/foo'})
        expect(manager._cache.get('bob')).toBeUndefined()
    })

    it('onAppDissociated tolerates a malformed payload', async () => {
        const manager = createManager({fetch: fetchStub({})})
        expect(() => manager.onAppDissociated({})).not.toThrow()
        expect(() => manager.onAppDissociated()).not.toThrow()
    })
})

describe('ensureServerStarted', () => {
    const startKey = 'POST /sessions/session/s-1/server/jupyter'

    it('POSTs the worker start-server route once per (session, endpoint)', async () => {
        const fetch = fetchStub({[startKey]: null})
        const manager = createManager({fetch})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'jupyter'})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'jupyter'})
        expect(fetch.keys.filter(key => key === startKey)).toHaveLength(1)
    })

    it('starts a second endpoint on the same session separately', async () => {
        const fetch = fetchStub({
            [startKey]: null,
            'POST /sessions/session/s-1/server/shiny': null
        })
        const manager = createManager({fetch})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'jupyter'})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'shiny'})
        expect(fetch.requested(startKey)).toBe(true)
        expect(fetch.requested('POST /sessions/session/s-1/server/shiny')).toBe(true)
    })

    it('does not cache a failed ensure', async () => {
        // No route registered → the stub answers 404 → workerRequest throws.
        const fetch = fetchStub({})
        const manager = createManager({fetch})
        await expect(manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'shiny'}))
            .rejects.toThrow()
        await expect(manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'shiny'}))
            .rejects.toThrow()
        expect(fetch.keys.filter(key => key === 'POST /sessions/session/s-1/server/shiny')).toHaveLength(2)
    })

    it('is a no-op without a sessionId, and for an unknown endpoint', async () => {
        const fetch = fetchStub({})
        const manager = createManager({fetch})
        await manager.ensureServerStarted({username: 'bob', sessionId: null, endpoint: 'shiny'})
        await manager.ensureServerStarted({username: 'bob', sessionId: 's-1', endpoint: 'sshd'})
        expect(fetch.keys).toEqual([])
    })
})

describe('startApp server start', () => {
    it('ensures the endpoint server when the app is STARTED', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'GET /sessions/active': [{id: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'M6aXlarge'}],
            'POST /sessions/session/s-2/app': {sessionId: 's-2', path: '/sandbox/shiny/foo', label: 'Foo'},
            'POST /sessions/session/s-2/server/shiny': null
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({
            username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: 's-2'})
        expect(result).toEqual({id: 's-2', status: 'STARTED'})
        expect(fetch.requested('POST /sessions/session/s-2/server/shiny')).toBe(true)
    })

    it('still reports STARTED when the ensure fails - the proxy is the gate', async () => {
        const fetch = fetchStub({
            'GET /sessions/app-sessions': [],
            'GET /sessions/active': [{id: 's-2', host: 'h2', status: 'ACTIVE', instanceType: 'M6aXlarge'}],
            'POST /sessions/session/s-2/app': {sessionId: 's-2', path: '/sandbox/shiny/foo', label: 'Foo'}
            // no server route -> 404 -> the ensure rejects
        })
        const manager = createManager({fetch})
        const result = await manager.startApp({
            username: 'bob', endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: 's-2'})
        expect(result).toEqual({id: 's-2', status: 'STARTED'})
    })
})
