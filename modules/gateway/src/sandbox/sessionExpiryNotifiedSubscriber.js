// No gateway-internal state to update — the event only drives the GUI's expiry notification,
// which carries the Extend and Dismiss buttons.

import {SESSION_EXPIRY_NOTIFIED} from '#sepal/event/definitions'
import {getLogger} from '#sepal/log'

const log = getLogger('sessionExpiryNotifiedSubscriber')

const SESSION_EXPIRY_NOTIFIED_TOPIC = 'workerSession.SessionExpiryNotified'
const QUEUE = 'gateway.sessionExpiryNotified'

const sessionExpiryNotifiedSubscriber = event$ => {
    const handler = (_key, content) => {
        const {username, sessionId, apps = [], terminals = 0, ordinal = null, instanceName = null} = content || {}
        log.debug(() => `SessionExpiryNotified: username=${username}, sessionId=${sessionId}`)
        // Both fields required: sendEvent treats a falsy username as "broadcast to everyone".
        if (username && sessionId) {
            event$ && event$.next({
                type: SESSION_EXPIRY_NOTIFIED,
                data: {username, sessionId, apps, terminals, ordinal, instanceName}
            })
        }
    }

    return {queue: QUEUE, topic: SESSION_EXPIRY_NOTIFIED_TOPIC, handler}
}

export {QUEUE, SESSION_EXPIRY_NOTIFIED_TOPIC, sessionExpiryNotifiedSubscriber}
