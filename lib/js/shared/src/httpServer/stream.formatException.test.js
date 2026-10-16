import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {formatException} from '#sepal/httpServer/stream'

describe('formatException()', () => {
    it('exposes the user-facing message fields and correlation id', () => {
        assert.deepEqual(formatException({
            userMessage: {message: 'Boom', key: 'error.boom', args: {a: 1}},
            statusCode: 500,
            operationId: 'op-1'
        }), {
            defaultMessage: 'Boom',
            messageKey: 'error.boom',
            messageArgs: {a: 1},
            errorType: undefined,
            errorCode: undefined,
            statusCode: 500,
            operationId: 'op-1'
        })
    })

    it('passes through a machine-readable errorType when present', () => {
        assert.partialDeepStrictEqual(formatException({
            userMessage: {message: 'Earth Engine: timed out', key: 'gee.error.earthEngineException'},
            errorType: 'EARTH_ENGINE',
            statusCode: 500,
            operationId: 'op-2'
        }), {
            errorType: 'EARTH_ENGINE',
            messageKey: 'gee.error.earthEngineException'
        })
    })

    it('leaves errorType undefined for exceptions that do not define one', () => {
        assert.equal(formatException({
            userMessage: {message: 'Internal error', key: 'error.internal'},
            statusCode: 500
        }).errorType, undefined)
    })
})
