const {authMiddleware} = require('./auth')
const {createProxyMiddleware} = require('http-proxy-middleware')
const log = require('sepal/log').getLogger('gateway')
const {endpoints} = require('./endpoints')

const proxyEndpoints = app => endpoints.forEach(proxy(app))

const proxy = app =>
    ({path, target, authenticate, cache, noCache, rewrite, ws}) => {
        const proxyMiddleware = createProxyMiddleware({
            target,
            logLevel: 'debug',
            pathRewrite: {[`^${path}`]: ''},
            changeOrigin: true,
            autoRewrite: !!rewrite,
            ws,
            onOpen: proxySocket => {
                log.warn('onOpen')
            },
            onClose: (res, socket, head) => {
                log.warn('onClose')
            },
            onProxyReqWs: (proxyReq, req, socket, options, head) => {
                log.warn('onProxyReqWs', proxyReq.path)
            },
            onProxyReq: (proxyReq, req) => {
                const user = req.session.user
                req.socket.on('close', () => {
                    log.trace(`[${user ? user.username : 'not-authenticated'}] [${req.originalUrl}] Response closed`)
                    proxyReq.destroy()
                })
                if (authenticate && user) {
                    proxyReq.setHeader('sepal-user', JSON.stringify(user))
                }
                if (cache) {
                    proxyReq.setHeader('Cache-Control', 'public, max-age=31536000')
                }
                if (noCache) {
                    proxyReq.removeHeader('If-None-Match')
                    proxyReq.removeHeader('If-Modified-Since')
                    proxyReq.removeHeader('Cache-Control')
                    proxyReq.setHeader('Cache-Control', 'no-cache')
                    proxyReq.setHeader('Cache-Control', 'max-age=0')
                }
            }
        })
        app.use(path, ...(authenticate
            ? [authMiddleware, proxyMiddleware]
            : [proxyMiddleware])
        )
    }

module.exports = {proxyEndpoints}

// TODO: Non-prefix endpoints
