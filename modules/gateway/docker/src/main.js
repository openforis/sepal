// require('sepal/log').configureServer(require('./log.json'))
// const {port, secure} = require('./config')
// const express = require('express')
// const session = require('express-session')
// const {logout} = require('./logout')
// const {proxyEndpoints} = require('./proxy')
//
// const app = express()
//
// app.use(session({
//     secret: Math.random().toString(),
//     name: 'SEPAL-SESSIONID',
//     resave: false,
//     saveUninitialized: false,
//     httpOnly: false,
//     cookie: {secure: false}
//     // cookie: {secure}
// }))
// app.use('/api/user/logout', logout)
// proxyEndpoints(app)
// app.listen(port)
//
