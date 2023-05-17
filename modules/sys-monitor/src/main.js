require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

const _ = require('lodash')

const {initMessageQueue} = require('#sepal/messageQueue')
const {amqpUri, port, initialDelayMinutes, notifyFrom, notifyTo} = require('./config')
const server = require('#sepal/httpServer')
const {start} = require('./logMonitor')
const {email$} = require('./email')

const main = async () => {
    await initMessageQueue(amqpUri, {
        publishers: [{key: 'email.send', publish$: email$}]
    })
    
    await server.start({port})

    if (initialDelayMinutes) {
        log.info(`Starting in ${initialDelayMinutes}m`)
    }
    setTimeout(start, initialDelayMinutes * 60 * 1000)

    log.info(`Notifications will be sent from: ${notifyFrom}, to: ${notifyTo}`)
}

main().catch(log.fatal)
