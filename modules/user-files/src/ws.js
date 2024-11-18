const {concat, Subject, finalize, of} = require('rxjs')
const _ = require('lodash')
const {getWatcher, removeWatcher, removeAllWatchers, removeClientWatchers} = require('./watcher')
const {clientTag, subscriptionTag} = require('./tag')
const log = require('#sepal/log').getLogger('ws')

const ws$ = in$ => {
    const out$ = new Subject()
    const stop$ = new Subject()

    const init = async () => {
        const onClientUp = async (username, clientId) => {
            log.info(`${clientTag({username, clientId})} up`)
        }

        const onClientDown = async (username, clientId) => {
            log.info(`${clientTag({username, clientId})} down`)
            removeClientWatchers(clientId)
        }

        const onSubscriptionUp = async (username, clientId, subscriptionId) => {
            log.info(`${subscriptionTag({username, clientId, subscriptionId})} up`)
        }

        const onSubscriptionDown = async (username, clientId, subscriptionId) => {
            log.info(`${subscriptionTag({username, clientId, subscriptionId})} down`)
            removeWatcher(clientId, subscriptionId)
        }

        const onMonitor = async ({username, clientId, subscriptionId, monitor}) => {
            log.debug(`${subscriptionTag({username, clientId, subscriptionId})} monitoring path(s):`, monitor)
            const watcher = await getWatcher({username, clientId, subscriptionId, out$, stop$, create: true})
            watcher.monitor(monitor)
        }

        const onUnmonitor = async ({username, clientId, subscriptionId, unmonitor}) => {
            log.debug(`${subscriptionTag({username, clientId, subscriptionId})} unmonitoring path(s):`, unmonitor)
            const watcher = await getWatcher({username, clientId, subscriptionId, out$, stop$, create: true})
            watcher.unmonitor(unmonitor)
        }

        const onRemove = async ({username, clientId, subscriptionId, remove}) => {
            log.debug(`${subscriptionTag({username, clientId, subscriptionId})} removing path:`, remove)
            const watcher = await getWatcher({username, clientId, subscriptionId, out$, stop$, create: true})
            watcher.remove(remove)
        }

        const onEnabled = async ({username, clientId, subscriptionId, enabled}) => {
            log.debug(`${subscriptionTag({username, clientId, subscriptionId})} enabled:`, enabled)
            const watcher = await getWatcher({username, clientId, out$, subscriptionId, stop$, create: true})
            watcher.enabled(enabled)
        }

        const processMessage = async message => {
            const {user, clientId, subscriptionId, online, subscribed, update, data, hb} = message
            if (hb) {
                out$.next({hb})
            } else {
                if (user) {
                    const {username} = user
                    if (online === true) {
                        await onClientUp(username, clientId)
                    } else if (online === false) {
                        await onClientDown(username, clientId)
                    } else if (subscribed === true) {
                        await onSubscriptionUp(username, clientId, subscriptionId)
                    } else if (subscribed === false) {
                        await onSubscriptionDown(username, clientId, subscriptionId)
                    } else if (update) {
                        log.info('*** To be implemented ***')
                    } else if (data) {
                        const {monitor, unmonitor, remove, enabled} = data
                        if (monitor) {
                            await onMonitor({username, clientId, subscriptionId, monitor})
                        } else if (unmonitor) {
                            await onUnmonitor({username, clientId, subscriptionId, unmonitor})
                        } else if (remove) {
                            await onRemove({username, clientId, subscriptionId, remove})
                        } else if (enabled === true) {
                            await onEnabled({username, clientId, subscriptionId, enabled: true})
                        } else if (enabled === false) {
                            await onEnabled({username, clientId, subscriptionId, enabled: false})
                        } else {
                            log.warn('Unsupported message data:', data)
                        }
                    } else {
                        log.warn('Unsupported message:', message)
                    }
                }
            }
        }
    
        in$.pipe(
            finalize(() => removeAllWatchers())
        ).subscribe({
            next: async msg => await processMessage(msg),
            error: error => log.error('Connection error (unexpected)', error),
            complete: () => log.info('Disconnected')
        })
    }

    init()

    return concat(of({ready: true}), out$).pipe(
        finalize(
            () => stop$.next()
        )
    )
}

module.exports = ctx => ws$(ctx.args$)
