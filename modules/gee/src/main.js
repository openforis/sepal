require('#sepal/log').configureServer(require('./log.json'))
const log = require('#sepal/log').getLogger('main')

const {port} = require('./config')
const routes = require('./routes')
const server = require('#sepal/httpServer')

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
