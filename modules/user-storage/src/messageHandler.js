const _ = require('lodash')
const log = require('#sepal/log').getLogger('messageQueue')
const {scheduleRescan} = require('./scan')
const {setSessionActive, setSessionInactive} = require('./persistence')
const {Subject, debounceTime, groupBy, mergeMap, switchMap} = require('rxjs')

const logError = (key, msg) =>
    log.error('Incoming message doesn\'t match expected shape', {key, msg})

const event$ = new Subject()

event$.pipe(
    groupBy(event => JSON.stringify(event)),
    mergeMap(group$ =>
        group$.pipe(
            debounceTime(1000),
            switchMap(event => scheduleRescan(event))
        )
    )
).subscribe()

const handlers = {
    'workerSession.WorkerSessionActivated': async (key, msg) => {
        const {username} = msg
        if (username) {
            await setSessionActive(username)
            event$.next({username, type: 'sessionActivated'})
        } else {
            logError(key, msg)
        }
    },
    'workerSession.WorkerSessionClosed': async (key, msg) => {
        const {username} = msg
        if (username) {
            await setSessionInactive(username)
            event$.next({username, type: 'sessionDeactivated'})
        } else {
            logError(key, msg)
        }
    },
    'files.FilesDeleted': async (key, msg) => {
        const {username} = msg
        if (username) {
            event$.next({username, type: 'filesDeleted'})
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
