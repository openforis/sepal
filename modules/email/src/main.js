import _ from 'lodash'

import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'

import {clearEmailNotificationsEnabled} from './cache.js'
import {amqpUri, port} from './config.js'
import {initQueue} from './emailQueue.js'
import {messageHandler} from './messageHandler.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    // Preference updates published while no queue was bound to them were never applied to the cache.
    await clearEmailNotificationsEnabled()

    await initMessageQueue(amqpUri, {
        subscribers: [
            {queue: 'email.sendToAddress', topic: 'email.sendToAddress', handler: messageHandler},
            {queue: 'email.sendToUser', topic: 'email.sendToUser', handler: messageHandler},
            {queue: 'email.userUpdated', topic: 'user.UserUpdated', handler: messageHandler}
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
