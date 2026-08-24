import {jest} from '@jest/globals'
import http from 'http'
import {WebSocket, WebSocketServer} from 'ws'

import {createSandboxProxy, parseSandboxPath} from './sandboxProxy.js'

const sepalUserHeader = username => JSON.stringify({username, roles: []})

// Stand up a stub upstream HTTP server that echoes the path it received (and can emit a redirect
// via ?redirect=<location>). Also hosts a ws echo endpoint. Returns {host, port, close, state}.
//
// FAIL-LOUD: pass {expectedPaths: [...]} to enumerate the exact upstream paths this test allows. Any
// other received path (a wrong strip that would otherwise be silently echoed back 200) responds 404
// on HTTP and refuses the ws upgrade, so an incorrect upstream path fails the assertion instead of
// masquerading as success. Query strings are compared verbatim. Omit expectedPaths to accept any.
const startUpstream = ({expectedPaths} = {}) => new Promise(resolve => {
    const state = {lastPath: null, lastHeaders: null}
    const allowed = path => !expectedPaths || expectedPaths.includes(path)
    const server = http.createServer((req, res) => {
        state.lastPath = req.url
        state.lastHeaders = req.headers
        if (!allowed(req.url)) {
            res.writeHead(404, {'Content-Type': 'text/plain'})
            res.end(`unexpected-upstream-path:${req.url}`)
            return
        }
        const url = new URL(req.url, 'http://x')
        const redirect = url.searchParams.get('redirect')
        if (redirect) {
            res.writeHead(302, {
                Location: redirect,
                'X-Frame-Options': 'DENY'
            })
            res.end()
            return
        }
        res.writeHead(200, {'X-Frame-Options': 'SAMEORIGIN', 'Content-Type': 'text/plain'})
        res.end(`upstream:${req.url}`)
    })
    const wss = new WebSocketServer({server})
    wss.on('connection', (ws, req) => {
        state.lastPath = req.url // upgrade requests bypass the HTTP handler
        state.lastHeaders = req.headers
        if (!allowed(req.url)) {
            // Fail loud: never echo on an unexpected path — close so the client's message never round-trips.
            ws.close(1011, `unexpected-upstream-path:${req.url}`)
            return
        }
        ws.on('message', data => ws.send(`echo:${data}`))
    })
    server.listen(0, '127.0.0.1', () => {
        const {port} = server.address()
        resolve({
            host: '127.0.0.1',
            port,
            state,
            close: () => new Promise(r => {
                wss.close()
                server.close(r)
            })
        })
    })
})

const startProxyServer = sandboxProxy => new Promise(resolve => {
    const server = http.createServer((req, res) => {
        // Minimal Express-like shim: status().send().
        res.status = code => {
            res.statusCode = code
            return {send: body => res.end(body)}
        }
        req.originalUrl = req.url
        sandboxProxy.middleware(req, res)
    })
    server.on('upgrade', (req, socket, head) => {
        const username = req.headers['x-test-user'] || null
        // Inject sepal-user like main.js does before proxying.
        if (username) {
            req.headers['sepal-user'] = sepalUserHeader(username)
        }
        sandboxProxy.upgrade(req, socket, head, username)
    })
    server.listen(0, '127.0.0.1', () => resolve({
        server,
        port: server.address().port,
        close: () => new Promise(r => server.close(r))
    }))
})

const get = (port, path, username, extraHeaders = {}) => new Promise((resolve, reject) => {
    const headers = {
        ...(username ? {'sepal-user': sepalUserHeader(username)} : {}),
        ...extraHeaders
    }
    const req = http.request({host: '127.0.0.1', port, path, headers}, res => {
        let body = ''
        res.on('data', c => body += c)
        res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body}))
    })
    req.on('error', reject)
    req.end()
})

