require('#sepal/log').configureServer(require('./log.json'))
const log = require('#sepal/log').getLogger('main')

const {amqpUri, port} = require('./config')
const routes = require('./routes')
const server = require('#sepal/httpServer')
const {monitorApps} = require('./apps')
const {metrics$, startMetrics} = require('#sepal/metrics')
const {initMessageQueue} = require('#sepal/messageQueue')

const main = async () => {
    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'metrics', publish$: metrics$},
        ]
    })

    await server.start({
        port,
        routes
    })

    monitorApps()

    startMetrics()

    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
