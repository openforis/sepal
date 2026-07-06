import {describe, expect, it} from 'vitest'

import {CALCULATION_ERROR} from '../eeCalculationError'
import {strataCalculationError} from './stratificationError'

const eeError = {
    response: {
        errorType: 'EARTH_ENGINE',
        messageKey: 'gee.error.earthEngineException',
        messageArgs: {earthEngineMessage: 'Computation timed out.'},
        defaultMessage: 'Earth Engine: Computation timed out.'
    }
}

const messages = {
    'gee.error.earthEngineException': 'Earth Engine: {earthEngineMessage}',
    'process.samplingDesign.panel.stratification.form.strata.error.eeOnline': 'Earth Engine failed to calculate the strata online: {error} You can retry online, or use Batch.',
    'process.samplingDesign.panel.stratification.form.strata.error.eeBatch': 'Earth Engine failed to calculate the strata with Batch: {error} You can submit it again.',
    'process.samplingDesign.panel.stratification.form.strata.error.genericWithDetail': 'Failed to calculate the strata weights: {error} You can try again.',
    'process.samplingDesign.panel.stratification.form.strata.error.generic': 'Failed to calculate the strata weights. You can try again.'
}

const format = (key, args, defaultMessage) =>
    (messages[key] || defaultMessage || key)
        .replaceAll(/\{(\w+)}/g, (_match, key) => args?.[key])

describe('strataCalculationError', () => {
    it('builds an EE Online strata error with the EE detail', () => {
        const {type, strategy, message} = strataCalculationError({error: eeError, strategy: 'ONLINE', format})
        expect(type).toEqual(CALCULATION_ERROR.EARTH_ENGINE)
        expect(strategy).toEqual('ONLINE')
        expect(message).toContain('strata online')
        expect(message).toContain('Earth Engine: Computation timed out.')
    })

    it('builds an EE Batch strata error without online wording', () => {
        const {message} = strataCalculationError({error: eeError, strategy: 'BATCH', format})
        expect(message).toContain('strata with Batch')
        expect(message).not.toContain('strata online')
    })

    it('classifies a non-EE typed error as BACKEND', () => {
        const {type} = strataCalculationError({
            error: {response: {messageKey: 'error.internal', defaultMessage: 'Internal error'}},
            strategy: 'ONLINE',
            format
        })
        expect(type).toEqual(CALCULATION_ERROR.BACKEND)
    })
})