describe('parseSandboxPath', () => {
    test('rstudio strips the WHOLE /api/sandbox/rstudio prefix (root-served)', () => {
        expect(parseSandboxPath('/api/sandbox/rstudio/foo')).toEqual({
            endpoint: 'rstudio',
            upstreamPath: '/foo'
        })
    })
    test('rstudio session strips to /session', () => {
        expect(parseSandboxPath('/api/sandbox/rstudio/session')).toEqual({
            endpoint: 'rstudio',
            upstreamPath: '/session'
        })
    })
    test('bare /api/sandbox/rstudio → upstream root /', () => {
        expect(parseSandboxPath('/api/sandbox/rstudio')).toEqual({
            endpoint: 'rstudio',
            upstreamPath: '/'
        })
    })
    test('shiny strips the WHOLE /api/sandbox/shiny prefix', () => {
        expect(parseSandboxPath('/api/sandbox/shiny/foo')).toEqual({
            endpoint: 'shiny',
            upstreamPath: '/foo'
        })
    })
    test('bare /api/sandbox/shiny → upstream root /', () => {
        expect(parseSandboxPath('/api/sandbox/shiny')).toEqual({
            endpoint: 'shiny',
            upstreamPath: '/'
        })
    })
    test('jupyter keeps the full path', () => {
        expect(parseSandboxPath('/api/sandbox/jupyter/api/kernels/x')).toEqual({
            endpoint: 'jupyter',
            upstreamPath: '/api/sandbox/jupyter/api/kernels/x'
        })
    })
    test('no endpoint segment → null', () => {
        expect(parseSandboxPath('/api/sandbox')).toEqual({endpoint: null})
    })
})

