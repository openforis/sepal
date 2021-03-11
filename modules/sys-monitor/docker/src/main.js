require('sepal/log').configureServer(require('./log.json'))
const log = require('sepal/log').getLogger('main')

const _ = require('lodash')

const {messageQueue} = require('sepal/messageQueue')
const {amqpUri, notifyEmailAddress, notifyAtStartup} = require('./config')
const {start} = require('./logMonitor')
const {email$, notify} = require('./email')

const main = async () => {
    messageQueue(amqpUri, ({addPublisher, _addSubscriber}) => {
        addPublisher('email.send', email$)
    })

    start()

    log.info('Initialized')
    log.info(`Notifications will be sent to: ${notifyEmailAddress}`)

    if (notifyAtStartup) {
        log.info('Sending startup notification')
        notify({subject: 'SEPAL sys-monitor started'})
    }
}

main().catch(log.fatal)
