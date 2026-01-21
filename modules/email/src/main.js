require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

const _ = require('lodash')

const {initMessageQueue} = require('#sepal/messageQueue')
const {amqpUri, port} = require('./config')
const server = require('#sepal/httpServer')
const {initQueue} = require('./emailQueue')
const {messageHandler} = require('./messageHandler')

const main = async () => {
    await initMessageQueue(amqpUri, {
        subscribers: [
            {queue: 'email.sendToAddress', topic: 'email.sendToAddress', handler: messageHandler},
            {queue: 'email.sendToUser', topic: 'email.sendToUser', handler: messageHandler},
            {queue: 'email.emailNotificationsEnabled', topic: 'user.emailNotificationsEnabled', handler: messageHandler}
        ]
    })

    await server.start({port})

    await initQueue()
    
    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