describe('sandbox HTTP proxy', () => {
    let upstream, proxyServer

    const resolveTarget = jest.fn()

    const setup = async ({resolvesToUpstream = true, expectedPaths} = {}) => {
        upstream = await startUpstream({expectedPaths})
        if (resolvesToUpstream) {
            resolveTarget.mockResolvedValue({host: upstream.host, port: upstream.port})
        }
        const sandboxProxy = createSandboxProxy({resolveTarget, sepalHost: 'sepal.test'})
        proxyServer = await startProxyServer(sandboxProxy)
        return sandboxProxy
    }

    afterEach(async () => {
        resolveTarget.mockReset()
        if (proxyServer) await proxyServer.close()
        if (upstream) await upstream.close()
    })

    test('rstudio → upstream sees /session (whole /api/sandbox/rstudio stripped, root-served), query preserved', async () => {
        await setup({expectedPaths: ['/session?x=1']})
        const res = await get(proxyServer.port, '/api/sandbox/rstudio/session?x=1', 'alice')
        expect(res.status).toBe(200)
        expect(upstream.state.lastPath).toBe('/session?x=1')
        expect(resolveTarget).toHaveBeenCalledWith('alice', 'rstudio', '/api/sandbox/rstudio/session', undefined)
    })

    test('bare /api/sandbox/rstudio → upstream root /', async () => {
        await setup({expectedPaths: ['/']})
        const res = await get(proxyServer.port, '/api/sandbox/rstudio', 'alice')
        expect(res.status).toBe(200)
        expect(upstream.state.lastPath).toBe('/')
    })

    test('shiny → upstream sees /foo (whole /api/sandbox/shiny stripped)', async () => {
        await setup({expectedPaths: ['/foo']})
        const res = await get(proxyServer.port, '/api/sandbox/shiny/foo', 'alice')
        expect(res.status).toBe(200)
        expect(upstream.state.lastPath).toBe('/foo')
        expect(resolveTarget).toHaveBeenCalledWith('alice', 'shiny', '/api/sandbox/shiny/foo', undefined)
    })

    test('jupyter → upstream keeps /api/sandbox/jupyter/... path', async () => {
        await setup({expectedPaths: ['/api/sandbox/jupyter/api/kernels/k1']})
        const res = await get(proxyServer.port, '/api/sandbox/jupyter/api/kernels/k1', 'bob')
        expect(res.status).toBe(200)
        expect(upstream.state.lastPath).toBe('/api/sandbox/jupyter/api/kernels/k1')
        expect(resolveTarget).toHaveBeenCalledWith('bob', 'jupyter', '/api/sandbox/jupyter/api/kernels/k1', undefined)
    })

    test('resolveTarget null → 400 (endpoint not started)', async () => {
        await setup({resolvesToUpstream: false})
        resolveTarget.mockResolvedValue(null)
        const res = await get(proxyServer.port, '/api/sandbox/rstudio/', 'alice')
        expect(res.status).toBe(400)
    })

    test('unknown endpoint → 404 (resolveTarget not called)', async () => {
        await setup()
        const res = await get(proxyServer.port, '/api/sandbox/bogus/', 'alice')
        expect(res.status).toBe(404)
        expect(resolveTarget).not.toHaveBeenCalled()
    })

    test('rstudio Location header rewritten under /api/sandbox/rstudio', async () => {
        await setup()
        const res = await get(proxyServer.port, '/api/sandbox/rstudio/?redirect=/auth-sign-in', 'alice')
        expect(res.status).toBe(302)
        expect(res.headers['location']).toBe('/api/sandbox/rstudio/auth-sign-in')
    })

    test('rstudio Location header query string preserved on rewrite', async () => {
        await setup()
        const res = await get(proxyServer.port, '/api/sandbox/rstudio/?redirect=' + encodeURIComponent('/auth-sign-in?appUri=%2Ffoo'), 'alice')
        expect(res.status).toBe(302)
        expect(res.headers['location']).toBe('/api/sandbox/rstudio/auth-sign-in?appUri=%2Ffoo')
    })

    test('rstudio ROOT Location keeps the trailing slash (post-sign-in redirect)', async () => {
        // rstudio's auth-sign-in dance ends with a redirect to the appUri '/' (absolute, on the
        // public host). It must land on /api/sandbox/rstudio/ WITH the slash: index.htm uses
        // relative asset URLs, which resolve against /api/sandbox/ from the slash-less form and
        // 404 as unknown endpoints — the "start RStudio twice" bug.
        await setup()
        const redirect = encodeURIComponent('http://sepal.public/')
        const res = await get(proxyServer.port, `/api/sandbox/rstudio/?redirect=${redirect}`, 'alice', {host: 'sepal.public'})
        expect(res.status).toBe(302)
        expect(res.headers['location']).toBe('/api/sandbox/rstudio/')
    })

    test('rstudio ABSOLUTE Location on the PUBLIC host rewritten under /api/sandbox/rstudio (Java RedirectRewriteHandler parity)', async () => {
        // With the Host header preserved (changeOrigin:false), rstudio builds absolute redirects from the
        // PUBLIC host. They must be rewritten like relative ones, or the browser lands on /auth-sign-in at
        // the site root and RStudio breaks.
        await setup()
        const redirect = encodeURIComponent('http://sepal.public/auth-sign-in?appUri=%2F')
        const res = await get(proxyServer.port, `/api/sandbox/rstudio/?redirect=${redirect}`, 'alice', {host: 'sepal.public'})
        expect(res.status).toBe(302)
        expect(res.headers['location']).toBe('/api/sandbox/rstudio/auth-sign-in?appUri=%2F')
    })

    test('rstudio Location on a FOREIGN host passes through unchanged', async () => {
        await setup()
        const redirect = encodeURIComponent('http://other.example/somewhere')
        const res = await get(proxyServer.port, `/api/sandbox/rstudio/?redirect=${redirect}`, 'alice', {host: 'sepal.public'})
        expect(res.status).toBe(302)
        expect(res.headers['location']).toBe('http://other.example/somewhere')
    })

    test('jupyter Location header NOT rewritten', async () => {
        await setup()
        const res = await get(proxyServer.port, '/api/sandbox/jupyter/x?redirect=/api/sandbox/jupyter/tree', 'bob')
        expect(res.status).toBe(302)
        expect(res.headers['location']).toBe('/api/sandbox/jupyter/tree')
    })

    test('upstream sees the ORIGINAL Host header, not the container\'s (Undertow rewriteHostHeader=false parity)', async () => {
        // Jupyter's APIHandler same-origin check compares the browser's Origin against Host and 404s every
        // non-GET request on mismatch ("Error Starting Kernel (Not Found)"), so the container must see the
        // client's own Host header.
        await setup()
        const res = await get(proxyServer.port, '/api/sandbox/jupyter/api/sessions', 'bob', {host: 'sepal.test'})
        expect(res.status).toBe(200)
        expect(upstream.state.lastHeaders.host).toBe('sepal.test')
    })

    test('X-Frame-Options stripped and CSP frame-ancestors set', async () => {
        await setup()
        const res = await get(proxyServer.port, '/api/sandbox/rstudio/', 'alice')
        expect(res.headers['x-frame-options']).toBeUndefined()
        expect(res.headers['content-security-policy']).toContain('frame-ancestors')
        expect(res.headers['content-security-policy']).toContain('sepal.test')
        expect(res.headers['cache-control']).toBe('no-cache, max-age=0')
    })

    test('keep-alive socket does not accumulate per-request timeout listeners', async () => {
        // httpxy adds a 'timeout' listener to the incoming socket on EVERY proxy.web() call
        // (req.socket.setTimeout(options.timeout, cb)) that only auto-removes if it fires. With
        // keep-alive the socket is shared across requests, so without per-response cleanup the
        // listeners pile up until MaxListenersExceededWarning (proxy.js clears them the same way).
        await setup({expectedPaths: ['/']})
        const sockets = []
        proxyServer.server.on('connection', socket => sockets.push(socket))
        const agent = new http.Agent({keepAlive: true, maxSockets: 1})
        try {
            for (let i = 0; i < 5; i++) {
                const status = await new Promise((resolve, reject) => {
                    const req = http.request({
                        host: '127.0.0.1',
                        port: proxyServer.port,
                        path: '/api/sandbox/rstudio',
                        agent,
                        headers: {'sepal-user': sepalUserHeader('alice')}
                    }, res => {
                        res.resume()
                        res.on('end', () => resolve(res.statusCode))
                    })
                    req.on('error', reject)
                    req.end()
                })
                expect(status).toBe(200)
            }
            // All requests must have reused a single connection for the leak to be observable.
            expect(sockets).toHaveLength(1)
            // Let the server-side response 'close' events run before counting.
            await new Promise(resolve => setImmediate(resolve))
            expect(sockets[0].listenerCount('timeout')).toBeLessThanOrEqual(1)
        } finally {
            agent.destroy()
        }
    })
})

