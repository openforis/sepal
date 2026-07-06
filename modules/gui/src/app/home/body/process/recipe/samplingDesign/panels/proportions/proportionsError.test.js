import {describe, expect, it} from 'vitest'

import {CALCULATION_ERROR} from '../eeCalculationError'
import {proportionsCalculationError} from './proportionsError'

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
    'process.samplingDesign.panel.proportions.form.strataProportion.error.eeOnline': 'Earth Engine failed to calculate the anticipated proportions online: {error} You can retry online, or use Batch.',
    'process.samplingDesign.panel.proportions.form.strataProportion.error.eeBatch': 'Earth Engine failed to calculate the anticipated proportions with Batch: {error} You can submit it again.',
    'process.samplingDesign.panel.proportions.form.strataProportion.error.genericWithDetail': 'Failed to calculate the anticipated proportions: {error} You can try again.',
    'process.samplingDesign.panel.proportions.form.strataProportion.error.generic': 'Failed to calculate the anticipated proportions. You can try again.'
}

const format = (key, args, defaultMessage) =>
    (messages[key] || defaultMessage || key)
        .replaceAll(/\{(\w+)}/g, (_match, key) => args?.[key])

describe('proportionsCalculationError', () => {
    it('builds an EE Online proportions error with the EE detail', () => {
        const {type, strategy, message} = proportionsCalculationError({error: eeError, strategy: 'ONLINE', format})
        expect(type).toEqual(CALCULATION_ERROR.EARTH_ENGINE)
        expect(strategy).toEqual('ONLINE')
        expect(message).toContain('anticipated proportions online')
        expect(message).toContain('Earth Engine: Computation timed out.')
    })

    it('builds an EE Batch proportions error without online wording', () => {
        const {message} = proportionsCalculationError({error: eeError, strategy: 'BATCH', format})
        expect(message).toContain('anticipated proportions with Batch')
        expect(message).not.toContain('proportions online')
    })

    it('classifies an untyped Ajax 500 as REQUEST, not EE', () => {
        const {type} = proportionsCalculationError({
            error: {status: 500, message: 'ajax error 500'},
            strategy: 'ONLINE',
            format
        })
        expect(type).toEqual(CALCULATION_ERROR.REQUEST)
    })
})
