import {calculationError} from '../eeCalculationError'

const messageKeys = {
    eeOnline: 'process.samplingDesign.panel.stratification.form.strata.error.eeOnline',
    eeBatch: 'process.samplingDesign.panel.stratification.form.strata.error.eeBatch',
    genericWithDetail: 'process.samplingDesign.panel.stratification.form.strata.error.genericWithDetail',
    generic: 'process.samplingDesign.panel.stratification.form.strata.error.generic'
}

export const strataCalculationError = ({error, strategy, format}) =>
    calculationError({error, strategy, messageKeys, format})
