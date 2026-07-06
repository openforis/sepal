import {describe, expect, it} from 'vitest'

import {proportionsCalculationErrorMessage} from './proportionsError'

const eeError = {
    response: {
        messageKey: 'gee.error.earthEngineException',
        messageArgs: {earthEngineMessage: 'Computation timed out.'},
        defaultMessage: 'Earth Engine: Computation timed out.'
    }
}

const messages = {
    'gee.error.earthEngineException': 'Earth Engine: {earthEngineMessage}',
    'process.samplingDesign.panel.proportions.form.strataProportion.error.eeOnline': 'Earth Engine failed to calculate anticipated proportions: {error} If Online was used, try Batch. Batch submits the calculation as an Earth Engine task, which can handle larger calculations. If you have other export tasks queued or running, the batch task might not start until after they complete.',
    'process.samplingDesign.panel.proportions.form.strataProportion.error.eeBatch': 'Earth Engine failed to calculate anticipated proportions: {error} Batch submits the calculation as an Earth Engine task. If you have other export tasks queued or running, the batch task might not start until after they complete.'
}

const format = (key, args, defaultMessage) =>
    (messages[key] || defaultMessage || key)
        .replaceAll(/\{(\w+)}/g, (_match, key) => args?.[key])

describe('proportionsError', () => {
    it('builds an online EE error with batch guidance', () => {
        const message = proportionsCalculationErrorMessage({error: eeError, eeStrategy: 'ONLINE', format})
        expect(message).toContain('Earth Engine: Computation timed out.')
        expect(message).toContain('try Batch')
        expect(message).toContain('Earth Engine task')
        expect(message).toContain('other export tasks')
    })

    it('builds a batch EE error without telling the user to switch to batch', () => {
        const message = proportionsCalculationErrorMessage({error: eeError, eeStrategy: 'BATCH', format})
        expect(message).toContain('Earth Engine: Computation timed out.')
        expect(message).not.toContain('try Batch')
        expect(message).toContain('Earth Engine task')
    })

    it('returns null for non-EE errors', () => {
        expect(proportionsCalculationErrorMessage({
            error: {response: {messageKey: 'error.internal', defaultMessage: 'Internal error'}},
            eeStrategy: 'ONLINE',
            format
        })).toBeNull()
    })
})
