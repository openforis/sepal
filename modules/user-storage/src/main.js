import _ from 'lodash'

import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'

import {amqpUri, port} from './config.js'
import {initializeDatabase} from './database.js'
import {email$} from './email.js'
import {normalizeCase as normalizeInactivityCase, startInactivityCheck} from './inactivityCheck.js'
import {normalizeCase} from './kvstore.js'
import {messageHandler} from './messageHandler.js'
import {routes} from './routes.js'
import {scanComplete$, startStorageCheck} from './storageCheck.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'userStorage.size', publish$: scanComplete$},
            {key: 'email.sendToUser', publish$: email$}
        ],
        subscribers: [
            {queue: 'userStorage.systemEvent', topic: 'systemEvent'},
            {queue: 'userStorage.workerSession', topic: 'workerSession.#'},
            {queue: 'userStorage.files', topic: 'files.#'},
        ],
        handler: messageHandler
    })

    await initializeDatabase()

    try {
        await normalizeCase()
        await normalizeInactivityCase()
    } catch (error) {
        log.error('Cannot normalize username case in Redis, continuing', error)
    }

    await server.start({port, routes})
    await startStorageCheck()
    await startInactivityCheck()

    log.info('Initialized')
}

main().catch(log.fatal)
