require('sepal/log').configureServer(require('./log.json'))

const _ = require('lodash')

const {connect$} = require('./messageQueue')
const {scheduleFullScan} = require('./scan')
const {onScanComplete, logStats} = require('./jobQueue')
const {messageHandler} = require('./messageHandler')

const initialize = async ({topicSubscriber, topicPublisher}) => {
    const publisher = await topicPublisher()

    onScanComplete(
        ({username, size}) => publisher.publish('userStorage.size', {username, size})
    )

    await topicSubscriber({
        queue: 'userStorage.workerSession',
        topic: 'workerSession.#',
        handler: messageHandler
    })
    
    await topicSubscriber({
        queue: 'userStorage.files',
        topic: 'files.#',
        handler: messageHandler
    })
    
    await scheduleFullScan()
    await logStats()
}

connect$().subscribe(
    connection => initialize(connection)
)
