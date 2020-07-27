require('sepal/log').configureServer(require('./log.json'))

const fs = require('fs')
const _ = require('lodash')
const log = require('sepal/log').getLogger('main')
const {homeDir} = require('./config')

const {initMessageQueue} = require('./messageQueue')
const {scheduleRescan} = require('./jobQueue')
const {setSessionActive, setSessionInactive, getUserStorage} = require('./persistence')

const fullScan = async path => {
    log.debug('Starting rescan of all users')
    const dir = await fs.promises.opendir(path)
    for await (const dirent of dir) {
        if (dirent.isDirectory()) {
            const username = dirent.name
            const size = await getUserStorage(username)
            if (size) {
                await scheduleRescan({username, type: 'periodic'})
            } else {
                await scheduleRescan({username, type: 'initial'})
            }
        }
    }
}

const main = async () => {
    // const {topicSubscriber, topicPublisher} = await initMessageQueue()
    const {topicSubscriber} = await initMessageQueue()

    const handlers = {
        workerSession: {
            'WorkerSessionActivated': ({username}) => {
                setSessionActive(username)
                scheduleRescan({username, type: 'sessionActivated'})
            },
            'WorkerSessionClosed': ({username}) => {
                setSessionInactive(username)
                scheduleRescan({username, type: 'sessionDeactivated'})
            }
        },
        files: {
            'FilesDeleted': ({username}) =>
                scheduleRescan({username, type: 'fileDeleted'})
        }
    }

    const handler = async (key, msg) => {
        const handler = _.get(handlers, key)
        return handler && await handler(msg)
    }

    await topicSubscriber({
        exchange: 'sepal.topic',
        queue: 'sepal-userStorage-workerSession',
        topic: 'workerSession.#',
        handler
    })
    
    await topicSubscriber({
        exchange: 'sepal.topic',
        queue: 'sepal-userStorage-files',
        topic: 'files.#',
        handler
    })
    
    // const publisher = await topicPublisher({
    //     exchange: 'sepal'
    // })

    // emulate events
    // setTimeout(() => publisher.publish('workerSession.WorkerSessionActivated', 'admin'), 2000)
    // setTimeout(() => publisher.publish('files.FilesDeleted', 'admin'), 10000)
    // setTimeout(() => publisher.publish('workerSession.WorkerSessionClosed', 'admin'), 20000)
    // setTimeout(() => publisher.publish('workerSession.WorkerSessionActivated', 'admin'), 30000)
    // setTimeout(() => publisher.publish('workerSession.WorkerSessionClosed', 'admin'), 40000)

    await fullScan(homeDir)
}

main()
