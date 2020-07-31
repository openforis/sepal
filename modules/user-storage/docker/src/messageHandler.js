const _ = require('lodash')
const log = require('sepal/log').getLogger('messageQueue')
const {scheduleRescan} = require('./scan')
const {setSessionActive, setSessionInactive} = require('./persistence')
const {Subject} = require('rxjs')
const {debounceTime, groupBy, mergeMap, switchMap} = require('rxjs/operators')

const logError = (key, msg) =>
    log.error('Incoming message doesn\'t match expected shape', {key, msg})

const filesDeleted$ = new Subject()

filesDeleted$.pipe(
    groupBy(username => username),
    mergeMap(group$ =>
        group$.pipe(
            debounceTime(1000),
            switchMap(username =>
                scheduleRescan({username, type: 'fileDeleted'})
            )
        )
    )
).subscribe()

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
            filesDeleted$.next(username)
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
