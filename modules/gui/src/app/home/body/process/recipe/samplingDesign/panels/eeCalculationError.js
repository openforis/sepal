import {msg} from '~/translate'

const EE_ERROR_MESSAGE_KEY = 'gee.error.earthEngineException'

export const toErrorMessage = (error, format = msg) => {
    if (error?.response?.messageKey) {
        return format(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
    }
    const message = error?.response?.defaultMessage || error?.message || error
    return typeof message === 'string' ? message : undefined
}

// Targeted guidance for EE exceptions from a per-stratum calculation. Returns null for any non-EE error so
// the caller can fall back to its generic notification. The Online variant also suggests trying Batch.
export const eeCalculationErrorMessage = ({error, eeStrategy, onlineKey, batchKey, format = msg}) =>
    error?.response?.messageKey === EE_ERROR_MESSAGE_KEY
        ? format(eeStrategy === 'ONLINE' ? onlineKey : batchKey, {error: toErrorMessage(error, format)})
        : null
