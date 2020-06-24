require('sepal/log').configureServer(require('./log.json'))
const config = require('./config')
require('./context').setConfig(config)
const server = require('sepal/httpServer')
const routes = require('./routes')
// const {initializeEE$} = require('./ee/initialize')

// initializeEE$().subscribe(
//     () => server.start({
//         port: config.port,
//         routes
//     })
// )

server.start({
    port: config.port,
    routes
})
