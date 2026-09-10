import logConfig from '#config/log.json' with {type: 'json'}
import * as server from '#sepal/httpServer'
import {configureServer, getLogger} from '#sepal/log'
import {initMessageQueue} from '#sepal/messageQueue'

import {amqpUri, port} from './config.js'
import {initializeDb} from './db.js'
import {email$} from './email.js'
import {HistoryRepository} from './historyRepository.js'
import {InactivityCheck} from './inactivityCheck.js'
import {normalizeCase} from './kvstore.js'
import {createMessageHandler} from './messageHandler.js'
import {createRoutes} from './routes.js'
import {scanComplete$, startStorageCheck} from './storageCheck.js'

configureServer(logConfig)

const log = getLogger('main')

const main = async () => {
    const db = await initializeDb()
    const repository = new HistoryRepository(db)
    const inactivityCheck = new InactivityCheck({repository})

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
        handler: createMessageHandler({
            cancelInactivityCheck: event => inactivityCheck.cancelInactivityCheck(event),
            scheduleInactivityCheck: event => inactivityCheck.scheduleInactivityCheck(event)
        })
    })

    try {
        await normalizeCase()
        await inactivityCheck.normalizeCase()
    } catch (error) {
        log.error('Cannot normalize username case in Redis, continuing', error)
    }

    await server.start({port, routes: createRoutes(repository)})
    await startStorageCheck()
    await inactivityCheck.startInactivityCheck()

    log.info('Initialized')
}

main().catch(log.fatal)
