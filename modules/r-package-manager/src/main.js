require('sepal/log').configureServer(require('./log.json'))
const log = require('sepal/log').getLogger('main')
const {init} = require('./proxy')

// const {port} = require('./config')
// const routes = require('./routes')
// const server = require('sepal/httpServer')

const main = async () => {
    // await server.start({
    //     port,
    //     routes
    // })
    init()

    log.info('Initialized')
}

main().catch(log.fatal)
