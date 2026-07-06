import {eeCalculationErrorMessage, toErrorMessage} from '../eeCalculationError'

export {toErrorMessage}

export const strataCalculationErrorMessage = ({error, eeStrategy, format}) =>
    eeCalculationErrorMessage({
        error,
        eeStrategy,
        onlineKey: 'process.samplingDesign.panel.stratification.form.strata.error.eeOnline',
        batchKey: 'process.samplingDesign.panel.stratification.form.strata.error.eeBatch',
        format
    })
