require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

const {port} = require('./config')
const routes = require('./routes')
const server = require('#sepal/httpServer')
const {initScheduler} = require('#sepal/worker/scheduler')

const main = async () => {
    await server.start({
        port,
        routes
    })

    initScheduler()
    
    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
