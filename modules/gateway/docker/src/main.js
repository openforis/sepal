require('sepal/log').configureServer(require('./log.json'))
const {port, secure} = require('./config')
const express = require('express')
const session = require('express-session')
const {logout} = require('./logout')
const {proxyEndpoints} = require('./proxy')

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
proxyEndpoints(app)
app.listen(port)
