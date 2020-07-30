const _ = require('lodash')
const log = require('sepal/log').getLogger('messageQueue')
const {scheduleRescan} = require('./scan')
const {setSessionActive, setSessionInactive} = require('./persistence')

const logError = (key, msg) =>
    log.error('Incoming message doesn\'t match expected shape', {key, msg})

const handlers = {
    'workerSession.WorkerSessionActivated': async (key, msg) => {
        const {username} = msg
        if (username) {
            await setSessionActive(username)
            await scheduleRescan({username, type: 'sessionActivated'})
        } else {
            logError(key, msg)
        }
    },
    'workerSession.WorkerSessionClosed': async (key, msg) => {
        const {username} = msg
        if (username) {
            await setSessionInactive(username)
            await scheduleRescan({username, type: 'sessionDeactivated'})
        } else {
            logError(key, msg)
        }
    },
    'files.FilesDeleted': async (key, msg) => {
        const {username} = msg
        if (username) {
            await scheduleRescan({username, type: 'fileDeleted'})
        } else {
            logError(key, msg)
        }
    }
}

const messageHandler = async (key, msg) => {
    const handler = handlers[key]
    return handler && await handler(key, msg)
}

module.exports = {messageHandler}
