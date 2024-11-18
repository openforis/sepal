import {concat, filter, finalize, of, Subject} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import {WebSocket} from '~/http-client'
import {getLogger} from '~/log'
import {uuid} from '~/uuid'

const log = getLogger('ws')

const subscriptionsById = {}
const subscriptionIdsByModule = {}
const readyModules = new Set()

const ENDPOINT = '/api/ws'

export const CONNECTION_STATUS = {
    FULL: 2,
    PARTIAL: 1,
    NONE: 0
}

const sendToSubscriber = (subscriptionId, msg) => {
    const {moduleDownstream$} = subscriptionsById[subscriptionId]
    moduleDownstream$.next(msg)
}

const sendToModuleSubscribers = (module, msg) => {
    const subscriptionIds = subscriptionIdsByModule[module]
    if (subscriptionIds) {
        subscriptionIds.forEach(
            subscriptionId => sendToSubscriber(subscriptionId, msg)
        )
    }
}

const sendToAllSubscribers = msg =>
    Object.values(subscriptionsById).forEach(
        ({moduleDownstream$}) => moduleDownstream$.next(msg)
    )

const connectionStatus = status =>
    actionBuilder('WEBSOCKET_CONNECTION_STATUS')
        .setIfChanged('connectionStatus', status)
        .dispatch()

const {upstream$, downstream$} = WebSocket(ENDPOINT, {
    maxRetries: Number.MAX_SAFE_INTEGER,
    minRetryDelay: 1000,
    retryDelayFactor: 1,
    onRetry: (_error, _retryMessage, _retryDelay, _retryCount) => {
        sendToAllSubscribers({ready: false})
        readyModules.clear()
        connectionStatus(CONNECTION_STATUS.NONE)
    }
})

const handleHeartbeat = hb => {
    log.trace('Heartbeat received, echoing', hb)
    upstream$.next({hb})
}

const handleState = status => {
    readyModules.clear()
    status.forEach(module => {
        sendToModuleSubscribers(module, {ready: true})
        addModule(module)
    })
}

const addModule = module => {
    readyModules.add(module)
    const subscribedModules = Object.keys(subscriptionIdsByModule)
    const allModulesAvailable = subscribedModules.every(
        module => readyModules.has(module)
    )
    connectionStatus(allModulesAvailable ? CONNECTION_STATUS.FULL : CONNECTION_STATUS.PARTIAL)
}

const removeModule = module => {
    readyModules.delete(module)
    connectionStatus(CONNECTION_STATUS.PARTIAL)
}

const handleUpdate = update => {
    Object.entries(update).forEach(
        ([module, ready]) => {
            sendToModuleSubscribers(module, {ready})
            if (ready) {
                addModule(module)
            } else {
                removeModule(module)
            }
        }
    )
}

const handleMessage = ({modules: {state, update} = {}, subscriptionId, data, hb}) => {
    if (hb) {
        handleHeartbeat(hb)
    } else if (state) {
        handleState(state)
    } else if (update) {
        handleUpdate(update)
    } else if (subscriptionId && data) {
        sendToSubscriber(subscriptionId, {data})
    }
}

export const subscribe = () =>
    downstream$.subscribe({
        next: msg => handleMessage(msg),
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
        const module = subscription.module
        log.debug('Removing module subscription:', module)
        subscription.moduleDownstream$.complete()
        delete subscriptionsById[subscriptionId]
        delete subscriptionIdsByModule[module]
    } else {
        log.warn('Cannot remove non-existing websocket subscription:', subscriptionId)
    }
}

export const moduleWebSocket$ = (module, notifyBackend = false) => {
    const moduleUpstream$ = new Subject()
    const moduleDownstream$ = new Subject()
    
    const subscriptionId = addSubscription(module, moduleDownstream$, notifyBackend)

    moduleUpstream$.subscribe({
        next: data => upstream$.next({module, subscriptionId, data})
    })

    moduleDownstream$.pipe(
        filter(({ready}) => ready === true)
    ).subscribe({
        next: () => upstream$.next({module, subscriptionId, subscribed: true})
    })

    const close = () => {
        moduleUpstream$.complete()
        moduleDownstream$.complete()
        removeSubscription(subscriptionId)
        upstream$.next({module, subscriptionId, subscribed: false})
    }

    const ready = readyModules.has(module)

    upstream$.next({module, subscriptionId, subscribed: true})

    return {
        upstream$: moduleUpstream$.pipe(
            finalize(() => close())
        ),
        downstream$: concat(of({ready}), moduleDownstream$).pipe(
            finalize(() => close())
        )
    }
}
