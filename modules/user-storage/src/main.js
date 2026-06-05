import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer} from '#sepal/log'
configureServer(logConfig)

import {getLogger} from '#sepal/log'
const log = getLogger('main')

import _ from 'lodash'

import {initMessageQueue} from '#sepal/messageQueue'
import * as server from '#sepal/httpServer'
import {amqpUri, port} from './config.js'
import {scanComplete$, startStorageCheck} from './storageCheck.js'
import {messageHandler} from './messageHandler.js'
import {initializeDatabase} from './database.js'
import {routes} from './routes.js'
import {email$} from './email.js'
import {startInactivityCheck} from './inactivityCheck.js'

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
    await server.start({port, routes})
    await startStorageCheck()
    await startInactivityCheck()

    log.info('Initialized')
}

main().catch(log.fatal)
