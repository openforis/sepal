require('#sepal/log').configureServer(require('./log.json'))
const log = require('#sepal/log').getLogger('main')

const server = require('#sepal/httpServer')
const routes = require('./routes')
const {amqpUri, port} = require('./config')
const {initMessageQueue} = require('#sepal/messageQueue')
const {metrics$, startMetrics} = require('#sepal/metrics')

const main = async () => {
    // await initMessageQueue(amqpUri, {
    //     publishers: [
    //         {key: 'metrics', publish$: metrics$},
    //     ]
    // })

    await server.start({
        port,
        routes
    })

    // startMetrics()

    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
