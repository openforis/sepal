require('sepal/log').configureServer(require('./log.json'))

const {port} = require('./config')
const express = require('express')
const session = require('express-session')
const {authMiddleware} = require('./auth')
const {createProxyMiddleware} = require('http-proxy-middleware')

const {endpoints} = require('./endpoints')

const app = express()

// TODO: Remove - test in dev-env: curl 'http://localhost:8001/api/gee/test/worker/10000/10000/0'
app.use('/api/gee', createProxyMiddleware({
    target: 'http://localhost:5001',
    pathRewrite: {'/api/gee': ''}
}))

// app.use(session({
//     secret: Math.random().toString(),
//     name: 'SEPAL-SESSIONID',
//     resave: false,
//     saveUninitialized: false,
//     httpOnly: false,
//     cookie: {secure: false}
//     // cookie: {secure: true}
// }))
//
// const proxyEndpoint = ({prefix, path, target, authenticate, cache, noCache}) => {
//     const proxyMiddleware = createProxyMiddleware({
//         target,
//         pathRewrite: {[`^${path}`]: ''},
//         changeOrigin: true,
//         onProxyReq: (proxyReq, req) => {
//             if (authenticate) {
//                 proxyReq.setHeader('sepal-user', JSON.stringify(req.session.user))
//             }
//         }
//     })
//     app.use(path, ...(authenticate
//         ? [authMiddleware, proxyMiddleware]
//         : [proxyMiddleware])
//     )
// }
//
// endpoints.forEach(proxyEndpoint)

app.listen(port)

// TODO: Cancel on histogram not working as expected
// TODO: Secure session cookie
//      depend on deployment? fails in dev-env
// TODO: Logout
//      add separate middleware for that here /api/user/logout
// TODO: Non-prefix endpoints
// TODO: Cache headers for cache and noCache settings
// TODO: Endpoints for sandbox endpoints
// TODO: Rewrite some redirects (RStudio login)
// TODO: WebSockets
