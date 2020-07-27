require('sepal/log').configureServer(require('./log.json'))

const fs = require('fs')
const _ = require('lodash')
const log = require('sepal/log').getLogger('main')
const {homeDir} = require('./config')

const {initMessageQueue} = require('./messageQueue')
const {scheduleRescan} = require('./jobQueue')
const {setActive, setInactive} = require('./workerSession')

const fullScan = async path => {
    log.debug('Starting rescan of all users')
    const dir = await fs.promises.opendir(path)
    for await (const dirent of dir) {
        if (dirent.isDirectory()) {
            const username = dirent.name
            await scheduleRescan({username, priority: 4, delay: 5000})
        }
    }
}

const main = async () => {
    // const {topicSubscriber, topicPublisher} = await initMessageQueue()
    const {topicSubscriber} = await initMessageQueue()

    const handlers = {
        workerSession: {
            'WorkerSessionActivated': username => {
                setActive(username)
                scheduleRescan({username, priority: 3, delay: 0})
            },
            'WorkerSessionClosed': username => {
                setInactive(username)
                scheduleRescan({username, priority: 2, delay: 0})
            }
        },
        files: {
            'FilesDeleted': username =>
                scheduleRescan({username, priority: 1, delay: 0})
        }
    }

    const handler = async (key, msg) => {
        const handler = _.get(handlers, key)
        return handler && await handler(msg)
    }

    await topicSubscriber({
        exchange: 'sepal',
        queue: 'sepal-userStorage-workerSession',
        topic: 'workerSession.#',
        handler
    })
    
    await topicSubscriber({
        exchange: 'sepal',
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
