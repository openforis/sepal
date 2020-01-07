require('sepalLog/configure')(require('./log4js.json'))

const config = require('./config')
const server = require('sepalHttpServer')
const routes = require('./routes')

server.start({
    port: config.port,
    routes
})
