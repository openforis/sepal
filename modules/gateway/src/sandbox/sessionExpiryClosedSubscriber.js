// Cache teardown is NOT done here — the close cascade's WorkerSessionClosed already handles it;
// this event only explains WHY the session closed.

import {SESSION_EXPIRY_CLOSED} from '#sepal/event/definitions'
import {getLogger} from '#sepal/log'

const log = getLogger('sessionExpiryClosedSubscriber')

const SESSION_EXPIRY_CLOSED_TOPIC = 'workerSession.SessionExpiryClosed'
const QUEUE = 'gateway.sessionExpiryClosed'

const sessionExpiryClosedSubscriber = event$ => {
    const handler = (_key, content) => {
        const {username, sessionId, apps = [], terminals = 0, ordinal = null, name = null, typeName = null} = content || {}
        log.debug(() => `SessionExpiryClosed: username=${username}, sessionId=${sessionId}`)
        // Both fields required: sendEvent treats a falsy username as "broadcast to everyone".
        if (username && sessionId) {
            event$ && event$.next({
                type: SESSION_EXPIRY_CLOSED,
                data: {username, sessionId, apps, terminals, ordinal, name, typeName}
            })
        }
    }

    return {queue: QUEUE, topic: SESSION_EXPIRY_CLOSED_TOPIC, handler}
}

export {QUEUE, SESSION_EXPIRY_CLOSED_TOPIC, sessionExpiryClosedSubscriber}
