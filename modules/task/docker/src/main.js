require('sepalLog/configure')(require('./log4js.json'))

const server = require('sepalHttpServer')
const config = require('./config')
const routes = require('./routes')

server.start({
    port: config.port,
    routes
})
