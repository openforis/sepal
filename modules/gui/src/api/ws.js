import {concat, finalize, of, Subject} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import {WebSocket} from '~/http-client'
import {getLogger} from '~/log'
import {uuid} from '~/uuid'

const log = getLogger('ws')

const subscriptionsById = {}
const subscriptionIdsByModule = {}
const readyModules = new Set()

const ENDPOINT = '/api/ws'

const sendToModuleSubscribers = (module, msg) => {
    const subscriptionIds = subscriptionIdsByModule[module]
    if (subscriptionIds) {
        subscriptionIds.forEach(subscriptionId => {
            const {moduleDownstream$} = subscriptionsById[subscriptionId]
            moduleDownstream$.next(msg)
        })
    }
}

const sendToAllSubscribers = msg =>
    Object.values(subscriptionsById).forEach(({moduleDownstream$}) => {
        moduleDownstream$.next(msg)
    })

const connected = () =>
    actionBuilder('WEBSOCKET_CONNECTED')
        .setIfChanged('connected', true)
        .dispatch()

const disconnected = () =>
    actionBuilder('WEBSOCKET_DISCONNECTED')
        .setIfChanged('connected', false)
        .dispatch()

const {upstream$, downstream$} = WebSocket(ENDPOINT, {
    maxRetries: Number.MAX_SAFE_INTEGER,
    minRetryDelay: 1000,
    retryDelayFactor: 1,
    onRetry: (_error, _retryMessage, _retryDelay, _retryCount) => {
        sendToAllSubscribers({ready: false})
        readyModules.clear()
        disconnected()
    }
})

downstream$.subscribe({
    next: ({modules: {status, update} = {}, module, data, hb}) => {
        if (hb) {
            log.trace('Heartbeat received, echoing', hb)
            upstream$.next({hb})
        } else if (status) {
            readyModules.clear()
            status.forEach(module => {
                sendToModuleSubscribers(module, {ready: true})
                readyModules.add(module)
            })
            connected()
        } else if (update) {
            Object.entries(update).forEach(
                ([module, ready]) => {
                    sendToModuleSubscribers(module, {ready})
                    if (ready) {
                        readyModules.add(module)
                    } else {
                        readyModules.delete(module)
                    }
                }
            )
        } else if (module && data) {
            sendToModuleSubscribers(module, {data})
        }
    },
    error: error => log.error('Unexpected ws$ stream error', error),
    complete: () => log.error('Unexpected ws$ stream closed')
})

const addSubscription = (module, moduleDownstream$, notifyBackend) => {
    log.debug('Adding module subscription:', module)
    const subscriptionId = uuid()
    subscriptionsById[subscriptionId] = {
        module,
        moduleDownstream$,
        notifyBackend
    }
    subscriptionIdsByModule[module] =
        subscriptionIdsByModule[module]
            ? [...subscriptionIdsByModule[module], subscriptionId]
            : [subscriptionId]

    return subscriptionId
}

const removeSubscription = subscriptionId => {
    const subscription = subscriptionsById[subscriptionId]
    if (subscription) {
        log.debug('Removing module subscriptions:', subscriptionId)
        subscription.ws$.complete()
        delete subscriptionsById[subscriptionId]
        subscriptionIdsByModule[module] = subscriptionIdsByModule[module].filter(
            id => id !== subscriptionId
        )
        if (subscriptionIdsByModule[module].length === 0) {
            delete subscriptionIdsByModule[module]
        }
    } else {
        log.warn('Cannot remove non-existing websocket subscription:', subscriptionId)
    }
}

export const moduleWebSocket$ = (module, notifyBackend = false) => {
    const moduleUpstream$ = new Subject()
    const moduleDownstream$ = new Subject()
    
    const subscriptionId = addSubscription(module, moduleDownstream$, notifyBackend)

    moduleUpstream$.subscribe({
        next: data => upstream$.next({module, data})
    })

    const close = () => {
        log.debug('Closing module websocket:', module)
        moduleUpstream$.complete()
        moduleDownstream$.complete()
        removeSubscription(subscriptionId)
    }

    const ready = readyModules.has(module)

    return {
        upstream$: moduleUpstream$.pipe(
            finalize(() => close())
        ),
        downstream$: concat(of({ready}), moduleDownstream$).pipe(
            finalize(() => close())
        )
    }
}
