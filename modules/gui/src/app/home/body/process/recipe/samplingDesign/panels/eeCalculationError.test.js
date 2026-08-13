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

// Test formatter: resolves gee.*/default keys to their detail text; encodes test.* keys as `message:<key>:<error>`.
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
    it('unwraps a plain string error to its message', () => {
        expect(toErrorMessage('Boom', format)).toEqual('Boom')
    })

    it('routes an ONLINE EE failure to the eeOnline key, carrying the EE detail', () => {
        const result = build(eeError, 'ONLINE')
        expect(result.type).toEqual(CALCULATION_ERROR.EARTH_ENGINE)
        expect(result.strategy).toEqual('ONLINE')
        expect(result.message).toContain('test.eeOnline')
        expect(result.message).not.toContain('test.eeBatch')
        expect(result.message).toContain('Earth Engine: Computation timed out.')
    })

    it('routes a BATCH EE failure to the eeBatch key', () => {
        const result = build(eeError, 'BATCH')
        expect(result.strategy).toEqual('BATCH')
        expect(result.message).toContain('test.eeBatch')
        expect(result.message).not.toContain('test.eeOnline')
    })

    it('routes a typed non-EE backend failure to genericWithDetail with the backend detail', () => {
        const result = build(backendError, 'ONLINE')
        expect(result.type).toEqual(CALCULATION_ERROR.BACKEND)
        expect(result.message).toContain('test.genericWithDetail')
        expect(result.message).toContain('Internal error')
        expect(result.message).not.toContain('test.eeOnline')
    })

    it('routes an untyped request failure to genericWithDetail with the request detail', () => {
        const result = build(ajax500, 'BATCH')
        expect(result.type).toEqual(CALCULATION_ERROR.REQUEST)
        expect(result.message).toContain('test.genericWithDetail')
        expect(result.message).toContain('ajax error 500')
    })

    it('routes a detail-less failure to the plain generic key', () => {
        const result = build({some: 'object'}, 'ONLINE')
        expect(result.type).toEqual(CALCULATION_ERROR.REQUEST)
        expect(result.message).toContain('test.generic')
        expect(result.message).not.toContain('test.genericWithDetail')
    })
})
