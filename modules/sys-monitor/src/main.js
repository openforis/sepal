require('#sepal/log').configureServer(require('./log.json'))
const log = require('#sepal/log').getLogger('main')

const _ = require('lodash')

const {initMessageQueue} = require('#sepal/messageQueue')
const {amqpUri, initialDelayMinutes, notifyFrom, notifyTo} = require('./config')
const {start} = require('./logMonitor')
const {email$} = require('./email')

const main = async () => {
    await initMessageQueue(amqpUri, {
        publishers: [{key: 'email.send', publish$: email$}]
    })
    
    if (initialDelayMinutes) {
        log.info(`Starting in ${initialDelayMinutes}m`)
    }
    setTimeout(start, initialDelayMinutes * 60 * 1000)

    log.info(`Notifications will be sent from: ${notifyFrom}, to: ${notifyTo}`)
}

main().catch(log.fatal)
