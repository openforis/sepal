require('sepal/log').configureServer(require('./log.json'))
const log = require('sepal/log').getLogger('main')

const _ = require('lodash')

const {messageQueue} = require('sepal/messageQueue')
const {amqpUri} = require('./config')
const {logStats} = require('./emailQueue')
const {messageHandler} = require('./messageHandler')

const main = async () => {
    messageQueue(amqpUri, ({addSubscriber}) => {
        addSubscriber('email.send', 'email.send', messageHandler)
        addSubscriber('user.emailNotificationsEnabled', 'user.emailNotificationsEnabled', messageHandler)
    })

    await logStats()
    log.info('Initialized')
}

main().catch(log.fatal)
