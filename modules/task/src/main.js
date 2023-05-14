require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

const server = require('#sepal/httpServer')
const routes = require('./routes')
const {port} = require('./config')

const main = async () => {
    await server.start({
        port,
        routes
    })

    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
