require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

const server = require('#sepal/httpServer')
const routes = require('./routes')
const {port} = require('./config')
const {initScheduler} = require('#sepal/worker/scheduler')
const {STICKY} = require('#sepal/worker/staticPool')

const main = async () => {
    await server.start({
        port,
        routes
    })
    
    initScheduler({name: 'GoogleEarthEngine', strategy: STICKY, instances: 1})

    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
