import {createProxyServer} from 'httpxy'
import {parse} from 'url'

import {getLogger} from '#sepal/log'

import {rewriteLocation} from '../rewrite.js'
import {getRequestUser} from '../user.js'

const defaultLog = getLogger('sandboxProxy')

// endpoint → sandbox-container port (mirror sandboxSessionManager.PORT_BY_ENDPOINT).
const PORT_BY_ENDPOINT = {
    rstudio: 8787,
    shiny: 3838,
    jupyter: 8888
}

// jupyter keeps the full /api/sandbox/jupyter/... path (its base_url); the others are stripped.
const KEEPS_PREFIX = {jupyter: true}

const SANDBOX_PREFIX = '/api/sandbox'

// Long timeout for interactive/streaming sandboxes (≥ 15 min — /api/gee is 10 min).
const DEFAULT_PROXY_TIMEOUT = 15 * 60 * 1000
const DEFAULT_TIMEOUT = 16 * 60 * 1000

// /api/sandbox/{endpoint}/{rest} → {endpoint, upstreamPath}. jupyter keeps the full pathname (it
// is its base_url); rstudio/shiny are served at the container root, so the whole prefix is stripped.
const parseSandboxPath = pathname => {
    const rest = pathname.slice(SANDBOX_PREFIX.length)
    const match = rest.match(/^\/([^/?]+)/)
    const endpoint = match ? match[1] : null
    if (!endpoint) {
        return {endpoint: null}
    }
    const afterEndpoint = rest.slice(endpoint.length + 1)
    const upstreamPath = KEEPS_PREFIX[endpoint]
        ? pathname // jupyter: /api/sandbox/jupyter/...
        : (afterEndpoint || '/') // rstudio/shiny: root-served, whole /api/sandbox/{endpoint} stripped
    return {endpoint, upstreamPath}
}

const splitUrl = url => {
    const queryIndex = url.indexOf('?')
    return queryIndex === -1
        ? {pathname: url, search: ''}
        : {pathname: url.slice(0, queryIndex), search: url.slice(queryIndex)}
}

const isKnownEndpoint = endpoint =>
    Object.prototype.hasOwnProperty.call(PORT_BY_ENDPOINT, endpoint)

const endpointBasePath = endpoint => `${SANDBOX_PREFIX}/${endpoint}`

const targetOrigin = ({host, port}) => `http://${host}:${port}`

// Strip the origin from a Location pointing at the request's own (public) host, so it is rewritten
// under the endpoint base path like a relative one — rstudio builds ABSOLUTE redirects from the
// forwarded Host header. Foreign-host Locations are left alone.
const stripPublicOrigin = (location, requestHost) => {
    const locationUrl = parse(location)
    if (!locationUrl.hostname || !requestHost) {
        return location
    }
    const requestHostname = parse(`http://${requestHost}`).hostname
    return locationUrl.hostname === requestHostname
        ? `${locationUrl.path || '/'}${locationUrl.hash || ''}`
        : location
}

// Permissive frame-ancestors (matching proxy.js) so the sandbox apps embed in the SEPAL iframe.
// X-Frame-Options is removed too — a stale DENY/SAMEORIGIN there overrides the CSP in some browsers.
const securityHeaders = sepalHost => ({
    'Content-Security-Policy': `frame-ancestors 'self' https://${sepalHost}`,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
})

