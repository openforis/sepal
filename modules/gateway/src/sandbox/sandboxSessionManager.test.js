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

describe('startEndpoint', () => {
    test('creates a session via worker when none cached, caching {sessionId,host,status}', async () => {
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([])) // GET /sessions/active → none
            .mockResolvedValueOnce(jsonResponse({id: 's1', host: 'h1', status: 'STARTING'})) // POST create
        const mgr = create(fetch)

        const result = await mgr.startEndpoint('alice', 'rstudio')

        expect(result).toEqual({id: 's1', status: 'STARTING'})
        expect(fetch.mock.calls[0][0]).toBe('http://worker/sessions/active')
        expect(fetch.mock.calls[1][0]).toBe('http://worker/sessions/instance-type/sepal-default')
        expect(fetch.mock.calls[1][1].method).toBe('POST')
        expect(JSON.parse(fetch.mock.calls[1][1].headers['sepal-user'])).toEqual({username: 'alice', roles: []})
        const cached = mgr._cache.get('alice').get('endpoint:rstudio')
        expect(cached).toMatchObject({sessionId: 's1', host: 'h1', status: 'STARTING'})
    })

    test('reuses cached active session without creating', async () => {
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({id: 's1', host: 'h1', status: 'ACTIVE'}))
        const mgr = create(fetch)

        await mgr.startEndpoint('bob', 'shiny')
        fetch.mockClear()

        const result = await mgr.startEndpoint('bob', 'shiny')
        expect(result).toEqual({id: 's1', status: 'STARTED'})
        expect(fetch).not.toHaveBeenCalled()
    })

    test('reuses an existing worker session found via /sessions/active', async () => {
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([{id: 's9', host: 'h9', status: 'ACTIVE', instanceType: 't'}]))
        const mgr = create(fetch)

        const result = await mgr.startEndpoint('carol', 'jupyter')
        expect(result).toEqual({id: 's9', status: 'STARTED'})
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(mgr._cache.get('carol').get('endpoint:jupyter')).toMatchObject({sessionId: 's9', host: 'h9'})
    })

    test('per-username lock: concurrent starts create only ONE session', async () => {
        let createCalls = 0
        const fetch = jest.fn(async (url, opts) => {
            if (url.endsWith('/sessions/active')) {
                return jsonResponse([])
            }
            if (opts.method === 'POST' && url.includes('/instance-type/')) {
                createCalls++
                await new Promise(r => setTimeout(r, 10))
                return jsonResponse({id: 'once', host: 'h', status: 'STARTING'})
            }
            throw new Error(`unexpected ${url}`)
        })
        const mgr = create(fetch)

        const [a, b, c] = await Promise.all([
            mgr.startEndpoint('dan', 'rstudio'),
            mgr.startEndpoint('dan', 'shiny'),
            mgr.startEndpoint('dan', 'jupyter')
        ])
        expect(createCalls).toBe(1)
        expect(a.id).toBe('once')
        expect(b.id).toBe('once')
        expect(c.id).toBe('once')
    })
})

describe('status', () => {
    test('a cached STARTING session is re-checked against the worker on every poll (no 30s heartbeat lag)', async () => {
        // A cached STARTING entry must not be trusted until the heartbeat loop happens to refresh it:
        // the GUI's 2s poll has to flip to STARTED as soon as the session goes ACTIVE.
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([])) // startEndpoint: GET active → none
            .mockResolvedValueOnce(jsonResponse({id: 's1', host: 'h1', status: 'STARTING'})) // POST create
        const mgr = create(fetch)
        await mgr.startEndpoint('gia', 'rstudio')

        fetch.mockResolvedValueOnce(jsonResponse([{id: 's1', host: 'h1', status: 'ACTIVE', instanceType: 't'}]))
        expect(await mgr.status('gia', 'rstudio')).toEqual({id: 's1', status: 'STARTED'})
        expect(mgr._cache.get('gia').get('endpoint:rstudio')).toMatchObject({status: 'ACTIVE'})
    })

    test('a cached STARTING session the worker no longer knows is dropped (null status)', async () => {
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({id: 's1', host: 'h1', status: 'STARTING'}))
        const mgr = create(fetch)
        await mgr.startEndpoint('hal', 'rstudio')

        fetch.mockResolvedValueOnce(jsonResponse([])) // worker: session gone
        expect(await mgr.status('hal', 'rstudio')).toBeNull()
        expect(mgr._cache.get('hal')).toBeUndefined()
    })

    test('cached hit returns {id, status}', async () => {
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({id: 's1', host: 'h1', status: 'ACTIVE'}))
        const mgr = create(fetch)
        await mgr.startEndpoint('eve', 'shiny')
        fetch.mockClear()

        expect(await mgr.status('eve', 'shiny')).toEqual({id: 's1', status: 'STARTED'})
        expect(fetch).not.toHaveBeenCalled()
    })

    test('cache-miss → worker /sessions/active fallback', async () => {
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([{id: 's2', host: 'h2', status: 'STARTING', instanceType: 't'}]))
        const mgr = create(fetch)
        expect(await mgr.status('frank', 'rstudio')).toEqual({id: 's2', status: 'STARTING'})
    })

    test('none → null', async () => {
        const fetch = jest.fn().mockResolvedValueOnce(jsonResponse([]))
        const mgr = create(fetch)
        expect(await mgr.status('grace', 'rstudio')).toBeNull()
    })
})

