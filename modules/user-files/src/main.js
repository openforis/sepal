require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

// const {amqpUri, port} = require('./config')
const {port} = require('./config')
const routes = require('./routes')
// const {initMessageQueue} = require('#sepal/messageQueue')
// const {message$} = require('./messageService')
const server = require('#sepal/httpServer')
// const {initScheduler} = require('#sepal/worker/scheduler')

const main = async () => {
    // await initMessageQueue(amqpUri, {
    //     publishers: [
    //         {key: 'files.update', publish$: message$}
    //     ]
    // })

    await server.start({
        port,
        routes
    })

    // initScheduler({instances})
    
    log.info('Initialized')
}

main().catch(log.fatal)