const createSandboxProxy = ({
    resolveTarget,
    ensureServerStarted,
    sepalHost,
    proxyTimeout = DEFAULT_PROXY_TIMEOUT,
    timeout = DEFAULT_TIMEOUT,
    log = defaultLog
} = {}) => {
    if (typeof resolveTarget !== 'function') {
        throw new Error('sandboxProxy: resolveTarget function is required')
    }
    if (typeof ensureServerStarted !== 'function') {
        throw new Error('sandboxProxy: ensureServerStarted function is required')
    }

    // selfHandleResponse:false streams the response through untouched; headers are mutated in the
    // proxyRes event. changeOrigin MUST stay false: Jupyter's same-origin check compares the browser's
    // Origin against Host and 404s every non-GET API request and kernel-channel ws upgrade on mismatch
    // ("Error Starting Kernel (Not Found)"), so the container must see the client's original Host.
    const proxy = createProxyServer({
        selfHandleResponse: false,
        ws: true,
        changeOrigin: false,
        // No target path on the proxy: we set req.url to the exact upstream path, and httpxy joins
        // an empty target.pathname with req.url → req.url verbatim.
        prependPath: false,
        proxyTimeout,
        timeout
    })

    proxy.on('proxyRes', (proxyRes, req) => {
        const {endpoint} = req._sandbox || {}
        if (endpoint && !KEEPS_PREFIX[endpoint]) {
            const location = proxyRes.headers['location']
            if (location) {
                const publicLocation = stripPublicOrigin(location, req.headers && req.headers.host)
                let rewritten = rewriteLocation({
                    path: endpointBasePath(endpoint),
                    target: targetOrigin(req._sandbox.target),
                    location: publicLocation
                })
                // rewriteLocation rewrites only the path; re-append the Location's query string when the rewrite
                // dropped one the original had.
                const queryIndex = publicLocation.indexOf('?')
                if (queryIndex !== -1 && !rewritten.includes('?')) {
                    rewritten += publicLocation.slice(queryIndex)
                }
                log.debug(() => `Rewriting sandbox location "${location}" → "${rewritten}"`)
                proxyRes.headers['location'] = rewritten
            }
        }
        delete proxyRes.headers['x-frame-options']
        delete proxyRes.headers['X-Frame-Options']
        // No caching for interactive content.
        proxyRes.headers['Cache-Control'] = 'no-cache, max-age=0'
        for (const [name, value] of Object.entries(securityHeaders(sepalHost))) {
            proxyRes.headers[name] = value
        }
    })

    proxy.on('error', (error, req, res) => {
        log.error(`Sandbox proxy error for "${req && req.url}":`, error)
        // res is a ServerResponse for web, a Socket for ws.
        if (res && res.writeHead && !res.headersSent) {
            res.writeHead(502, 'Bad Gateway', {'Content-Type': 'text/plain'})
            res.end('Sandbox unavailable')
        } else if (res && res.destroy) {
            res.destroy()
        }
    })

    const resolve = async (username, url, req) => {
        const {pathname} = splitUrl(url)
        const {endpoint, upstreamPath} = parseSandboxPath(pathname)
        if (!endpoint || !isKnownEndpoint(endpoint)) {
            return {status: 404, reason: 'Unknown sandbox endpoint'}
        }
        if (!username) {
            return {status: 400, reason: 'Not authenticated'}
        }
        const target = await resolveTarget(username, endpoint, pathname, req.headers?.referer)
        if (!target) {
            return {status: 400, reason: 'Endpoint must be started'}
        }
        return {endpoint, upstreamPath, target}
    }

    // The sandbox servers are started on first use, so the server behind a freshly resolved target
    // may not be listening yet. Ensuring BEFORE proxying rather than retrying a refused connection
    // is what keeps this simple: httpxy has already begun consuming the request stream by the time
    // an error surfaces, so a bodied request could never be replayed. ensureServerStarted is
    // memoized per (session, endpoint), so this costs a worker round-trip once and a Set lookup
    // thereafter.
    const ensureStarted = (username, resolution) =>
        ensureServerStarted({
            username,
            sessionId: resolution.target.sessionId,
            endpoint: resolution.endpoint
        })

    const applyResolution = (req, resolution) => {
        const {search} = splitUrl(req.url)
        req._sandbox = {endpoint: resolution.endpoint, target: resolution.target}
        req.url = `${resolution.upstreamPath}${search}`
    }

    const middleware = async (req, res, next) => {
        try {
            const user = getRequestUser(req)
            const username = user && user.username
            // req.originalUrl is the pre-mount URL under Express; req.url may be mount-relative.
            const url = req.originalUrl || req.url
            const resolution = await resolve(username, url, req)
            if (resolution.status) {
                log.debug(() => `Sandbox request rejected (${resolution.status}): ${resolution.reason} [${url}]`)
                res.status
                    ? res.status(resolution.status).send(resolution.reason)
                    : res.writeHead(resolution.status).end(resolution.reason)
                return
            }
            applyResolution(req, resolution)
            try {
                await ensureStarted(username, resolution)
            } catch (error) {
                log.error(`Failed to start sandbox ${resolution.endpoint} for ${username}`, error)
                res.status
                    ? res.status(502).send('Sandbox unavailable')
                    : res.writeHead(502).end('Sandbox unavailable')
                return
            }
            log.debug(() => `${username} → sandbox ${resolution.endpoint} ${targetOrigin(resolution.target)}${req.url}`)
            // httpxy adds a per-request 'timeout' listener via req.socket.setTimeout(msecs, cb)
            // that only auto-removes if it fires; clear it so it doesn't pile up on keep-alive
            // (same mitigation as proxy.js).
            res.on('close', () => req.socket?.removeAllListeners('timeout'))
            await proxy.web(req, res, {target: targetOrigin(resolution.target)})
        } catch (error) {
            log.error('Sandbox proxy middleware error', error)
            if (next) {
                next(error)
            } else if (!res.headersSent) {
                res.writeHead(500).end('Sandbox proxy error')
            }
        }
    }

    // Resolves the same dynamic target and tunnels the ws to ws://{host}:{port}/{upstreamPath}. This is
    // the critical path: the RStudio console and Jupyter kernel channels are websockets.
    const upgrade = async (req, socket, head, username) => {
        const url = req.url
        let resolution
        try {
            resolution = await resolve(username, url, req)
        } catch (error) {
            // A THROW from resolveTarget must not escape as an unhandled rejection: close the socket
            // (there is no ServerResponse on the ws path) — mirror the null/rejected handling below.
            log.error(`Sandbox ws upgrade resolve failed [${url}]:`, error)
            socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
            socket.destroy()
            return
        }
        if (resolution.status) {
            log.warn(() => `Rejecting sandbox ws upgrade (${resolution.status}): ${resolution.reason} [${url}]`)
            const statusText = resolution.status === 404 ? 'Not Found' : 'Bad Request'
            socket.write(`HTTP/1.1 ${resolution.status} ${statusText}\r\n\r\n`)
            socket.destroy()
            return
        }
        applyResolution(req, resolution)
        try {
            await ensureStarted(username, resolution)
        } catch (error) {
            log.error(`Failed to start sandbox ${resolution.endpoint} for ${username}`, error)
            socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n')
            socket.destroy()
            return
        }
        log.debug(() => `${username} → sandbox ws ${resolution.endpoint} ws://${resolution.target.host}:${resolution.target.port}${req.url}`)
        // httpxy signature: ws(req, socket, opts, head).
        await proxy.ws(req, socket, {target: targetOrigin(resolution.target)}, head)
    }

    const matches = url => {
        const {pathname} = splitUrl(url || '')
        return pathname === SANDBOX_PREFIX || pathname.startsWith(`${SANDBOX_PREFIX}/`)
    }

    return {
        middleware,
        upgrade,
        matches,
        _proxy: proxy,
        _resolve: resolve,
        PORT_BY_ENDPOINT
    }
}

export {createSandboxProxy, parseSandboxPath, PORT_BY_ENDPOINT, SANDBOX_PREFIX}
