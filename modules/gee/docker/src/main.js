require('sepalLog/configure')(require('./log4js.json'))

const config = require('./config')
const routes = require('./routes')
const server = require('sepalHttpServer')

server.start({
    port: config.port,
    routes
})
