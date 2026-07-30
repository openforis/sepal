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

// Key-marker formatter: encode the chosen key + interpolated {error} rather than any English copy, so the
// tests assert message routing and detail flow. `gee.*`/default keys resolve to their detail (as the real
// msg would), so toErrorMessage still yields the underlying error text.
const format = (key, args, defaultMessage) => {
    if (key === 'gee.error.earthEngineException') {
        return `Earth Engine: ${args?.earthEngineMessage}`
    }
    if (key.startsWith('test.')) {
        return `message:${key}:${args?.error ?? ''}`
    }
    return defaultMessage || key
}

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
        it('routes an ONLINE EE failure to the eeOnline key, carrying the EE detail and ONLINE strategy', () => {
            const result = build(eeError, 'ONLINE')
            expect(result.strategy).toEqual('ONLINE')
            expect(result.message).toContain('test.eeOnline')
            expect(result.message).not.toContain('test.eeBatch')
            expect(result.message).toContain('Earth Engine: Computation timed out.')
        })

        it('routes a BATCH EE failure to the eeBatch key (not the eeOnline one), preserving BATCH strategy', () => {
            const result = build(eeError, 'BATCH')
            expect(result.strategy).toEqual('BATCH')
            expect(result.message).toContain('test.eeBatch')
            expect(result.message).not.toContain('test.eeOnline')
        })

        it('BACKEND error uses the genericWithDetail key with the backend detail, no EE key', () => {
            const result = build(backendError, 'ONLINE')
            expect(result.message).toContain('test.genericWithDetail')
            expect(result.message).toContain('Internal error')
            expect(result.message).not.toContain('test.eeOnline')
        })

        it('untyped Ajax 500 uses the genericWithDetail key with the request detail', () => {
            const result = build(ajax500, 'BATCH')
            expect(result.message).toContain('test.genericWithDetail')
            expect(result.message).toContain('ajax error 500')
        })

        it('a detail-less request error uses the plain generic key', () => {
            const result = build({some: 'object'}, 'ONLINE')
            expect(result.type).toEqual(CALCULATION_ERROR.REQUEST)
            expect(result.message).toContain('test.generic')
            expect(result.message).not.toContain('test.genericWithDetail')
        })
    })
})
