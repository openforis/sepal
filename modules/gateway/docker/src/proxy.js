const {authMiddleware} = require('./auth')
const {createProxyMiddleware} = require('http-proxy-middleware')
const log = require('sepal/log').getLogger('gateway')
const {endpoints} = require('./endpoints')

const proxyEndpoints = app => endpoints.forEach(proxy(app))

const proxy = app =>
    ({path, target, authenticate, cache, noCache, rewrite}) => {
        const proxyMiddleware = createProxyMiddleware({
            target,
            pathRewrite: {[`^${path}`]: ''},
            changeOrigin: true,
            autoRewrite: !!rewrite,
            ws: true,
            onProxyReq: (proxyReq, req, res) => {
                req.socket.on('close', () => {
                    const user = req.session.user
                    log.trace(`[${user ? user.username : 'not-authenticated'}] [${req.originalUrl}] Response closed`)
                    proxyReq.destroy()
                })
                if (authenticate) {
                    proxyReq.setHeader('sepal-user', JSON.stringify(req.session.user))
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