describe('sandbox WebSocket proxy', () => {
    let upstream, proxyServer
    const resolveTarget = jest.fn()

    afterEach(async () => {
        resolveTarget.mockReset()
        if (proxyServer) await proxyServer.close()
        if (upstream) await upstream.close()
    })

    test('dynamic-target ws upgrade tunnels bidirectionally, upstream sees the stripped path', async () => {
        // Fail loud: only /ws is allowed upstream — a wrong strip (e.g. /rstudio/ws) is refused and the
        // echo never round-trips, failing the test instead of silently passing.
        upstream = await startUpstream({expectedPaths: ['/ws']})
        resolveTarget.mockResolvedValue({host: upstream.host, port: upstream.port})
        const sandboxProxy = createSandboxProxy({resolveTarget, sepalHost: 'sepal.test'})
        proxyServer = await startProxyServer(sandboxProxy)

        const echoed = await new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${proxyServer.port}/api/sandbox/rstudio/ws`, {
                headers: {'x-test-user': 'alice'}
            })
            ws.on('open', () => ws.send('ping'))
            ws.on('message', data => {
                ws.close()
                resolve(data.toString())
            })
            ws.on('error', reject)
        })

        expect(echoed).toBe('echo:ping')
        expect(resolveTarget).toHaveBeenCalledWith('alice', 'rstudio', '/api/sandbox/rstudio/ws', undefined)
        expect(upstream.state.lastPath).toBe('/ws')
    })

    test('jupyter kernel-channels ws keeps the /api/sandbox/jupyter path', async () => {
        upstream = await startUpstream({expectedPaths: ['/api/sandbox/jupyter/api/kernels/k1/channels']})
        resolveTarget.mockResolvedValue({host: upstream.host, port: upstream.port})
        const sandboxProxy = createSandboxProxy({resolveTarget, sepalHost: 'sepal.test'})
        proxyServer = await startProxyServer(sandboxProxy)

        const echoed = await new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${proxyServer.port}/api/sandbox/jupyter/api/kernels/k1/channels`, {
                headers: {'x-test-user': 'bob'}
            })
            ws.on('open', () => ws.send('kernel'))
            ws.on('message', data => {
                ws.close()
                resolve(data.toString())
            })
            ws.on('error', reject)
        })

        expect(echoed).toBe('echo:kernel')
        expect(upstream.state.lastPath).toBe('/api/sandbox/jupyter/api/kernels/k1/channels')
    })

    test('ws upgrade preserves the ORIGINAL Host header (Jupyter kernel channels run the same origin check)', async () => {
        upstream = await startUpstream({expectedPaths: ['/api/sandbox/jupyter/api/kernels/k1/channels']})
        resolveTarget.mockResolvedValue({host: upstream.host, port: upstream.port})
        const sandboxProxy = createSandboxProxy({resolveTarget, sepalHost: 'sepal.test'})
        proxyServer = await startProxyServer(sandboxProxy)

        await new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${proxyServer.port}/api/sandbox/jupyter/api/kernels/k1/channels`, {
                headers: {'x-test-user': 'bob', host: 'sepal.test'}
            })
            ws.on('open', () => ws.send('kernel'))
            ws.on('message', () => {
                ws.close()
                resolve()
            })
            ws.on('error', reject)
        })

        expect(upstream.state.lastHeaders.host).toBe('sepal.test')
    })

    test('ws upgrade with no session → socket closed with 400 (not started)', async () => {
        upstream = await startUpstream()
        resolveTarget.mockResolvedValue(null)
        const sandboxProxy = createSandboxProxy({resolveTarget, sepalHost: 'sepal.test'})
        proxyServer = await startProxyServer(sandboxProxy)

        await expect(new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${proxyServer.port}/api/sandbox/rstudio/ws`, {
                headers: {'x-test-user': 'alice'}
            })
            ws.on('open', () => resolve('opened'))
            ws.on('error', reject)
        })).rejects.toThrow()
    })

    test('ws upgrade calls proxy.ws with the resolved dynamic target + rewritten path', async () => {
        resolveTarget.mockResolvedValue({host: 'sandbox-host', port: 8787})
        const sandboxProxy = createSandboxProxy({resolveTarget, sepalHost: 'sepal.test'})
        const wsSpy = jest.spyOn(sandboxProxy._proxy, 'ws').mockResolvedValue()

        const req = {url: '/api/sandbox/rstudio/ws?token=abc', headers: {}}
        const socket = {write: jest.fn(), destroy: jest.fn()}
        await sandboxProxy.upgrade(req, socket, Buffer.alloc(0), 'alice')

        expect(wsSpy).toHaveBeenCalledTimes(1)
        // httpxy signature: ws(req, socket, opts, head) — opts is the 3rd argument.
        const [, , opts] = wsSpy.mock.calls[0]
        expect(opts.target).toBe('http://sandbox-host:8787')
        expect(req.url).toBe('/ws?token=abc') // whole /api/sandbox/rstudio stripped, query preserved
    })

    test('ws upgrade: a THROW from resolveTarget is caught (no unhandled rejection) → 502 + socket destroyed', async () => {
        // A rejected resolveTarget (not just null) must be handled, not escape as an unhandled rejection.
        resolveTarget.mockRejectedValue(new Error('resolve boom'))
        const sandboxProxy = createSandboxProxy({resolveTarget, sepalHost: 'sepal.test'})
        const wsSpy = jest.spyOn(sandboxProxy._proxy, 'ws').mockResolvedValue()

        const req = {url: '/api/sandbox/rstudio/ws', headers: {}}
        const socket = {write: jest.fn(), destroy: jest.fn()}
        await expect(sandboxProxy.upgrade(req, socket, Buffer.alloc(0), 'alice')).resolves.toBeUndefined()

        expect(wsSpy).not.toHaveBeenCalled()
        expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('502'))
        expect(socket.destroy).toHaveBeenCalled()
    })
})

