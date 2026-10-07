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

// The message the client library gives for the same failure, so what SEPAL makes of Earth Engine's messages
// does not depend on the transport that sent the request.
export const earthEngineErrorMessage = ({statusCode, body}, {method, path}) =>
    statusCode
        ? errorBodyMessage(body) || `Server returned HTTP code: ${statusCode} for ${method} ${path}`
        : 'Failed to contact Earth Engine servers. Please check your connection, firewall, or browser extension settings.'

const errorBodyMessage = body => {
    try {
        return JSON.parse(body)?.error?.message
    } catch {
        return null
    }
}
