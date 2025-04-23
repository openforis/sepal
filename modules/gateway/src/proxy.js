const {createProxyMiddleware} = require('http-proxy-middleware')
const {Subject, from, mergeMap} = require('rxjs')
const {rewriteLocation} = require('./rewrite')
const {endpoints} = require('../config/endpoints')
const {sepalHost} = require('./config')
const {getRequestUser, SEPAL_USER_HEADER} = require('./user')
const {usernameTag, urlTag} = require('./tag')
const log = require('#sepal/log').getLogger('proxy')

const Proxy = (userStore, authMiddleware) => {

    const userUpdate$ = new Subject()
    
    userUpdate$.pipe(
        mergeMap(user => from(userStore.updateUser(user)))
    ).subscribe({
        error: error => log.error('Unexpected foo$ stream error', error),
        complete: () => log.error('Unexpected foo$ stream closed')
    })

    const proxy = app =>
        ({path, target, proxyTimeout = 60 * 1000, timeout = 61 * 1000, authenticate, cache, noCache, rewrite, _ws = false}) => {
            const proxyMiddleware = createProxyMiddleware({
                selfHandleResponse: false,
                target,
                pathRewrite: {'/': ''},
                proxyTimeout,
                timeout,
                logger: log,
                on: {
                    proxyReq: (proxyReq, req, _res) => {
                        // Make sure the client doesn't inject the user header, and pretend to be another user.
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
                    proxyReqWs: (proxyReq, _req, _socket, _options, _head) => {
                        // HACK: this is a workaround for stripping the base path in the websocket case
                        // https://github.com/chimurai/http-proxy-middleware/issues/978
                        proxyReq.path = proxyReq.path.replace(path, '')
                    },
                    proxyRes: (proxyRes, req, _res) => {
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
                        if (proxyRes.headers['sepal-user-updated']) {
                            userUpdate$.next(getRequestUser(req))
                        }
                    },
                    error: (error, req, res) => {
                        log.error(`${urlTag(req.originalUrl)} Proxy error:`, error)
                        res.writeHead(500, 'Something went wrong', {
                            'Content-Type': 'text/plain'
                        })
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
                ? [authMiddleware, proxyMiddleware]
                : [proxyMiddleware])
            )
            return {path, target, proxy: proxyMiddleware}
        }
        
    const proxyEndpoints = app => endpoints.map(proxy(app))

    return {proxyEndpoints}
}

module.exports = {Proxy}
