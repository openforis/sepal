import {msg} from '~/translate'

// Opt-in policy for turning an error into something safe to show a user. Consumers reach for it
// deliberately, one at a time: it lives here rather than in Notifications or the HTTP client so neither
// acquires presentation policy, and so a second consumer does not have to reimplement it.
//
// A backend that wants to say something specific says it through a typed response. Anything else is our
// own plumbing talking - "ajax error 502", a status line, a response body - and is replaced rather than
// forwarded.
//
// The connection statuses are not one failure: 0 is a transport failure with no response at all, while
// 502, 503 and 504 are a gateway or upstream service being unreachable or unavailable. They are grouped
// because the user's action is the same - wait and retry the connection. A 500 is the service itself
// reporting an internal fault, which retrying the connection does not address, so it stays generic.
const CONNECTION_ERROR_STATUSES = new Set([0, 502, 503, 504])

export const toUserErrorMessage = error => {
    const {messageKey, messageArgs, defaultMessage} = error?.response || {}
    if (messageKey) {
        return msg(messageKey, messageArgs, defaultMessage)
    }
    return CONNECTION_ERROR_STATUSES.has(error?.status)
        ? msg('notifications.error.connectionError')
        : msg('notifications.error.generic')
}
