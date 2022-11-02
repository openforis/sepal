const {Auth} = require('./auth')
const {createProxyMiddleware} = require('http-proxy-middleware')
const {rewriteLocation} = require('./rewrite')
const {endpoints} = require('../config/endpoints')
const {categories: {proxy: sepalLogLevel}} = require('./log.json')
const {sepalHost} = require('./config')
const {getRequestUser, SEPAL_USER_HEADER} = require('./user')
const {usernameTag, urlTag} = require('./tag')
const log = require('sepal/log').getLogger('proxy')

const logProvider = () => log

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
                onProxyReq: (proxyReq, req, _res) => {
                    // Make sure the client doesn't inject the user header, and pretend to be another user.
                    proxyReq.removeHeader(SEPAL_USER_HEADER)
                    const user = getRequestUser(req)
                    const username = user ? user.username : 'not-authenticated'
                    req.socket.on('close', () => {
                        log.isTrace() && log.trace(`${usernameTag(username)} ${urlTag(req.originalUrl)} Response closed`)
                        proxyReq.destroy()
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
                        proxyReq.removeHeader('Cache-Control')
                        proxyReq.setHeader('Cache-Control', 'no-cache')
                        proxyReq.setHeader('Cache-Control', 'max-age=0')
                    }
                },
                onProxyRes: (proxyRes, req, _res) => {
                    if (rewrite) {
                        const location = proxyRes.headers['location']
                        if (location) {
                            const rewritten = rewriteLocation({path, target, location})
                            log.debug(() => `Rewriting location header from "${location}" to "${rewritten}"`)
                            proxyRes.headers['location'] = rewritten
                        }
                    }
                    if (proxyRes.headers['sepal-user-updated']) {
                        userStore.updateUser(req)
                    }
                    proxyRes.headers['Content-Security-Policy'] = `connect-src 'self' https://${sepalHost} wss://${sepalHost} https://*.googleapis.com https://apis.google.com https://www.google-analytics.com https://*.google.com https://*.planet.com https://registry.npmjs.org; frame-ancestors 'self' https://${sepalHost} https://*.googleapis.com https://apis.google.com https://*.google-analytics.com https://registry.npmjs.org`
                },
                onError: (err, req, _res) => {
                    log.warn(`${urlTag(req.originalUrl)} Proxy error:`, err)
                }
            })
    
            app.use(path, ...(authenticate
                ? [authMiddleware, proxyMiddleware]
                : [proxyMiddleware])
            )
            return {path, target, proxy: proxyMiddleware}
        }
        
    const proxyEndpoints = app => endpoints.map(proxy(app))

    return {proxyEndpoints}
}

module.exports = {Proxy}
