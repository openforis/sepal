import {describe, expect, it} from 'vitest'

import {CALCULATION_ERROR, calculationError, toErrorMessage} from './eeCalculationError'

const eeError = {
    response: {
        errorType: 'EARTH_ENGINE',
        messageKey: 'gee.error.earthEngineException',
        messageArgs: {earthEngineMessage: 'Computation timed out.'},
        defaultMessage: 'Earth Engine: Computation timed out.'
    }
}

const backendError = {
    response: {
        messageKey: 'error.internal',
        defaultMessage: 'Internal error'
    }
}

const ajax500 = {status: 500, message: 'ajax error 500'}

const messages = {
    'gee.error.earthEngineException': 'Earth Engine: {earthEngineMessage}',
    'test.eeOnline': 'EE online: {error} You can retry online or use Batch.',
    'test.eeBatch': 'EE batch: {error}',
    'test.genericWithDetail': 'The calculation failed: {error} You can try again.',
    'test.generic': 'The calculation failed. You can try again.'
}

const format = (key, args, defaultMessage) =>
    (messages[key] || defaultMessage || key)
        .replaceAll(/\{(\w+)}/g, (_match, key) => args?.[key])

const messageKeys = {
    eeOnline: 'test.eeOnline',
    eeBatch: 'test.eeBatch',
    genericWithDetail: 'test.genericWithDetail',
    generic: 'test.generic'
}

const build = (error, strategy) => calculationError({error, strategy, messageKeys, format})

describe('eeCalculationError', () => {
    describe('toErrorMessage', () => {
        it('resolves translated EE error messages', () => {
            expect(toErrorMessage(eeError, format)).toEqual('Earth Engine: Computation timed out.')
        })

        it('passes through a plain string error', () => {
            expect(toErrorMessage('Boom', format)).toEqual('Boom')
        })

        it('returns a useful string for an untyped Ajax 500', () => {
            expect(toErrorMessage(ajax500, format)).toEqual('ajax error 500')
        })

        it('does not return a raw object for message-less errors', () => {
            expect(toErrorMessage({some: 'object'}, format)).toBeUndefined()
        })
    })

    describe('calculationError classification', () => {
        it('classifies a typed EARTH_ENGINE response as EE', () => {
            expect(build(eeError, 'ONLINE').type).toEqual(CALCULATION_ERROR.EARTH_ENGINE)
        })

        it('classifies a typed non-EE response with messageKey as BACKEND, not EE', () => {
            expect(build(backendError, 'ONLINE').type).toEqual(CALCULATION_ERROR.BACKEND)
        })

        it('classifies an untyped Ajax 500 as REQUEST, not EE (no status inference)', () => {
            expect(build(ajax500, 'ONLINE').type).toEqual(CALCULATION_ERROR.REQUEST)
        })
    })

    describe('calculationError message + strategy', () => {
        it('EE Online carries the EE detail, ONLINE strategy, and batch-capable wording', () => {
            const result = build(eeError, 'ONLINE')
            expect(result.strategy).toEqual('ONLINE')
            expect(result.message).toContain('EE online:')
            expect(result.message).toContain('Earth Engine: Computation timed out.')
        })

        it('EE Batch uses the batch message and BATCH strategy, not the online wording', () => {
            const result = build(eeError, 'BATCH')
            expect(result.strategy).toEqual('BATCH')
            expect(result.message).toContain('EE batch:')
            expect(result.message).not.toContain('EE online:')
        })

        it('BACKEND error uses the generic message with backend detail, no EE wording', () => {
            const result = build(backendError, 'ONLINE')
            expect(result.message).toContain('The calculation failed:')
            expect(result.message).toContain('Internal error')
            expect(result.message).not.toContain('EE online:')
        })

        it('untyped Ajax 500 uses the generic message with the request detail', () => {
            const result = build(ajax500, 'BATCH')
            expect(result.message).toContain('The calculation failed:')
            expect(result.message).toContain('ajax error 500')
        })

        it('a detail-less request error uses the plain generic message', () => {
            const result = build({some: 'object'}, 'ONLINE')
            expect(result.type).toEqual(CALCULATION_ERROR.REQUEST)
            expect(result.message).toEqual('The calculation failed. You can try again.')
        })
    })
})
