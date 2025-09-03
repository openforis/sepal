const {createProxyMiddleware} = require('http-proxy-middleware')
const {filter, from, map, switchMap, toArray} = require('rxjs')
const url = require('url')
const {isMatch} = require('micromatch')
const {getRequestUser, setRequestUser} = require('./user')
const {usernameTag, urlTag} = require('./tag')
const {fetchAppsFromApi$} = require('./apiService')
const {sepalHost} = require('./config')

const log = require('#sepal/log').getLogger('proxy')

const proxyEndpoints$ = expressApp => fetchAppsFromApi$().pipe(
    switchMap(({apps}) => from(apps)),
    filter(({repository}) => repository),
    filter(({endpoint}) => endpoint === 'docker'),
    map(proxy(expressApp)),
    toArray()
)

const registerUpgradeListener = (server, proxies) => {
    // this was taken from gateway/src/main.js
    server.on('upgrade', (req, socket, head) => {
        const requestPath = url.parse(req.url).pathname
        const user = getRequestUser(req)
        if (!user) {
            // TODO: Return a 400
            log.error('Websocket upgrade without a user')
            return
        }
        // TODO: Maybe not needed
        setRequestUser(req, user)
        
        const proxyMatch = proxies
            .find(({path}) =>
                !path || requestPath === path || isMatch(requestPath, `${path}/**`)
            )
        
        const username = user.username
        if (proxyMatch) {
            const {proxy, target} = proxyMatch
            log.debug(`${usernameTag(username)} Requesting WebSocket upgrade for "${requestPath}" to target "${target}"`)
            proxy.upgrade(req, socket, head)
        } else {
            // TODO: Return a 400
            log.warn(`${usernameTag(username)} No proxy found for WebSocket upgrade "${requestPath}"`)
        }
    })
}

module.exports = {proxyEndpoints$, registerUpgradeListener}

const proxy = expressApp =>
    ({id, port}) => {
        const path = `/${id}`
        const target = `http://${id}:${port}`

        // This is to get the resourcez endpoint from solara - only for admin users (it returns the number of active users, etc.)
        expressApp.use(
            `${path}/resourcez`,
            (req, res, next) => {
                const user = getRequestUser(req)
                if (user && user.admin) {
                    next()
                } else {
                    log.warn(`[resourcez] unauthorized access attempt for ${req.originalUrl}`)
                    res.status(403).send('Forbidden: Admin access required')
                }
            },
            createProxyMiddleware({
                target,
                changeOrigin: true,
                pathRewrite: {
                    '^/': '/resourcez'
                },
                on: {
                    proxyReq: (proxyReq, req) => {
                        log.debug(`[resourcez] "${req.originalUrl}" → "${proxyReq.path}"`)
                    },
                    error: (err, req) => {
                        log.warn(`[resourcez] proxy error for ${req.originalUrl}:`, err)
                    }
                }
            })
        )

        const proxyMiddleware = createProxyMiddleware({
            target,
            pathRewrite: {'/': ''},
            proxyTimeout: 60 * 1000,
            timeout: 61 * 1000,
            logger: log,
            on: {
                proxyReq: (proxyReq, req, _res) => {
                    // Make sure the client doesn't inject the user header, and pretend to be another user.
                    const user = getRequestUser(req)
                    if (!user) {
                        // TODO: Return a 400 error
                        return
                    }
                    const username = user.username
                    req.socket.on('close', () => {
                        log.isTrace() && log.trace(`${usernameTag(username)} ${urlTag(req.originalUrl)} Response closed`)
                        proxyReq.destroy()
                    })

                    log.isTrace() && log.trace(`${usernameTag(username)} ${urlTag(req.originalUrl)} Setting sepal-user header`, user)
                    // TODO: Maybe not needed
                    // proxyReq.setHeader(SEPAL_USER_HEADER, JSON.stringify(user))
                },
                proxyReqWs: (proxyReq, _req, _socket, _options, _head) => {
                    // HACK: this is a workaround for stripping the base path in the websocket case
                    // https://github.com/chimurai/http-proxy-middleware/issues/978
                    proxyReq.path = proxyReq.path.replace(path, '')
                },
                proxyRes: (proxyRes, _req, _res) => {
                    proxyRes.headers['Content-Security-Policy'] = `connect-src 'self' https://${sepalHost} wss://${sepalHost} https://*.googleapis.com https://apis.google.com https://*.google-analytics.com https://*.google.com https://*.planet.com https://registry.npmjs.org; frame-ancestors 'self' https://${sepalHost} https://*.googleapis.com https://apis.google.com https://*.google-analytics.com https://registry.npmjs.org`
                    proxyRes.headers['X-Content-Type-Options'] = 'nosniff'
                    proxyRes.headers['Strict-Transport-Security'] = 'max-age=16000000; includeSubDomains; preload'
                    proxyRes.headers['Referrer-Policy'] = 'no-referrer'
                },
                error: (err, req, res) => {
                    log.warn(`${urlTag(req.originalUrl)} Proxy error:`, err)
                    log.error(Object.keys(res))

                    if (Object.keys(res).includes('writeHead')) {
                        res.writeHead(500, {
                            'Content-Type': 'text/plain'
                        })
                        res.end('Something went wrong.')
                    }
                },
                open: () => {
                    log.trace('WebSocket opened')
                },
                close: () => {
                    log.trace('WebSocket closed')
                }
            }
        })

        expressApp.use(path, proxyMiddleware)
        
        return {path, target, proxy: proxyMiddleware}
    }
