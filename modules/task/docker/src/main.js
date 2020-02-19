require('sepal/log').configureServer(require('./log.json'))
const server = require('sepal/httpServer')
const config = require('./config')
const routes = require('./routes')
const initializeEE$ = require('./ee/initialize')

initializeEE$().subscribe(
    () => server.start({
        port: config.port,
        routes
    })
)

