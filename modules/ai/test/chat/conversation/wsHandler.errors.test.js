const {Subject, throwError} = require('rxjs')
const {createWsHandler} = require('#mcp/chat/conversation/wsHandler')
const {alice, aHandler, aRecordingBus, aNoopGuiRequests, subscribeHandler} = require('./wsHandlerHarness')

describe('Chat WS handler — error reporting', () => {

    it('publishes wsConnectionError when the inbound stream errors', () => {
        const bus = aRecordingBus()
        const arg$ = subscribeHandler(aHandler({bus}))

        arg$.error(new Error('socket closed badly'))

        expect(bus.published.at(-1)).toMatchObject({
            type: 'wsConnectionError',
            level: 'error',
            message: 'WS connection errored: socket closed badly'
        })
    })

    it('publishes wsRouteError when routing a message throws', () => {
        const bus = aRecordingBus()
        const handler = createWsHandler({
            bus,
            guiRequests: aNoopGuiRequests(),
            userChatFor: () => {
                throw new Error('user chat unavailable')
            }
        })
        const arg$ = new Subject()
        handler({arg$}).subscribe()

        arg$.next({event: 'subscriptionUp', ...alice})

        expect(bus.published.at(-1)).toMatchObject({
            type: 'wsRouteError',
            level: 'error',
            message: 'WS handler threw on message: user chat unavailable'
        })
    })

    it('publishes workFailed when dispatched command work errors', () => {
        const bus = aRecordingBus()
        const userChat = {
            handle$: () => throwError(() => new Error('redis unavailable'))
        }
        const handler = createWsHandler({bus, guiRequests: aNoopGuiRequests(), userChatFor: () => userChat})
        const arg$ = new Subject()
        handler({arg$}).subscribe()

        arg$.next({event: 'subscriptionUp', ...alice})
        arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'hello'}, ...alice})

        expect(bus.published.at(-1)).toMatchObject({
            type: 'workFailed',
            level: 'error',
            message: 'WS work failed: redis unavailable'
        })
    })
})
