const {concat, Subject, finalize, of} = require('rxjs')
const _ = require('lodash')
const {getWatcher, removeWatcher, removeAllWatchers} = require('./watcher')
const log = require('#sepal/log').getLogger('ws')

const ws$ = in$ => {
    const out$ = new Subject()
    const stop$ = new Subject()

    const init = async () => {
        const onUserOnline = async username => {
            log.info(`User ${username} online`)
            // out$.next({username, ready: true})
        }

        const onUserOffline = async username => {
            log.info(`User ${username} offline`)
            const watcher = await getWatcher({username, out$, stop$, create: false})
            if (watcher) {
                removeWatcher(username)
            }
        }

        const onMonitor = async (username, monitor) => {
            log.debug(`User ${username} monitoring path(s):`, monitor)
            const watcher = await getWatcher({username, out$, stop$, create: true})
            watcher.monitor(monitor)
        }

        const onUnmonitor = async (username, unmonitor) => {
            log.debug(`User ${username} unmonitoring path(s):`, unmonitor)
            const watcher = await getWatcher({username, out$, stop$, create: true})
            watcher.unmonitor(unmonitor)
        }

        const onRemove = async (username, remove) => {
            log.debug(`User ${username} removing path:`, remove)
            const watcher = await getWatcher({username, out$, stop$, create: true})
            watcher.remove(remove)
        }

        const onEnabled = async (username, enabled) => {
            log.debug(`User ${username} enabled:`, enabled)
            const watcher = await getWatcher({username, out$, stop$, create: true})
            watcher.enabled(enabled)
        }

        const processMessage = async message => {
            const {user, online, update, data, hb} = message
            if (hb) {
                out$.next({hb})
            } else {
                if (user) {
                    const {username} = user
                    if (online === true) {
                        await onUserOnline(username)
                    } else if (online === false) {
                        await onUserOffline(username)
                    } else if (update) {
                        log.info('*** To be implemented ***')
                    } else if (data) {
                        const {monitor, unmonitor, remove, enabled} = data
                        if (monitor) {
                            await onMonitor(username, monitor)
                        } else if (unmonitor) {
                            await onUnmonitor(username, unmonitor)
                        } else if (remove) {
                            await onRemove(username, remove)
                        } else if (enabled === true) {
                            await onEnabled(username, true)
                        } else if (enabled === false) {
                            await onEnabled(username, false)
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
