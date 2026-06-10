import {getLogger} from '#sepal/log'
import {moduleWs$} from '#sepal/ws/module'

import {clientTag, subscriptionTag} from './tag.js'
import {createWatcher} from './watcher.js'
const log = getLogger('ws')

const protocol = async ({send, stop$}) => {
    const watcher = await createWatcher({send, stop$})

    const onClientUp = ({user: {username}, clientId}) => {
        log.info(`${clientTag({username, clientId})} up`)
    }

    const onClientDown = ({user: {username}, clientId}) => {
        log.info(`${clientTag({username, clientId})} down`)
        watcher.offline({username, clientId})
    }

    const onSubscriptionUp = ({user: {username}, clientId, subscriptionId}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} up`)
    }

    const onSubscriptionDown = ({user: {username}, clientId, subscriptionId}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} down`)
        watcher.unsubscribe({username, clientId, subscriptionId})
    }

    const onMonitor = ({user: {username}, clientId, subscriptionId, monitor, reset}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} monitoring path(s):`, monitor)
        if (reset) {
            watcher.unmonitor({username, clientId, subscriptionId})
        }
        watcher.monitor({username, clientId, subscriptionId, path: monitor})
    }

    const onUnmonitor = ({user: {username}, clientId, subscriptionId, unmonitor}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} unmonitoring path(s):`, unmonitor)
        watcher.unmonitor({username, clientId, subscriptionId, path: unmonitor})
    }

    const onRemove = ({user: {username}, clientId, subscriptionId, remove}) => {
        log.debug(`${subscriptionTag({username, clientId, subscriptionId})} removing path:`, remove)
        watcher.remove({username, clientId, subscriptionId, path: remove})
    }

    const EVENT_HANDLERS = {
        'clientUp': onClientUp,
        'clientDown': onClientDown,
        'subscriptionUp': onSubscriptionUp,
        'subscriptionDown': onSubscriptionDown,
    }

    return message => {
        const {event, data, user, clientId, subscriptionId} = message
        if (event) {
            const handler = EVENT_HANDLERS[event]
            if (handler) {
                handler({user, clientId, subscriptionId})
            }
        } else if (data) {
            const {monitor, unmonitor, remove, reset} = data
            if (monitor) {
                onMonitor({user, clientId, subscriptionId, monitor, reset})
            } else if (unmonitor) {
                onUnmonitor({user, clientId, subscriptionId, unmonitor})
            } else if (remove) {
                onRemove({user, clientId, subscriptionId, remove})
            } else {
                log.warn('Unsupported message data:', data)
            }
        } else {
            log.warn('Unsupported message:', message)
        }
    }
}

const ws$ = moduleWs$(protocol)

export default ctx => ws$(ctx.arg$)
