import _ from 'lodash'
import {catchError, debounceTime, EMPTY, filter, from, groupBy, mergeMap, Subject, switchMap} from 'rxjs'

import {CLIENT_UP, USER_DOWN} from '#sepal/event/definitions'
import {getLogger} from '#sepal/log'

import {cancelInactivityCheck, scheduleInactivityCheck} from './inactivityCheck.js'
import {setSessionActive, setSessionInactive} from './kvstore.js'
import {scheduleStorageCheck} from './storageCheck.js'

const log = getLogger('messageQueue')

const logError = (key, msg) =>
    log.error('Incoming message doesn\'t match expected shape', {key, msg})

const event$ = new Subject()

const scheduleStorageCheck$ = event$.pipe(
    filter(({type}) => ['sessionActivated', 'sessionDeactivated', 'filesDeleted'].includes(type)),
    groupBy(event => JSON.stringify(event)),
    mergeMap(group$ =>
        group$.pipe(
            debounceTime(1000),
            switchMap(event => scheduleStorageCheck(event))
        )
    )
)

const scheduleInactivityCheck$ = event$.pipe(
    filter(({type}) => ['userDown', 'sessionDeactivated'].includes(type)),
    mergeMap(({username}) =>
        from(scheduleInactivityCheck(({username}))).pipe(
            catchError(error => {
                log.error('Error scheduling inactivity check:', error)
                return EMPTY
            })
        )
    )
)

const cancelInactivityCheck$ = event$.pipe(
    filter(({type}) => ['clientUp', 'sessionActivated'].includes(type)),
    mergeMap(({username}) =>
        from(cancelInactivityCheck(({username}))).pipe(
            catchError(error => {
                log.error('Error cancelling inactivity check:', error)
                return EMPTY
            })
        )
    )
)

scheduleStorageCheck$.subscribe({
    error: error => log.fatal('Unexpected scheduleStorageCheck$ error:', error),
    complete: () => log.fatal('Unexpected scheduleStorageCheck$ complete')
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

export {messageHandler}
