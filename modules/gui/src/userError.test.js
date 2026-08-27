import {describe, expect, it, vi} from 'vitest'

// Deterministic formatter: a bare key renders as <key>, a typed detail as key:args:defaultMessage. The
// assertions are about which key is chosen and what is passed to it, never about production wording.
vi.mock('~/translate', () => ({
    msg: (key, args, defaultMessage) =>
        args || defaultMessage
            ? `${key}:${JSON.stringify(args)}:${defaultMessage}`
            : `<${key}>`
}))

const {toUserErrorMessage} = await import('./userError')

const CONNECTION_ERROR = '<notifications.error.connectionError>'
const GENERIC_ERROR = '<notifications.error.generic>'

const typedResponse = {
    messageKey: 'backend.layer.failure',
    messageArgs: {layer: 'forest'},
    defaultMessage: 'Could not load {layer}'
}
const TRANSLATED_TYPED = 'backend.layer.failure:{"layer":"forest"}:Could not load {layer}'

describe('untyped failures', () => {
    // 0 is a transport failure; 502/503/504 are a gateway or upstream service being unreachable or
    // unavailable. Grouped because the user's action is the same: retry the connection.
    it.each([0, 502, 503, 504])('reports status %s as a connection error', status => {
        expect(toUserErrorMessage({status, message: `ajax error ${status}`})).toEqual(CONNECTION_ERROR)
    })

    // A service that answered for itself - including a 500 internal fault - is not something retrying the
    // connection fixes.
    it.each([400, 404, 500])('reports status %s as a generic error', status => {
        expect(toUserErrorMessage({status, message: `ajax error ${status}`})).toEqual(GENERIC_ERROR)
    })

    it('reports a plain Error as a generic error', () => {
        expect(toUserErrorMessage(new Error('private transport failure'))).toEqual(GENERIC_ERROR)
    })

    it('reports a raw JSON string as a generic error', () => {
        expect(toUserErrorMessage('{"error":"private backend detail"}')).toEqual(GENERIC_ERROR)
    })

    it('reports a response without a message key as a generic error', () => {
        const error = {
            status: 500,
            statusText: 'Internal Server Error',
            message: 'ajax error 500',
            response: {
                defaultMessage: 'private response fallback',
                body: {diagnostic: 'private backend detail'}
            }
        }

        expect(toUserErrorMessage(error)).toEqual(GENERIC_ERROR)
    })

    it('forwards no transport or response content', () => {
        const error = {
            status: 502,
            statusText: 'Bad Gateway from private proxy',
            message: 'ajax error 502',
            response: {
                defaultMessage: 'private response fallback',
                body: {diagnostic: 'private backend detail'}
            }
        }

        const delivered = JSON.stringify(toUserErrorMessage(error))

        expect(delivered).not.toContain('ajax error')
        expect(delivered).not.toContain('Bad Gateway')
        expect(delivered).not.toContain('private response fallback')
        expect(delivered).not.toContain('private backend detail')
    })
})

describe('typed failures', () => {
    it('translates the response, passing its args and default message', () => {
        expect(toUserErrorMessage({response: typedResponse})).toEqual(TRANSLATED_TYPED)
    })

    it('prefers the typed response over a connection status', () => {
        expect(toUserErrorMessage({status: 502, response: typedResponse})).toEqual(TRANSLATED_TYPED)
    })

    // The shared backend keys arrive with statuses this policy would otherwise classify itself. A backend
    // that said something specific is always allowed to say it.
    it.each([
        [500, 'error.internal'],
        [400, 'error.badRequest'],
        [404, 'error.notFound']
    ])('keeps the typed detail for status %s carrying %s', (status, messageKey) => {
        const error = {status, message: `ajax error ${status}`, response: {messageKey}}

        expect(toUserErrorMessage(error)).toEqual(`<${messageKey}>`)
    })
})
