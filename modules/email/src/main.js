require('#sepal/log').configureServer(require('./log.json'))
const log = require('#sepal/log').getLogger('main')

const _ = require('lodash')

const {initMessageQueue} = require('#sepal/messageQueue')
const {amqpUri} = require('./config')
const {logStats} = require('./emailQueue')
const {messageHandler} = require('./messageHandler')

const main = async () => {
    await initMessageQueue(amqpUri, {
        subscribers: [
            {queue: 'email.send', topic: 'email.send', handler: messageHandler},
            {queue: 'email.emailNotificationsEnabled', topic: 'user.emailNotificationsEnabled', handler: messageHandler}
        ]
    })

    await logStats()
    
    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
