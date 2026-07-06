import {describe, expect, it} from 'vitest'

import {eeCalculationErrorMessage, toErrorMessage} from './eeCalculationError'

const eeError = {
    response: {
        messageKey: 'gee.error.earthEngineException',
        messageArgs: {earthEngineMessage: 'Computation timed out.'},
        defaultMessage: 'Earth Engine: Computation timed out.'
    }
}

const messages = {
    'gee.error.earthEngineException': 'Earth Engine: {earthEngineMessage}',
    'test.online': 'Online: {error} If Online was used, try Batch.',
    'test.batch': 'Batch: {error}'
}

const format = (key, args, defaultMessage) =>
    (messages[key] || defaultMessage || key)
        .replaceAll(/\{(\w+)}/g, (_match, key) => args?.[key])

const keys = {onlineKey: 'test.online', batchKey: 'test.batch'}

describe('eeCalculationError', () => {
    describe('toErrorMessage', () => {
        it('resolves translated EE error messages', () => {
            expect(toErrorMessage(eeError, format)).toEqual('Earth Engine: Computation timed out.')
        })

        it('passes through a plain string error', () => {
            expect(toErrorMessage('Boom', format)).toEqual('Boom')
        })

        it('does not return a raw object for message-less errors', () => {
            expect(toErrorMessage({some: 'object'}, format)).toBeUndefined()
        })
    })

    describe('eeCalculationErrorMessage', () => {
        it('uses onlineKey with the translated EE detail and Online guidance', () => {
            const message = eeCalculationErrorMessage({error: eeError, eeStrategy: 'ONLINE', ...keys, format})
            expect(message).toContain('Earth Engine: Computation timed out.')
            expect(message).toContain('Online:')
            expect(message).toContain('try Batch')
        })

        it('uses batchKey with the translated EE detail and not the Online message', () => {
            const message = eeCalculationErrorMessage({error: eeError, eeStrategy: 'BATCH', ...keys, format})
            expect(message).toContain('Earth Engine: Computation timed out.')
            expect(message).toContain('Batch:')
            expect(message).not.toContain('Online:')
            expect(message).not.toContain('try Batch')
        })

        it('returns null for non-EE responses', () => {
            expect(eeCalculationErrorMessage({
                error: {response: {messageKey: 'error.internal', defaultMessage: 'Internal error'}},
                eeStrategy: 'ONLINE',
                ...keys,
                format
            })).toBeNull()
        })
    })
})
