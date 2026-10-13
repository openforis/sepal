import {catchError, distinctUntilChanged, EMPTY, exhaustMap, filter, finalize, from, map, of, startWith, Subject, switchMap, takeWhile, timer} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

const log = getLogger('browserWs')

const POLL_MS = 10000

// A moduleWs$ protocol with the user-files message shapes, listing Data instead of a home directory.
export const createBrowserWs = ({browser, pollMs = POLL_MS}) =>
    ({send, stop$}) => {
        const watches = new Watches({browser, pollMs, send})
        stop$.subscribe(() => watches.stopAll())

        const handlers = {
            clientDown: ({clientId}) => watches.stopClient(clientId),
            subscriptionDown: ({clientId, subscriptionId}) => watches.stopSubscription(clientId, subscriptionId)
        }

        const handle = message => {
            const {event, data, user, clientId, subscriptionId} = message
            if (event) {
                handlers[event]?.({clientId, subscriptionId})
            } else if (data?.monitor) {
                if (data.reset) {
                    watches.unmonitor(clientId, subscriptionId)
                }
                stringPaths(data.monitor).forEach(path => watches.monitor({username: user.username, clientId, subscriptionId, path}))
            } else if (data?.unmonitor) {
                stringPaths(data.unmonitor).forEach(path => watches.unmonitor(clientId, subscriptionId, path))
            } else if (data?.remove) {
                watches.remove({username: user.username, clientId, subscriptionId, paths: stringPaths(data.remove)})
            } else {
                log.warn('Unsupported message:', message)
            }
        }

        // One connection carries every user's messages: a throw here would end the handling of all of them.
        return message => {
            try {
                handle(message)
            } catch (error) {
                log.warn('Dropped a message that could not be handled:', message, error)
            }
        }
    }

class Watches {
    #browser
    #pollMs
    #send
    #subscriptions = new Map()
    #trigger$ = new Subject()

    constructor({browser, pollMs, send}) {
        this.#browser = browser
        this.#pollMs = pollMs
        this.#send = send
    }

    monitor({username, clientId, subscriptionId, path}) {
        const paths = this.#paths(clientId, subscriptionId)
        paths.get(path)?.unsubscribe()
        paths.set(path, this.#poll$({username, clientId, subscriptionId, path}).subscribe(
            data => this.#send({clientId, subscriptionId, data})
        ))
    }

    unmonitor(clientId, subscriptionId, path = '') {
        const paths = this.#subscriptions.get(key(clientId, subscriptionId))
        const prefix = path.endsWith('/') ? path : `${path}/`
        paths?.forEach((subscription, monitored) => {
            if (path === '' || monitored === path || monitored.startsWith(prefix)) {
                subscription.unsubscribe()
                paths.delete(monitored)
            }
        })
    }

    async remove({username, clientId, subscriptionId, paths}) {
        try {
            await this.#browser.remove(username, paths)
        } catch (error) {
            log.warn(`Cannot remove ${paths}:`, error.message)
        }
        this.#trigger$.next({clientId, subscriptionId})
    }

    stopSubscription(clientId, subscriptionId) {
        this.unmonitor(clientId, subscriptionId)
        this.#subscriptions.delete(key(clientId, subscriptionId))
    }

    stopClient(clientId) {
        [...this.#subscriptions.keys()]
            .filter(subscriptionKey => subscriptionKey.startsWith(`${clientId}:`))
            .forEach(subscriptionKey => {
                const [, subscriptionId] = subscriptionKey.split(/:(.*)/)
                this.stopSubscription(clientId, subscriptionId)
            })
    }

    stopAll() {
        this.#subscriptions.forEach(paths => paths.forEach(subscription => subscription.unsubscribe()))
        this.#subscriptions.clear()
    }

    #paths(clientId, subscriptionId) {
        const subscriptionKey = key(clientId, subscriptionId)
        if (!this.#subscriptions.has(subscriptionKey)) {
            this.#subscriptions.set(subscriptionKey, new Map())
        }
        return this.#subscriptions.get(subscriptionKey)
    }

    #poll$({username, clientId, subscriptionId, path}) {
        const removed$ = this.#trigger$.pipe(
            filter(trigger => trigger.clientId === clientId && trigger.subscriptionId === subscriptionId)
        )
        // A removal restarts the polling, dropping a listing that may have started before the removal finished.
        return removed$.pipe(
            startWith(null),
            switchMap(() => timer(0, this.#pollMs).pipe(
                exhaustMap(() => this.#list$(username, path))
            )),
            distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
            takeWhile(data => !data.error, true),
            finalize(() => log.debug(`Stopped monitoring ${path}`))
        )
    }

    #list$(username, path) {
        return from(this.#browser.list(username, path)).pipe(
            map(items => ({path, items})),
            catchError(error => {
                if (error instanceof ClientException) {
                    return of({path, error: 'INVALID_PATH'})
                }
                log.warn(`Cannot list ${path}:`, error.message)
                return EMPTY
            })
        )
    }
}

const key = (clientId, subscriptionId) => `${clientId}:${subscriptionId}`

const stringPaths = value => (Array.isArray(value) ? value : [value]).filter(path => typeof path === 'string')
