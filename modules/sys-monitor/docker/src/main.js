require('sepal/log').configureServer(require('./log.json'))
const log = require('sepal/log').getLogger('main')

const _ = require('lodash')

const {messageQueue} = require('sepal/messageQueue')
const {amqpUri, notifyEmailAddress} = require('./config')
const {start} = require('./logMonitor')
const {email$} = require('./email')

const main = async () => {
    messageQueue(amqpUri, ({addPublisher, _addSubscriber}) => {
        addPublisher('email.send', email$)
    })

    start()

    log.info('Initialized')
    log.info(`Notifications will be sent to: ${notifyEmailAddress}`)
}

main().catch(log.fatal)
