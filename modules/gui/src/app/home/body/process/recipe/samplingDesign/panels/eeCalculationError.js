import {msg} from '~/translate'

const EE_ERROR_MESSAGE_KEY = 'gee.error.earthEngineException'

// The backend sometimes surfaces an EE exception as a typed response, but a timed-out/overloaded Online
// calculation can also reach the GUI as an untyped RxJS AjaxError ("ajax error 500") with no parsed
// messageKey. Both are treated as EE calculation failures here (scoped to Sampling Design callers only).
const isEETypedError = error =>
    error?.response?.messageKey === EE_ERROR_MESSAGE_KEY

const isUntypedServerError = error =>
    error?.status === 500 && !error?.response?.messageKey

export const toErrorMessage = (error, format = msg) => {
    if (error?.response?.messageKey) {
        return format(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
    }
    const message = error?.response?.defaultMessage || error?.message || error?.statusText || error
    if (typeof message === 'string') {
        return message
    }
    return error?.status ? `HTTP ${error.status}` : undefined
}

// Targeted guidance for EE exceptions from a per-stratum calculation, covering both typed EE responses and
// untyped 500 failures. Returns null for any other error so the caller can fall back to its generic
// notification. The Online variant also suggests trying Batch.
export const eeCalculationErrorMessage = ({error, eeStrategy, onlineKey, batchKey, format = msg}) =>
    isEETypedError(error) || isUntypedServerError(error)
        ? format(eeStrategy === 'ONLINE' ? onlineKey : batchKey, {error: toErrorMessage(error, format)})
        : null
