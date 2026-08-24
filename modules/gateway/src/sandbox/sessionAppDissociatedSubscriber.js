// Drops the gateway's cached app entry — a dissociation initiated elsewhere (clientDown sweep,
// another browser's takeover) must not leave stale routing/start state — and, when the
// association had an OWNER other than the requester, emits APP_SESSION_DISSOCIATED so
// websocket-events unicasts it to that owner's browser, which closes the app's tab.
// Self-initiated dissociations (tab close, the owner's own clientDown) notify no one.

import {APP_SESSION_DISSOCIATED} from '#sepal/event/definitions'
import {getLogger} from '#sepal/log'

const log = getLogger('sessionAppDissociatedSubscriber')

const SESSION_APP_DISSOCIATED_TOPIC = 'workerSession.SessionAppDissociated'
const QUEUE = 'gateway.sessionAppDissociated'

const sessionAppDissociatedSubscriber = (sandboxSessionManager, event$) => {
    const handler = (_key, content) => {
        const {username, sessionId, path, clientId, requestingClientId} = content || {}
        log.debug(() => `SessionAppDissociated: username=${username}, path=${path}, owner=${clientId}, requester=${requestingClientId}`)
        sandboxSessionManager.onAppDissociated({username, appPath: path})
        if (username && path && clientId && clientId !== requestingClientId) {
            event$ && event$.next({
                type: APP_SESSION_DISSOCIATED,
                data: {username, clientId, appPath: path, sessionId}
            })
        }
    }

    return {
        queue: QUEUE,
        topic: SESSION_APP_DISSOCIATED_TOPIC,
        handler
    }
}

export {QUEUE, SESSION_APP_DISSOCIATED_TOPIC, sessionAppDissociatedSubscriber}
