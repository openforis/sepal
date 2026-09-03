import {WORKER_SESSION_CLOSED} from '#sepal/event/definitions'
import {getLogger} from '#sepal/log'

const log = getLogger('workerSessionClosedSubscriber')

const WORKER_SESSION_CLOSED_TOPIC = 'workerSession.WorkerSessionClosed'
const QUEUE = 'gateway.workerSession'

const workerSessionClosedSubscriber = (sandboxSessionManager, event$) => {
    const handler = (_key, content) => {
        const {username, sessionId} = content || {}
        log.debug(() => `WorkerSessionClosed: username=${username}, sessionId=${sessionId}`)
        sandboxSessionManager.onSessionClosed({username, sessionId})
        // Only notify browsers when BOTH fields are present: the client registry treats an
        // undefined username as "match everyone", so a malformed event would otherwise close
        // app tabs in EVERY user's browser. onSessionClosed above still runs its host/sessionId
        // fallback teardown for a partial payload.
        if (username && sessionId) {
            event$ && event$.next({type: WORKER_SESSION_CLOSED, data: {username, sessionId}})
        }
    }

    return {
        queue: QUEUE,
        topic: WORKER_SESSION_CLOSED_TOPIC,
        handler
    }
}

export {QUEUE, WORKER_SESSION_CLOSED_TOPIC, workerSessionClosedSubscriber}
