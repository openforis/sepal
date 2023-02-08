require('#sepal/log').configureServer(require('./log.json'))
const log = require('#sepal/log').getLogger('main')

const {amqpUri, port} = require('./config')
const routes = require('./routes')
const {initMessageQueue} = require('#sepal/messageQueue')
const {message$} = require('./messageService')
const server = require('#sepal/httpServer')
const {metrics$, startMetrics} = require('#sepal/metrics')

const main = async () => {
    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'files.update', publish$: message$},
            {key: 'metrics', publish$: metrics$}
        ]
    })

    await server.start({
        port,
        routes
    })

    startMetrics()

    log.info('Initialized')
}

main().catch(log.fatal)
