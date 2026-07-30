import {calculationError} from '../eeCalculationError'

const messageKeys = {
    eeOnline: 'process.samplingDesign.panel.proportions.form.strataProportion.error.eeOnline',
    eeBatch: 'process.samplingDesign.panel.proportions.form.strataProportion.error.eeBatch',
    genericWithDetail: 'process.samplingDesign.panel.proportions.form.strataProportion.error.genericWithDetail',
    generic: 'process.samplingDesign.panel.proportions.form.strataProportion.error.generic'
}

export const proportionsCalculationError = ({error, strategy, format}) =>
    calculationError({error, strategy, messageKeys, format})
