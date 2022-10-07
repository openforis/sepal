const {Auth} = require('./auth')
const {createProxyMiddleware} = require('http-proxy-middleware')
const {rewriteLocation} = require('./rewrite')
const {endpoints} = require('./endpoints')
const {categories: {proxy: sepalLogLevel}} = require('./log.json')
const {sepalHost} = require('./config')
const modules = require('./modules')
const {get$} = require('sepal/httpClient')
const {EMPTY, from, map, switchMap} = require('rxjs')
const {getRequestUser, SEPAL_USER_HEADER} = require('./user')
const proxyLog = require('sepal/log').getLogger('proxy')
const log = require('sepal/log').getLogger('gateway')

const currentUserUrl = `http://${modules.user}/current`

const logProvider = () => ({
    log: proxyLog.debug,
    debug: proxyLog.trace,
    info: proxyLog.info,
    warn: proxyLog.warn,
    error: proxyLog.error
})

const logLevel = sepalLogLevel === 'trace'
    ? 'debug'
    : sepalLogLevel

const Proxy = userStore => {
    const {authMiddleware} = Auth(userStore)
    
    const proxy = app =>
        ({path, target, proxyTimeout = 60 * 1000, timeout = 61 * 1000, authenticate, cache, noCache, rewrite}) => {
            const proxyMiddleware = createProxyMiddleware(path, {
                target,
                logProvider,
                logLevel,
                proxyTimeout,
                timeout,
                pathRewrite: {[`^${path}`]: ''},
                onOpen: () => {
                    log.trace('WebSocket opened')
                },
                onClose: () => {
                    log.trace('WebSocket closed')
                },
                onProxyReq: (proxyReq, req) => {
                    // Make sure the client doesn't inject the user header, and pretend to be another user.
                    proxyReq.removeHeader(SEPAL_USER_HEADER)
                    const user = getRequestUser(req)
                    const username = user ? user.username : 'not-authenticated'
                    req.socket.on('close', () => {
                        log.trace(`[${username}] [${req.originalUrl}] Response closed`)
                        proxyReq.destroy()
                    })
                    if (authenticate && user) {
                        log.trace(`[${username}] [${req.originalUrl}] Setting sepal-user header`, user)
                        proxyReq.setHeader(SEPAL_USER_HEADER, JSON.stringify(user))
                    } else {
                        log.trace(`[${username}] [${req.originalUrl}] No sepal-user header set`)
                    }
                    if (cache) {
                        log.trace(`[${username}] [${req.originalUrl}] Enabling caching`)
                        proxyReq.setHeader('Cache-Control', 'public, max-age=31536000')
                    }
                    if (noCache) {
                        log.trace(`[${username}] [${req.originalUrl}] Disabling caching`)
                        proxyReq.removeHeader('If-None-Match')
                        proxyReq.removeHeader('If-Modified-Since')
                        proxyReq.removeHeader('Cache-Control')
                        proxyReq.setHeader('Cache-Control', 'no-cache')
                        proxyReq.setHeader('Cache-Control', 'max-age=0')
                    }
                },
                onProxyRes: (proxyRes, req) => {
                    if (rewrite) {
                        const location = proxyRes.headers['location']
                        if (location) {
                            const rewritten = rewriteLocation({path, target, location})
                            log.debug(() => `Rewriting location header from "${location}" to "${rewritten}"`)
                            proxyRes.headers['location'] = rewritten
                        }
                    }
                    if (proxyRes.headers['sepal-user-updated']) {
                        updateUser(req)
                    }
                    proxyRes.headers['Content-Security-Policy'] = `connect-src 'self' https://${sepalHost} wss://${sepalHost} https://*.googleapis.com https://apis.google.com https://www.google-analytics.com https://*.google.com https://*.planet.com https://registry.npmjs.org; frame-ancestors 'self' https://${sepalHost} https://*.googleapis.com https://apis.google.com https://*.google-analytics.com https://registry.npmjs.org`
                }
            })
    
            app.use(path, ...(authenticate
                ? [authMiddleware, proxyMiddleware]
                : [proxyMiddleware])
            )
            return {path, target, proxy: proxyMiddleware}
        }
    
    const updateUser = req => {
        const user = getRequestUser(req)
        if (user) {
            log.debug(`[${user.username}] [${req.url}] Updating user in user store`)
            return get$(currentUserUrl, {
                headers: {SEPAL_USER_HEADER: JSON.stringify(user)}
            }).pipe(
                map((({body}) => JSON.parse(body))),
                switchMap(user => {
                    log.debug(() => `[${user.username}] [${req.url}] Updated user in user store`)
                    return from(userStore.setUser(user))
                })
            ).subscribe({
                error: error => log.error(`[${user.username}] [${req.url}] Failed to load current user`, error)
            })
        } else {
            log.warn('[not-authenticated] Updated user, but no user in user store')
            return EMPTY
        }
    }
    
    const proxyEndpoints = app => endpoints.map(proxy(app))

    return {proxyEndpoints}
}

module.exports = {Proxy}
