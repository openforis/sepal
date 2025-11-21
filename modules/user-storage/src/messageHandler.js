const _ = require('lodash')
const log = require('#sepal/log').getLogger('messageQueue')
const {scheduleRescan} = require('./scan')
const {setSessionActive, setSessionInactive} = require('./kvstore')
const {Subject, debounceTime, groupBy, mergeMap, switchMap, filter, catchError, EMPTY} = require('rxjs')
const {scheduleInactivityCheck, cancelInactivityCheck} = require('./inactivityQueue')
const {CLIENT_UP, USER_DOWN} = require('sepal/src/event/definitions')

const logError = (key, msg) =>
    log.error('Incoming message doesn\'t match expected shape', {key, msg})

const event$ = new Subject()

const scheduleRescan$ = event$.pipe(
    filter(({type}) => ['sessionActivated', 'sessionDeactivated', 'filesDeleted'].includes(type)),
    groupBy(event => JSON.stringify(event)),
    mergeMap(group$ =>
        group$.pipe(
            debounceTime(1000),
            switchMap(event => scheduleRescan(event))
        )
    )
)

const scheduleInactivityCheck$ = event$.pipe(
    filter(({type}) => ['userDown', 'sessionDeactivated'].includes(type)),
    mergeMap(({username}) => scheduleInactivityCheck(({username}))),
    catchError(error => {
        log.error('Error scheduling inactivity check:', error)
        return EMPTY
    })
)

const cancelInactivityCheck$ = event$.pipe(
    filter(({type}) => ['clientUp', 'sessionActivated'].includes(type)),
    mergeMap(({username}) => cancelInactivityCheck(({username}))),
    catchError(error => {
        log.error('Error cancelling inactivity check:', error)
        return EMPTY
    })
)

scheduleRescan$.subscribe({
    error: error => log.fatal('Unexpected scheduleRescan$ error:', error),
    complete: () => log.fatal('Unexpected scheduleRescan$ complete')
})

scheduleInactivityCheck$.subscribe({
    error: error => log.fatal('Unexpected scheduleInactivityCheck$ error:', error),
    complete: () => log.fatal('Unexpected scheduleInactivityCheck$ complete')
})

cancelInactivityCheck$.subscribe({
    error: error => log.fatal('Unexpected cancelInactivityCheck$ error:', error),
    complete: () => log.fatal('Unexpected cancelInactivityCheck$ complete')
})

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
    },
    'systemEvent': async (key, msg) => {
        const {type, data} = msg
        switch (type) {
            case CLIENT_UP: {
                const {username} = data
                if (username) {
                    event$.next({username, type: 'clientUp'})
                }
                break
            }
            case USER_DOWN: {
                const {user: {username}} = data
                if (username) {
                    event$.next({username, type: 'userDown'})
                }
                break
            }
            default:
                break
        }
    }
}

const messageHandler = async (key, msg) => {
    const handler = handlers[key]
    return handler && await handler(key, msg)
}

module.exports = {messageHandler}
