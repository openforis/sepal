require('sepal/log').configureServer(require('./log.json'))
const log = require('sepal/log').getLogger('main')

const _ = require('lodash')

const {initMessageQueue} = require('sepal/messageQueue')
const {amqpUri, notifyFrom, notifyTo} = require('./config')
const {start} = require('./logMonitor')
const {email$} = require('./email')

const main = async () => {
    await initMessageQueue(amqpUri, {
        publishers: [{key: 'email.send', publish$: email$}]
    })
        
    start()

    log.info('Initialized')
    log.info(`Notifications will be sent from: ${notifyFrom}, to: ${notifyTo}`)
}

main().catch(log.fatal)
