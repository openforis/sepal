require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

const _ = require('lodash')

const {initMessageQueue} = require('#sepal/messageQueue')
const server = require('#sepal/httpServer')
const {amqpUri, port} = require('./config')
const {scanComplete$, startStorageCheck} = require('./storageCheck')
const {messageHandler} = require('./messageHandler')
const {initializeDatabase} = require('./database')
const {routes} = require('./routes')
const {email$} = require('./email')
const {startInactivityCheck} = require('./inactivityCheck')

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
