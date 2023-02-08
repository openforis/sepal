require('#sepal/log').configureServer(require('./log.json'))
const log = require('#sepal/log').getLogger('main')

const _ = require('lodash')

const {initMessageQueue} = require('#sepal/messageQueue')
const {amqpUri} = require('./config')
const {scheduleFullScan} = require('./scan')
const {scanComplete$, logStats} = require('./jobQueue')
const {messageHandler} = require('./messageHandler')
const {metrics$, startMetrics} = require('#sepal/metrics')

const main = async () => {
    await initMessageQueue(amqpUri, {
        publishers: [
            {key: 'userStorage.size', publish$: scanComplete$},
            {key: 'metrics', publish$: metrics$}
        ],
        subscribers: [
            {queue: 'userStorage.workerSession', topic: 'workerSession.#', handler: messageHandler},
            {queue: 'userStorage.files', topic: 'files.#', handler: messageHandler}
        ]
    })

    await scheduleFullScan()
    await logStats()
 
    startMetrics()

    log.info('Initialized')
}

main().catch(log.fatal)
