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
// response (e.g. an untyped "ajax error 500" from a server reload/proxy interruption) is a request error.
// Raw HTTP status is deliberately NOT used to infer EE.
const classify = error =>
    error?.response?.errorType === EARTH_ENGINE_ERROR_TYPE
        ? CALCULATION_ERROR.EARTH_ENGINE
        : error?.response?.messageKey
            ? CALCULATION_ERROR.BACKEND
            : CALCULATION_ERROR.REQUEST

export const toErrorMessage = (error, format = msg) => {
    if (error?.response?.messageKey) {
        return format(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
    }
    const message = error?.response?.defaultMessage || error?.message || error?.statusText || error
    return typeof message === 'string' ? message : undefined
}

// Builds the structured inline failed-state for a calculation error. `messageKeys` supplies the domain
// wording (strata vs proportions); `type` + `strategy` let the caller choose recovery actions. Returns
// {type, strategy, message}.
export const calculationError = ({error, strategy, messageKeys, format = msg}) => {
    const type = classify(error)
    const detail = toErrorMessage(error, format)
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
