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

        const onMonitor = ({username, clientId, subscriptionId, monitor, reset}) => {
            log.debug(`${subscriptionTag({username, clientId, subscriptionId})} monitoring path(s):`, monitor)
            if (reset) {
                watcher.unmonitor({username, clientId, subscriptionId})
            }
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

        const EVENT_HANDLERS = {
            'clientUp': onClientUp,
            'clientDown': onClientDown,
            'subscriptionUp': onSubscriptionUp,
            'subscriptionDown': onSubscriptionDown,
        }

        const processMessage = message => {
            const {event, data, hb, username, clientId, subscriptionId} = message
            if (hb) {
                out$.next({hb})
            } else if (event) {
                const handler = EVENT_HANDLERS[event]
                if (handler) {
                    handler({username, clientId, subscriptionId})
                }
            } else if (data) {
                const {monitor, unmonitor, remove, reset} = data
                if (monitor) {
                    onMonitor({username, clientId, subscriptionId, monitor, reset})
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
