import {describe, expect, it} from 'vitest'

import {CALCULATION_ERROR, calculationError} from './eeCalculationError'

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

// The shape actually observed in the field: no parsed response, and a message naming our transport
// rather than anything the user can act on.
const requestError = {status: 0, message: 'ajax error'}

const CONNECTION_ERROR = '<connection-error>'

// Test formatter: resolves gee.*/default keys to their detail text; encodes test.* keys as
// `message:<key>:<error>`; resolves the shared connection-error key to a recognisable string.
const format = (key, args, defaultMessage) => {
    if (key === 'gee.error.earthEngineException') {
        return `Earth Engine: ${args?.earthEngineMessage}`
    }
    if (key === 'notifications.error.connectionError') {
        return CONNECTION_ERROR
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

    // A request failure has no user-facing detail of its own - "ajax error" names our transport, not
    // anything the user can act on. It is reported as a connection problem instead.
    it('replaces an untyped request failure detail with the translated connection error', () => {
        const result = build(requestError, 'BATCH')

        expect(result.type).toEqual(CALCULATION_ERROR.REQUEST)
        expect(result.message).toContain('test.genericWithDetail')
        expect(result.message).toContain(CONNECTION_ERROR)
        expect(result.message).not.toContain('ajax error')
    })
})
