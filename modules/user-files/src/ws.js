const {Subject, finalize, from, switchMap, startWith} = require('rxjs')
const _ = require('lodash')
const {createWatcher} = require('./watcher')
const {clientTag, subscriptionTag} = require('./tag')
const log = require('#sepal/log').getLogger('ws')

const ws$ = in$ => {
    const out$ = new Subject()
    const stop$ = new Subject()

    const init = async () => {
        const watcher = await createWatcher({out$, stop$})

        const onClientUp = ({username, clientId}) => {
            log.info(`${clientTag({username, clientId})} up`)
        }

        const onClientDown = ({username, clientId}) => {
            log.info(`${clientTag({username, clientId})} down`)
            watcher.offline({username, clientId})
        }

        const onSubscriptionUp = ({username, clientId, subscriptionId}) => {
            log.debug(`${subscriptionTag({username, clientId, subscriptionId})} up`)
        }

        const onSubscriptionDown = ({username, clientId, subscriptionId}) => {
            log.debug(`${subscriptionTag({username, clientId, subscriptionId})} down`)
            watcher.unsubscribe({username, clientId, subscriptionId})
        }

        const onMonitor = ({username, clientId, subscriptionId, monitor}) => {
            log.debug(`${subscriptionTag({username, clientId, subscriptionId})} monitoring path(s):`, monitor)
            watcher.monitor({username, clientId, subscriptionId, path: monitor})
        }

        const onUnmonitor = ({username, clientId, subscriptionId, unmonitor}) => {
            log.debug(`${subscriptionTag({username, clientId, subscriptionId})} unmonitoring path(s):`, unmonitor)
            watcher.unmonitor({username, clientId, subscriptionId, path: unmonitor})
        }

        const onRemove = ({username, clientId, subscriptionId, remove}) => {
            log.debug(`${subscriptionTag({username, clientId, subscriptionId})} removing path:`, remove)
            watcher.remove({username, clientId, subscriptionId, path: remove})
        }

        const processMessage = message => {
            const {user, clientId, subscriptionId, online, subscribed, update, data, hb} = message
            if (hb) {
                out$.next({hb})
            } else {
                if (user) {
                    const {username} = user
                    if (online === true) {
                        onClientUp({username, clientId})
                    } else if (online === false) {
                        onClientDown({username, clientId})
                    } else if (subscribed === true) {
                        onSubscriptionUp({username, clientId, subscriptionId})
                    } else if (subscribed === false) {
                        onSubscriptionDown({username, clientId, subscriptionId})
                    } else if (update) {
                        log.info('*** To be implemented ***')
                    } else if (data) {
                        const {monitor, unmonitor, remove} = data
                        if (monitor) {
                            onMonitor({username, clientId, subscriptionId, monitor})
                        } else if (unmonitor) {
                            onUnmonitor({username, clientId, subscriptionId, unmonitor})
                        } else if (remove) {
                            onRemove({username, clientId, subscriptionId, remove})
                        } else {
                            log.warn('Unsupported message data:', data)
                        }
                    } else {
                        log.warn('Unsupported message:', message)
                    }
                }
            }
        }
    
        in$.subscribe({
            next: msg => processMessage(msg),
            error: error => log.error('Connection error (unexpected)', error),
            complete: () => log.info('Disconnected')
        })
    }

    return from(init()).pipe(
        switchMap(() => out$.pipe(startWith({ready: true}))),
        finalize(() => stop$.next())
    )
}

module.exports = ctx => ws$(ctx.args$)
