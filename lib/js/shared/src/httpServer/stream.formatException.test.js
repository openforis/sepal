import {formatException} from '#sepal/httpServer/stream'

describe('formatException()', () => {
    it('exposes the user-facing message fields and correlation id', () => {
        expect(formatException({
            userMessage: {message: 'Boom', key: 'error.boom', args: {a: 1}},
            statusCode: 500,
            operationId: 'op-1'
        })).toEqual({
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
        expect(formatException({
            userMessage: {message: 'Earth Engine: timed out', key: 'gee.error.earthEngineException'},
            errorType: 'EARTH_ENGINE',
            statusCode: 500,
            operationId: 'op-2'
        })).toMatchObject({
            errorType: 'EARTH_ENGINE',
            messageKey: 'gee.error.earthEngineException'
        })
    })

    it('leaves errorType undefined for exceptions that do not define one', () => {
        expect(formatException({
            userMessage: {message: 'Internal error', key: 'error.internal'},
            statusCode: 500
        }).errorType).toBeUndefined()
    })
})
