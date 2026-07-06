import {msg} from '~/translate'

const EE_ERROR_MESSAGE_KEY = 'gee.error.earthEngineException'

export const toErrorMessage = (error, format = msg) => {
    if (error?.response?.messageKey) {
        return format(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
    }
    const message = error?.response?.defaultMessage || error?.message || error
    return typeof message === 'string' ? message : undefined
}

export const strataCalculationErrorMessage = ({error, eeStrategy, format = msg}) => {
    const errorMessage = toErrorMessage(error, format)
    return error?.response?.messageKey === EE_ERROR_MESSAGE_KEY
        ? format(
            eeStrategy === 'ONLINE'
                ? 'process.samplingDesign.panel.stratification.form.strata.error.eeOnline'
                : 'process.samplingDesign.panel.stratification.form.strata.error.eeBatch',
            {error: errorMessage}
        )
        : null
}
