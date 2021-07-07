require('sepal/log').configureServer(require('./log.json'))
const {port} = require('./config')
const {isMatch} = require('micromatch')
const express = require('express')
const session = require('express-session')
const {logout} = require('./logout')
const {proxyEndpoints} = require('./proxy')
const {parse} = require('url')
const log = require('sepal/log').getLogger('gateway')

const app = express()
const sessionParser = session({
    secret: Math.random().toString(),
    name: 'SEPAL-SESSIONID',
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 30,
        sameSite: false,
        secure: false
    },
    proxy: true,
    resave: false,
    rolling: true,
    saveUninitialized: false,
    unset: 'destroy'
})
app.use(sessionParser)
app.use('/api/user/logout', logout)
const proxies = proxyEndpoints(app)
const server = app.listen(port)

server.on('upgrade', (req, socket, head) => {
    sessionParser(req, {}, () => { // Make sure we have access to session for the websocket
        const requestPath = parse(req.url).pathname
        const user = req.session.user
        const username = user ? user.username : 'not-authenticated'
        if (user) {
            log.trace(`[${username}] [${requestPath}] Setting sepal-user header`)
            req.headers['sepal-user'] = JSON.stringify(user)
        } else {
            log.warn(`[${username}] Websocket upgrade without a user`)
        }
        const {proxy, target} = proxies.find(({path}) => !path || requestPath === path || isMatch(requestPath, `${path}/**`)) || {}
        if (proxy) {
            log.debug(`[${username}] Requesting WebSocket upgrade for "${requestPath}" to target "${target}"`)
            proxy.upgrade(req, socket, head)
        } else {
            log.warn(`[${username}] No proxy found for WebSocket upgrade "${requestPath}"`)
        }
    })
})
