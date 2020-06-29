require('sepal/log').configureServer(require('./log.json'))
const {getConfig} = require('./context')
const server = require('sepal/httpServer')
const routes = require('./routes')

const {port} = getConfig()

server.start({
    port,
    routes
})
