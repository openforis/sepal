require('sepal/log').configureServer(require('./log.json'))
const {port} = require('./config')
const {isMatch} = require('micromatch')
const express = require('express')
const session = require('express-session')
const {logout} = require('./logout')
const {proxyEndpoints} = require('./proxy')
const log = require('sepal/log').getLogger('proxy')

const app = express()

app.use(session({
    secret: Math.random().toString(),
    name: 'SEPAL-SESSIONID',
    httpOnly: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 30,
        sameSite: true,
        secure: false
    },
    proxy: true,
    resave: false,
    rolling: true,
    saveUninitialized: false,
    unset: 'destroy'
}))
app.use('/api/user/logout', logout)
const proxies = proxyEndpoints(app)
const server = app.listen(port)
server.on('upgrade', (res, socket, head) => {
    const url = res.url
    const {proxy} = proxies.find(({path}) => !path || isMatch(url, `${path}/**`)) || {}
    if (proxy) {
        proxy.upgrade(res, socket, head)
    } else {
        log.warn(`No proxy found for WebSocket upgrade "${url}"`)
    }
})
