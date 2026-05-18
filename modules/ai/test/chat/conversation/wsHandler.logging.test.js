const {alice, aliceTargeted, aliceLabel, aHandler, aRecordingBus, subscribeHandler} = require('./wsHandlerHarness')

describe('Chat WS handler — inbound event publishing', () => {

    describe('publishes ignored messages at trace', () => {
        let arg$, bus

        beforeEach(() => {
            bus = aRecordingBus()
            arg$ = subscribeHandler(aHandler({bus}))
        })

        it('heartbeat', () => {
            arg$.next({hb: 12345})

            expect(bus.published[0]).toMatchObject({
                type: 'wsIn', kind: 'ignored', level: 'trace',
                reason: 'heartbeat', message: 'WS in heartbeat'
            })
        })

        it('gateway lifecycle events (userUp, clientUp, clientDown)', () => {
            arg$.next({event: 'userUp', user: {username: 'alice'}})
            arg$.next({event: 'clientUp', user: {username: 'alice'}, clientId: 'c1'})

            expect(bus.published).toHaveLength(2)
            expect(bus.published[0]).toMatchObject({
                kind: 'ignored', level: 'trace',
                reason: 'gatewayEvent', event: 'userUp'
            })
            expect(bus.published[1]).toMatchObject({
                kind: 'ignored', level: 'trace',
                reason: 'gatewayEvent', event: 'clientUp'
            })
        })

        it('empty messages — no event, no data', () => {
            arg$.next({user: {username: 'alice'}})

            expect(bus.published[0]).toMatchObject({
                kind: 'ignored', level: 'trace', reason: 'empty'
            })
        })
    })

    describe('publishes a self-describing wsIn event', () => {
        let arg$, bus

        beforeEach(() => {
            bus = aRecordingBus()
            arg$ = subscribeHandler(aHandler({bus, conversationIds: ['conv-9']}))
        })

        it('subscriptionUp', () => {
            arg$.next({event: 'subscriptionUp', ...alice})

            expect(bus.published[0]).toMatchObject({
                type: 'wsIn', kind: 'subscriptionUp', ...aliceTargeted,
                level: 'info', message: `WS in ${aliceLabel} subscriptionUp`
            })
        })

        it('subscriptionDown', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            bus.published.length = 0
            arg$.next({event: 'subscriptionDown', ...alice})

            expect(bus.published[0]).toMatchObject({
                kind: 'subscriptionDown', level: 'info',
                message: `WS in ${aliceLabel} subscriptionDown`
            })
        })

        it('create-conversation', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            bus.published.length = 0
            arg$.next({data: {type: 'create-conversation'}, ...alice})

            expect(bus.published[0]).toMatchObject({
                kind: 'create-conversation', level: 'info',
                message: `WS in ${aliceLabel} create-conversation`
            })
        })

        it('select-conversation with the conversationId', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            bus.published.length = 0
            arg$.next({data: {type: 'select-conversation', conversationId: 'conv-9'}, ...alice})

            expect(bus.published[0]).toMatchObject({
                kind: 'select-conversation', conversationId: 'conv-9',
                level: 'info', message: `WS in ${aliceLabel} select-conversation conv-9`
            })
        })

        it('delete-conversation with the conversationId', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            bus.published.length = 0
            arg$.next({data: {type: 'delete-conversation', conversationId: 'conv-9'}, ...alice})

            expect(bus.published[0]).toMatchObject({
                kind: 'delete-conversation', conversationId: 'conv-9',
                level: 'info', message: `WS in ${aliceLabel} delete-conversation conv-9`
            })
        })

        it('delete-all-conversations', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            bus.published.length = 0
            arg$.next({data: {type: 'delete-all-conversations'}, ...alice})

            expect(bus.published[0]).toMatchObject({
                kind: 'delete-all-conversations', level: 'info',
                message: `WS in ${aliceLabel} delete-all-conversations`
            })
        })

        it('list-conversations', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            bus.published.length = 0
            arg$.next({data: {type: 'list-conversations'}, ...alice})

            expect(bus.published[0]).toMatchObject({
                kind: 'list-conversations', level: 'info',
                message: `WS in ${aliceLabel} list-conversations`
            })
        })

        it('abort with the conversationId', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            bus.published.length = 0
            arg$.next({data: {type: 'abort', conversationId: 'conv-9'}, ...alice})

            expect(bus.published[0]).toMatchObject({
                kind: 'abort', conversationId: 'conv-9',
                level: 'info', message: `WS in ${aliceLabel} abort conv-9`
            })
        })

        it('message with the conversationId and text', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            bus.published.length = 0
            arg$.next({data: {type: 'message', conversationId: 'conv-9', text: 'Hello'}, ...alice})

            expect(bus.published[0]).toMatchObject({
                kind: 'message', conversationId: 'conv-9', text: 'Hello',
                level: 'info', message: `WS in ${aliceLabel} message conv-9: "Hello"`
            })
        })

        it('context at debug (recognised, fires on every GUI context change)', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            bus.published.length = 0
            arg$.next({data: {type: 'context', guiContext: {section: 'process'}}, ...alice})

            expect(bus.published[0]).toMatchObject({
                kind: 'context', level: 'debug',
                message: `WS in ${aliceLabel} context`
            })
        })

        it('an unrecognised type still publishes the wire arrival at the wsIn layer (the unknown-command publish itself is UserChat\'s concern)', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            bus.published.length = 0
            arg$.next({data: {type: 'something-else'}, ...alice})

            expect(bus.published[0]).toMatchObject({
                type: 'wsIn', kind: 'something-else', level: 'info'
            })
        })
    })
})