describe('resolveTarget argument threading', () => {
    test('HTTP middleware passes the request pathname and referer to resolveTarget', async () => {
        const resolveTarget = jest.fn(async () => ({host: 'h1', port: 3838}))
        const sandboxProxy = createSandboxProxy({resolveTarget, sepalHost: 'sepal.io'})
        jest.spyOn(sandboxProxy._proxy, 'web').mockResolvedValue()

        const req = {
            originalUrl: '/api/sandbox/shiny/foo/bar',
            url: '/api/sandbox/shiny/foo/bar',
            headers: {
                'sepal-user': sepalUserHeader('bob'),
                referer: 'https://sepal.io/api/sandbox/shiny/foo/'
            }
        }
        const res = {
            status: code => {
                res.statusCode = code
                return {send: body => { res.body = body }}
            },
            on: jest.fn() // middleware registers a 'close' cleanup on the real ServerResponse
        }
        await sandboxProxy.middleware(req, res)

        expect(resolveTarget).toHaveBeenCalledWith(
            'bob', 'shiny', '/api/sandbox/shiny/foo/bar', 'https://sepal.io/api/sandbox/shiny/foo/'
        )
    })

    test('ws upgrade passes the request pathname and referer to resolveTarget', async () => {
        const resolveTarget = jest.fn(async () => ({host: 'sandbox-host', port: 8787}))
        const sandboxProxy = createSandboxProxy({resolveTarget, sepalHost: 'sepal.io'})
        jest.spyOn(sandboxProxy._proxy, 'ws').mockResolvedValue()

        const req = {
            url: '/api/sandbox/rstudio/ws',
            headers: {referer: 'https://sepal.io/api/sandbox/rstudio/'}
        }
        const socket = {write: jest.fn(), destroy: jest.fn()}
        await sandboxProxy.upgrade(req, socket, Buffer.alloc(0), 'alice')

        expect(resolveTarget).toHaveBeenCalledWith(
            'alice', 'rstudio', '/api/sandbox/rstudio/ws', 'https://sepal.io/api/sandbox/rstudio/'
        )
    })
})
