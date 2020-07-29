require('sepal/log').configureServer(require('./log.json'))

const _ = require('lodash')

const {initMessageQueue} = require('./messageQueue')
const {scheduleFullScan, scheduleRescan} = require('./scan')
const {onScanComplete, logStats} = require('./jobQueue')
const {setSessionActive, setSessionInactive} = require('./persistence')

const main = async () => {
    const {topicSubscriber, topicPublisher} = await initMessageQueue()

    const publisher = await topicPublisher()

    onScanComplete(
        ({username, size}) => publisher.publish('userStorage.size', {username, size})
    )

    const handlers = {
        workerSession: {
            'WorkerSessionActivated': async ({username}) => {
                await setSessionActive(username)
                await scheduleRescan({username, type: 'sessionActivated'})
            },
            'WorkerSessionClosed': async ({username}) => {
                await setSessionInactive(username)
                await scheduleRescan({username, type: 'sessionDeactivated'})
            }
        },
        files: {
            'FilesDeleted': async ({username}) =>
                await scheduleRescan({username, type: 'fileDeleted'})
        }
    }

    const handler = async (key, msg) => {
        const handler = _.get(handlers, key)
        return handler && await handler(msg)
    }

    await topicSubscriber({
        queue: 'userStorage.workerSession',
        topic: 'workerSession.#',
        handler
    })
    
    await topicSubscriber({
        queue: 'userStorage.files',
        topic: 'files.#',
        handler
    })
    
    await scheduleFullScan()
    await logStats()
}

main()
