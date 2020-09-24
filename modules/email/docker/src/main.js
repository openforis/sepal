require('sepal/log').configureServer(require('./log.json'))
const log = require('sepal/log').getLogger('main')
const {amqpUri} = require('./config')
const _ = require('lodash')
const {messageQueue$} = require('sepal/messageQueue')
const {logStats} = require('./emailQueue')
const {messageHandler} = require('./messageHandler')

const main = async () => {
    const initialize = async ({topicSubscriber}) => {
        await topicSubscriber({
            queue: 'email.send',
            topic: 'email.send',
            handler: messageHandler
        })
        await topicSubscriber({
            queue: 'user.emailNotificationsEnabled',
            topic: 'user.emailNotificationsEnabled',
            handler: messageHandler
        })
        await logStats()
        log.info('Initialized')
    }
    
    await messageQueue$(amqpUri).subscribe(
        connection => initialize(connection)
    )
}

main().catch(log.error)
