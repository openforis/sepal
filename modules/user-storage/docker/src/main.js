require('sepal/log').configureServer(require('./log.json'))

const fs = require('fs')
const _ = require('lodash')
const log = require('sepal/log').getLogger('main')
const {homeDir} = require('./config')

const {initMessageQueue} = require('./messageQueue')
const {scheduleRescan, onRescanComplete} = require('./jobQueue')
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
    const {topicSubscriber, topicPublisher} = await initMessageQueue()

    const publisher = await topicPublisher()

    onRescanComplete(
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
    
    await fullScan(homeDir)
}

main()
