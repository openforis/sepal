import {msg} from '~/translate'

// Machine-readable classification of a Sampling Design calculation failure. Behavior (wording, recovery
// actions) branches on this; user-facing text still comes from messageKey/defaultMessage/messageArgs.
export const CALCULATION_ERROR = {
    EARTH_ENGINE: 'EARTH_ENGINE',
    BACKEND: 'BACKEND',
    REQUEST: 'REQUEST'
}

const EARTH_ENGINE_ERROR_TYPE = 'EARTH_ENGINE'

// Only a typed backend response carrying errorType: 'EARTH_ENGINE' is treated as an EE failure. A typed
// backend response with any other messageKey is a generic backend error, and anything without a parsed
// response (e.g. an untyped "ajax error" from a dropped connection, server reload or proxy interruption)
// is a request error. Raw HTTP status is deliberately NOT used to infer EE.
const classify = error =>
    error?.response?.errorType === EARTH_ENGINE_ERROR_TYPE
        ? CALCULATION_ERROR.EARTH_ENGINE
        : error?.response?.messageKey
            ? CALCULATION_ERROR.BACKEND
            : CALCULATION_ERROR.REQUEST

// Resolves the user-facing detail of a typed response, and only that. Reached solely after
// classification has established EARTH_ENGINE or BACKEND, both of which are defined by carrying a
// messageKey. Private on purpose: a fallback to error.message, statusText or a raw value would put the
// transport's own text back in front of the user.
const toTypedErrorMessage = (error, format) =>
    format(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)

// Builds the structured inline failed-state for a calculation error. `messageKeys` supplies the domain
// wording (strata vs proportions); `type` + `strategy` let the caller choose recovery actions. Returns
// {type, strategy, message}.
export const calculationError = ({error, strategy, messageKeys, format = msg}) => {
    const type = classify(error)
    // A request failure carries no user-facing detail: "ajax error", a status line or a raw value all name
    // the transport rather than anything actionable. The shared connection message is used instead, still
    // wrapped by the domain key so the panel says which calculation failed.
    const detail = type === CALCULATION_ERROR.REQUEST
        ? format('notifications.error.connectionError')
        : toTypedErrorMessage(error, format)
    const messageKey = type === CALCULATION_ERROR.EARTH_ENGINE
        ? (strategy === 'ONLINE' ? messageKeys.eeOnline : messageKeys.eeBatch)
        : detail
            ? messageKeys.genericWithDetail
            : messageKeys.generic
    return {
        type,
        strategy,
        message: format(messageKey, detail ? {error: detail} : undefined)
    }
}
