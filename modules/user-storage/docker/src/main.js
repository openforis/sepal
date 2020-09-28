require('sepal/log').configureServer(require('./log.json'))
const log = require('sepal/log').getLogger('main')

const _ = require('lodash')

const {messageQueue} = require('sepal/messageQueue')
const {amqpUri} = require('./config')
const {scheduleFullScan} = require('./scan')
const {scanComplete$, logStats} = require('./jobQueue')
const {messageHandler} = require('./messageHandler')

const main = async () => {
    messageQueue(amqpUri, ({addPublisher, addSubscriber}) => {
        addPublisher('userStorage.size', scanComplete$)
        addSubscriber('userStorage.workerSession', 'workerSession.#', messageHandler)
        addSubscriber('userStorage.files', 'files.#', messageHandler)
    })

    await scheduleFullScan()
    await logStats()
    log.info('Initialized')
}

main().catch(log.fatal)
