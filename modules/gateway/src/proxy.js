const {createProxyMiddleware} = require('http-proxy-middleware')
const {Subject, catchError, mergeMap, EMPTY} = require('rxjs')
const {rewriteLocation} = require('./rewrite')
const {endpoints} = require('../config/endpoints')
const {sepalHost} = require('./config')
const {getRequestUser, SEPAL_USER_HEADER, SEPAL_USER_UPDATED_HEADER} = require('./user')
const {usernameTag, urlTag} = require('./tag')
const log = require('#sepal/log').getLogger('proxy')

const Proxy = (userStore, authMiddleware, googleAccessTokenMiddleware) => {

    const refreshUser$ = new Subject()
    
    refreshUser$.pipe(
        mergeMap(username =>
            userStore.updateUser$(username).pipe(
                catchError(error => {
                    log.error('Unexpected refreshUser$ error', error)
                    return EMPTY
                })
            )
        )
    ).subscribe({
        error: error => log.fatal('Unexpected refreshUser$ stream error', error),
        complete: () => log.fatal('Unexpected refreshUser$ stream closed')
    })

    const proxy = app =>
        ({path, target, proxyTimeout = 60 * 1000, timeout = 61 * 1000, authenticate, cache, noCache, rewrite, _ws = false}) => {
            // http-proxy-middleware v4 (httpxy) re-injects '/' when the request URL has no path
            // component, producing a stray slash when target.pathname is joined with a query-only
            // request. Compose the upstream path here and send only target.origin so httpxy has
            // nothing to join.
            const targetUrl = new URL(target)
            const targetPath = targetUrl.pathname === '/' ? '' : targetUrl.pathname
            const proxyMiddleware = createProxyMiddleware({
                selfHandleResponse: false,
                target: targetUrl.origin,
                pathRewrite: (_p, req) => {
                    const rest = req.originalUrl.slice(path.length)
                    const joinedPath = targetPath.endsWith('/') && rest.startsWith('/')
                        ? targetPath + rest.slice(1)
                        : targetPath + rest
                    return joinedPath.startsWith('/')
                        ? joinedPath
                        : '/' + joinedPath
                },
                proxyTimeout,
                timeout,
                logger: log,
                on: {
                    proxyReq: (proxyReq, req, res) => {
                        // Make sure the client doesn't inject the user header, and pretend to be another user.
                        const user = getRequestUser(req)
                        const username = user ? user.username : 'not-authenticated'
                        // Listen on res (per-response), not req.socket: with HTTP keep-alive the socket is
                        // shared across requests and accumulates listeners until MaxListeners fires.
                        res.on('close', () => {
                            if (!res.writableEnded) {
                                log.isTrace() && log.trace(`${usernameTag(username)} ${urlTag(req.originalUrl)} Client closed before response completed`)
                                proxyReq.destroy()
                            }
                            // httpxy adds a per-request 'timeout' listener via req.socket.setTimeout(msecs, cb)
                            // that only auto-removes if it fires; clear it so it doesn't pile up on keep-alive.
                            req.socket?.removeAllListeners('timeout')
                        })
                        if (authenticate && user) {
                            log.isTrace() && log.trace(`${usernameTag(username)} ${urlTag(req.originalUrl)} Setting sepal-user header`, user)
                            proxyReq.setHeader(SEPAL_USER_HEADER, JSON.stringify(user))
                        } else {
                            log.isTrace() && log.trace(`${usernameTag(username)} ${urlTag(req.originalUrl)} No sepal-user header set`)
                        }
                        if (cache) {
                            log.isTrace() && log.trace(`${usernameTag(username)} ${urlTag(req.originalUrl)} Enabling caching`)
                            proxyReq.setHeader('Cache-Control', 'public, max-age=31536000')
                        }
                        if (noCache) {
                            log.isTrace() && log.trace(`${usernameTag(username)} ${urlTag(req.originalUrl)} Disabling caching`)
                            proxyReq.removeHeader('If-None-Match')
                            proxyReq.removeHeader('If-Modified-Since')
                            proxyReq.setHeader('Cache-Control', 'no-cache, max-age=0')
                        }
                    },
                    proxyReqWs: (proxyReq, _req, _socket, _options, _head) => {
                        // HACK: this is a workaround for stripping the base path in the websocket case
                        // https://github.com/chimurai/http-proxy-middleware/issues/978
                        proxyReq.path = proxyReq.path.replace(path, '')
                    },
                    proxyRes: (proxyRes, _req, _res) => {
                        if (rewrite) {
                            const location = proxyRes.headers['location']
                            if (location) {
                                const rewritten = rewriteLocation({path, target, location})
                                log.debug(() => `Rewriting location header from "${location}" to "${rewritten}"`)
                                proxyRes.headers['location'] = rewritten
                            }
                        }
                        proxyRes.headers['Content-Security-Policy'] = `connect-src 'self' https://${sepalHost} wss://${sepalHost} https://*.googleapis.com https://apis.google.com https://*.google-analytics.com https://*.google.com https://*.planet.com https://registry.npmjs.org; frame-ancestors 'self' https://${sepalHost} https://*.googleapis.com https://apis.google.com https://*.google-analytics.com https://registry.npmjs.org`
                        proxyRes.headers['X-Content-Type-Options'] = 'nosniff'
                        proxyRes.headers['Strict-Transport-Security'] = 'max-age=16000000; includeSubDomains; preload'
                        proxyRes.headers['Referrer-Policy'] = 'no-referrer'
                        proxyRes.headers['Permissions-Policy'] = 'camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
                        if (proxyRes.headers[SEPAL_USER_UPDATED_HEADER]) {
                            refreshUser$.next(proxyRes.headers[SEPAL_USER_UPDATED_HEADER])
                        }
                    },
                    error: (error, req, res) => {
                        log.error(`${urlTag(req.originalUrl)} Proxy error:`, error)
                        if (res.writeHead && !res.headersSent) {
                            res.writeHead(500, 'Something went wrong', {
                                'Content-Type': 'text/plain'
                            })
                        }
                        res.end()
                    },
                    open: () => {
                        log.trace('WebSocket opened')
                    },
                    close: () => {
                        log.trace('WebSocket closed')
                    }
                }
            })
    
            app.use(path, ...(authenticate
                ? [authMiddleware, googleAccessTokenMiddleware, proxyMiddleware]
                : [proxyMiddleware])
            )
            return {path, target, proxy: proxyMiddleware}
        }
        
    const proxyEndpoints = app => endpoints.map(proxy(app))

    return {proxyEndpoints}
}

module.exports = {Proxy}
