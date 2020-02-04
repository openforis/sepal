require('sepal/log/configure').server(require('./log.json'))

const config = require('./config')
const routes = require('./routes')
const server = require('sepal/httpServer')

server.start({
    port: config.port,
    routes
})
