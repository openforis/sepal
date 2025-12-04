require('#sepal/log').configureServer(require('#config/log.json'))

const log = require('#sepal/log').getLogger('main')

const _ = require('lodash')

const {initMessageQueue} = require('#sepal/messageQueue')
const server = require('#sepal/httpServer')
const {amqpUri, port} = require('./config')
const {scheduleFullScan} = require('./scan')
const {scanComplete$, logStats: logScanQueueStats} = require('./scanQueue')
const {messageHandler} = require('./messageHandler')
const {initializeDatabase} = require('./database')
const {routes} = require('./routes')
const {email$} = require('./email')
const {setInitialized, getInitialized} = require('./kvstore')
const {logStats: logInactivityQueueStats, scheduleFullInactivityCheck} = require('./inactivityQueue')
const {getMostRecentAccess$} = require('./http')

const main = async () => {
    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'userStorage.size', publish$: scanComplete$},
            {key: 'email.sendToUser', publish$: email$}
        ],
        subscribers: [
            {queue: 'userStorage.systemEvent', topic: 'systemEvent', handler: messageHandler},
            {queue: 'userStorage.workerSession', topic: 'workerSession.#', handler: messageHandler},
            {queue: 'userStorage.files', topic: 'files.#', handler: messageHandler},
        ]
    })

    await initializeDatabase()

    await server.start({port, routes})

    if (!await getInitialized()) {
        await scheduleFullInactivityCheck()
        await setInitialized()
    }
    
    await scheduleFullScan()
    await logScanQueueStats()
    await logInactivityQueueStats()

    getMostRecentAccess$('lookap28').subscribe()

    log.info('Initialized')
}

main().catch(log.fatal)
