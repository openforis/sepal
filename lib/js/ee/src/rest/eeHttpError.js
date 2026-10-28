const TRANSIENT_STATUSES = [429, 500, 502, 503, 504]

// No status means the request never got an answer: a network failure or a timeout.
export const isTransient = ({statusCode}) =>
    !statusCode || TRANSIENT_STATUSES.includes(statusCode)

export const statusClass = ({statusCode}) =>
    !statusCode
        ? 'network'
        : statusCode === 429
            ? '429'
            : statusCode < 500 ? '4xx' : '5xx'

// What Earth Engine said about a failure. Its HTTP status alone tells the user nothing they can act on, so the
// status is left to the log.
export const earthEngineErrorMessage = ({statusCode, body}) =>
    statusCode
        ? errorBodyMessage(body) || unexplainedFailureMessage(statusCode)
        : 'Failed to contact Earth Engine servers. Please check your connection, firewall, or browser extension settings.'

const unexplainedFailureMessage = statusCode =>
    statusCode >= 500
        ? 'Google Earth Engine failed to handle the request. Try again later.'
        : 'Google Earth Engine rejected the request.'

const errorBodyMessage = body => {
    try {
        return JSON.parse(body)?.error?.message
    } catch {
        return null
    }
}
