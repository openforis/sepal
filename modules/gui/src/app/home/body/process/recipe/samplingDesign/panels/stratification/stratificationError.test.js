import {describe, expect, it} from 'vitest'

import {CALCULATION_ERROR} from '../eeCalculationError'
import {strataCalculationError} from './stratificationError'

const EE_ONLINE_KEY = 'process.samplingDesign.panel.stratification.form.strata.error.eeOnline'
const EE_BATCH_KEY = 'process.samplingDesign.panel.stratification.form.strata.error.eeBatch'

const eeError = {
    response: {
        errorType: 'EARTH_ENGINE',
        messageKey: 'gee.error.earthEngineException',
        messageArgs: {earthEngineMessage: 'Computation timed out.'},
        defaultMessage: 'Earth Engine: Computation timed out.'
    }
}

// Key-marker formatter: the message encodes which key was chosen and the interpolated EE detail, so the tests
// assert message routing + detail flow, not the (freely changeable) English copy.
const format = (key, args) =>
    key === 'gee.error.earthEngineException'
        ? `Earth Engine: ${args?.earthEngineMessage}`
        : `message:${key}:${args?.error ?? ''}`

describe('strataCalculationError', () => {
    it('routes an ONLINE EE failure to the eeOnline message, carrying the EE detail and ONLINE strategy', () => {
        const {type, strategy, message} = strataCalculationError({error: eeError, strategy: 'ONLINE', format})
        expect(type).toEqual(CALCULATION_ERROR.EARTH_ENGINE)
        expect(strategy).toEqual('ONLINE')
        expect(message).toContain(EE_ONLINE_KEY)
        expect(message).not.toContain(EE_BATCH_KEY)
        expect(message).toContain('Computation timed out.')
    })

    it('routes a BATCH EE failure to the eeBatch message (not the eeOnline one), preserving BATCH strategy', () => {
        const {strategy, message} = strataCalculationError({error: eeError, strategy: 'BATCH', format})
        expect(strategy).toEqual('BATCH')
        expect(message).toContain(EE_BATCH_KEY)
        expect(message).not.toContain(EE_ONLINE_KEY)
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
