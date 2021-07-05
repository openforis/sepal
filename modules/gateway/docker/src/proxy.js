const {authMiddleware} = require('./auth')
const {createProxyMiddleware} = require('http-proxy-middleware')
const {rewriteLocation} = require('./rewrite')
const {endpoints} = require('./endpoints')
const {categories: {proxy: sepalLogLevel}} = require('./log.json')
const {sepalHost} = require('./config')
const proxyLog = require('sepal/log').getLogger('proxy')
const log = require('sepal/log').getLogger('gateway')

const proxyEndpoints = app => endpoints.map(proxy(app))

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

const proxy = app =>
    ({path, target, prefix, authenticate, cache, noCache, rewrite}) => {
        const proxyMiddleware = createProxyMiddleware(path, {
            target,
            logProvider,
            logLevel,
            proxyTimeout: 0,
            timeout: 0,
            pathRewrite: {[`^${path}`]: ''},
            ignorePath: !prefix,
            changeOrigin: true,
            onOpen: () => {
                log.trace('WebSocket opened')
            },
            onClose: () => {
                log.trace('WebSocket closed')
            },
            onProxyReq: (proxyReq, req) => {
                const user = req.session && req.session.user
                const username = user ? user.username : 'not-authenticated'
                req.socket.on('close', () => {
                    log.trace(`[${username}] [${req.originalUrl}] Response closed`)
                    proxyReq.destroy()
                })
                if (authenticate && user) {
                    log.trace(`[${username}] [${req.originalUrl}] Setting sepal-user header`)
                    proxyReq.setHeader('sepal-user', JSON.stringify(user))
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
            onProxyRes: proxyRes => {
                if (rewrite) {
                    const location = proxyRes.headers['location']
                    if (location) {
                        const rewritten = rewriteLocation({path, target, location})
                        log.debug(`Rewriting location header from "${location}" to "${rewritten}"`)
                        proxyRes.headers['location'] = rewritten
                    }
                }
                proxyRes.headers['Content-Security-Policy'] = `connect-src 'self' https://${sepalHost} wss://${sepalHost} https://*.googleapis.com https://apis.google.com https://*.google.com https://*.planet.com; frame-ancestors 'self' https://$host https://*.googleapis.com https://apis.google.com`
            }
        })

        app.use(path, ...(authenticate
            ? [authMiddleware, proxyMiddleware]
            : [proxyMiddleware])
        )
        return {path, target, proxy: proxyMiddleware}
    }

module.exports = {proxyEndpoints}