describe('resolveTarget', () => {
    test.each([
        ['rstudio', 8787],
        ['shiny', 3838],
        ['jupyter', 8888]
    ])('cached hit for %s → correct port', async (endpoint, port) => {
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({id: 's1', host: 'the-host', status: 'ACTIVE'}))
        const mgr = create(fetch)
        await mgr.startEndpoint('h', endpoint)
        expect(await mgr.resolveTarget('h', endpoint)).toEqual({host: 'the-host', port, sessionId: 's1'})
        expect(PORT_BY_ENDPOINT[endpoint]).toBe(port)
    })

    test('cache-miss → worker fallback resolves host+port', async () => {
        // Two responses, in the order resolveTarget asks for them: the app-path attribution runs
        // first and must come up empty, or the legacy fallback this test is named for is never
        // reached and the single-candidate branch answers instead.
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([])) // GET /sessions/app-sessions → none
            .mockResolvedValueOnce(jsonResponse([{id: 's3', host: 'remote', status: 'ACTIVE', instanceType: 't'}]))
        const mgr = create(fetch)
        expect(await mgr.resolveTarget('ivan', 'shiny')).toEqual({host: 'remote', port: 3838, sessionId: 's3'})
    })

    test('none → null', async () => {
        const fetch = jest.fn().mockResolvedValueOnce(jsonResponse([]))
        const mgr = create(fetch)
        expect(await mgr.resolveTarget('judy', 'shiny')).toBeNull()
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
        const fetch = jest.fn()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({id: 's1', host: 'h1', status: 'STARTING'}))
        const mgr = create(fetch)
        await mgr.startEndpoint('leo', 'rstudio')
        fetch.mockClear()
        fetch.mockResolvedValueOnce(jsonResponse({id: 's1', host: 'h1', status: 'ACTIVE'}))

        await mgr.heartbeatOnce()
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(fetch.mock.calls[0][0]).toBe('http://worker/sessions/session/s1')
        expect(fetch.mock.calls[0][1].method).toBe('POST')
        expect(mgr._cache.get('leo').get('endpoint:rstudio').status).toBe('ACTIVE')
    })

    test('dedupes multiple endpoints sharing one session into a single heartbeat', async () => {
        const fetch = jest.fn(async (url, opts) => {
            if (url.endsWith('/sessions/active')) {
                return jsonResponse([{id: 'shared', host: 'h', status: 'ACTIVE', instanceType: 't'}])
            }
            if (opts.method === 'POST' && url.includes('/session/')) {
                return jsonResponse({id: 'shared', host: 'h', status: 'ACTIVE'})
            }
            throw new Error(`unexpected ${url}`)
        })
        const mgr = create(fetch)
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
            'GET /sessions/active': [{id: 's1', host: 'h1', status: 'ACTIVE', instanceType: 't'}],
            'GET /sessions/app-sessions': [],
            'POST /sessions/session/s1': {id: 's1', host: 'h1', status: 'ACTIVE'},
        })
        const mgr = createManager({fetch})
        await mgr.status('leo', 'rstudio')

        const target = await mgr.resolveTarget('leo', 'rstudio', '/some/path')
        expect(target).toEqual({host: 'h1', port: PORT_BY_ENDPOINT.rstudio, sessionId: 's1'})
        await mgr.heartbeatOnce()
        expect(heartbeatBodies(fetch)).toEqual([undefined])
    })

    test('carries interaction only after the GUI reports one, then resets', async () => {
        const fetch = fetchStub({
            'GET /sessions/active': [{id: 's1', host: 'h1', status: 'ACTIVE', instanceType: 't'}],
            'GET /sessions/app-sessions': [],
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
                'GET /sessions/active': [{id: 's1', host: 'h1', status: 'ACTIVE', instanceType: 't'}],
                'GET /sessions/app-sessions': [],
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
            await mgr.resolveTarget('leo', 'rstudio', '/some/path')
            await mgr.heartbeatOnce()
            expect(heartbeatBodies(fetch)).toEqual([JSON.stringify({interaction: true})])
        })

        // The default with NO report is observable — a deliberate exception to fail-open, chosen
        // on which failure gets noticed. Defaulting the other way means one bug in GUI reporting
        // silently reverts every session to the old behaviour, with no symptom at all.
        test('the default with no report is observable', async () => {
            const {fetch, mgr} = await setup()
            await mgr.resolveTarget('leo', 'rstudio', '/some/path')
            await mgr.heartbeatOnce()
            expect(heartbeatBodies(fetch)).toEqual([undefined])
        })

        test('the declaration expires unless refreshed', async () => {
            const fetch = fetchStub({
                'GET /sessions/active': [{id: 's1', host: 'h1', status: 'ACTIVE', instanceType: 't'}],
                'GET /sessions/app-sessions': [],
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
            await mgr.resolveTarget('leo', 'rstudio', '/some/path')
            await mgr.heartbeatOnce()
            expect(heartbeatBodies(fetch)).toEqual([undefined])
        })

        test('an observable report clears a previous unobservable one', async () => {
            const {fetch, mgr} = await setup()
            mgr.recordInteraction({username: 'leo', sessionId: 's1', observable: false})
            mgr.recordInteraction({username: 'leo', sessionId: 's1', observable: true})
            await mgr.heartbeatOnce() // consumes the interaction the observable report recorded
            await mgr.resolveTarget('leo', 'rstudio', '/some/path')
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
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({id: 's1', host: 'h1', status: 'ACTIVE'}))
        const mgr = create(fetch)
        await mgr.startEndpoint('nina', 'shiny')
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
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({id: 's1', host: 'h1', status: 'ACTIVE'}))
        const mgr = create(fetch)
        await mgr.startEndpoint('nina', 'shiny')
        fetch.mockClear()
        fetch.mockResolvedValueOnce(errorResponse(404))

        await mgr.heartbeatOnce()
        expect(mgr._cache.has('nina')).toBe(false)
    })
})

