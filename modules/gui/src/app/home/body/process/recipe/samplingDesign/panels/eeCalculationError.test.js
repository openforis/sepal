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

const ajax500 = {status: 500, message: 'ajax error 500'}

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

        it('returns a useful string for an untyped Ajax 500', () => {
            expect(toErrorMessage(ajax500, format)).toEqual('ajax error 500')
        })

        it('falls back to HTTP <status> for a message-less server error', () => {
            expect(toErrorMessage({status: 500}, format)).toEqual('HTTP 500')
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

        it('targets an untyped Ajax 500 Online with the error detail and Batch guidance', () => {
            const message = eeCalculationErrorMessage({error: ajax500, eeStrategy: 'ONLINE', ...keys, format})
            expect(message).toContain('ajax error 500')
            expect(message).toContain('Online:')
            expect(message).toContain('try Batch')
        })

        it('targets an untyped Ajax 500 Batch without the Online message', () => {
            const message = eeCalculationErrorMessage({error: ajax500, eeStrategy: 'BATCH', ...keys, format})
            expect(message).toContain('ajax error 500')
            expect(message).toContain('Batch:')
            expect(message).not.toContain('try Batch')
        })

        it('returns null for an untyped non-500 error', () => {
            expect(eeCalculationErrorMessage({
                error: {status: 404, message: 'Not found'},
                eeStrategy: 'ONLINE',
                ...keys,
                format
            })).toBeNull()
        })
    })
})
