import {eeCalculationErrorMessage, toErrorMessage} from '../eeCalculationError'

export {toErrorMessage}

export const proportionsCalculationErrorMessage = ({error, eeStrategy, format}) =>
    eeCalculationErrorMessage({
        error,
        eeStrategy,
        onlineKey: 'process.samplingDesign.panel.proportions.form.strataProportion.error.eeOnline',
        batchKey: 'process.samplingDesign.panel.proportions.form.strataProportion.error.eeBatch',
        format
    })
