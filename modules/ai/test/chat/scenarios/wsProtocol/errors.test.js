const {throwError} = require('rxjs')
const {aWsHandlerHarness} = require('../../harness')
const {alice} = require('./fixtures')

describe('errors', () => {

    it('publishes wsConnectionError when the inbound stream errors', () => {
        const harness = aWsHandlerHarness()

        harness.errorStream(new Error('socket closed badly'))

        expect(harness.bus.events.at(-1)).toMatchObject({
            type: 'wsConnectionError',
            message: expect.stringContaining('socket closed badly')
        })
    })

    it('publishes wsRouteError when routing a frame throws', () => {
        const harness = aWsHandlerHarness({
            userChatFor: () => { throw new Error('user chat unavailable') }
        })

        harness.feed({event: 'subscriptionUp', ...alice})

        expect(harness.bus.events.at(-1)).toMatchObject({
            type: 'wsRouteError',
            message: expect.stringContaining('user chat unavailable')
        })
    })

    it('publishes workFailed when dispatched command work errors', () => {
        const harness = aWsHandlerHarness({
            userChatFor: () => ({handle$: () => throwError(() => new Error('redis unavailable'))})
        })

        harness.feed({event: 'subscriptionUp', ...alice})
        harness.feed({data: {type: 'message', conversationId: 'conv-1', text: 'hello'}, ...alice})

        expect(harness.bus.events.at(-1)).toMatchObject({
            type: 'workFailed',
            message: expect.stringContaining('redis unavailable')
        })
    })
})