describe('onSessionClosed', () => {
    test('removes cached endpoints for {username, sessionId}', async () => {
        const fetch = jest.fn(async url => {
            if (url.endsWith('/sessions/active')) {
                return jsonResponse([{id: 'sX', host: 'h', status: 'ACTIVE', instanceType: 't'}])
            }
            return jsonResponse(null)
        })
        const mgr = create(fetch)
        await mgr.status('oscar', 'rstudio')
        await mgr.status('oscar', 'shiny')
        expect(mgr._cache.get('oscar').size).toBe(2)

        mgr.onSessionClosed({username: 'oscar', sessionId: 'sX'})
        expect(mgr._cache.has('oscar')).toBe(false)
    })

    test('host fallback removes matching entries when username absent', async () => {
        const fetch = jest.fn(async url => {
            if (url.endsWith('/sessions/active')) {
                return jsonResponse([{id: 'sY', host: 'hostY', status: 'ACTIVE', instanceType: 't'}])
            }
            return jsonResponse(null)
        })
        const mgr = create(fetch)
        await mgr.status('paul', 'jupyter')
        mgr.onSessionClosed({host: 'hostY'})
        expect(mgr._cache.has('paul')).toBe(false)
    })

    test('does not touch a different session', async () => {
        const fetch = jest.fn(async url => {
            if (url.endsWith('/sessions/active')) {
                return jsonResponse([{id: 'sZ', host: 'h', status: 'ACTIVE', instanceType: 't'}])
            }
            return jsonResponse(null)
        })
        const mgr = create(fetch)
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
