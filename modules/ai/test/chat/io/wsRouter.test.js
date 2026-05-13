const {createWsRouter} = require('#mcp/chat/io/wsRouter')

describe('WS router', () => {

    const aliceSub = {username: 'alice', clientId: 'c1', subscriptionId: 's1'}
    const aliceWire = {user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'}
    const aliceLabel = 'c1:s1 (alice)'

    let published, bus

    beforeEach(() => {
        published = []
        bus = {publish: event => published.push(event)}
    })

    function aSpyHandlers() {
        const calls = {
            subscribe: [], unsubscribe: [], createConversation: [],
            selectConversation: [], deleteConversation: [], listConversations: [],
            sendUserMessage: [], abort: []
        }
        return {
            subscribe: s => calls.subscribe.push(s),
            unsubscribe: s => calls.unsubscribe.push(s),
            createConversation: s => calls.createConversation.push(s),
            selectConversation: (s, id) => calls.selectConversation.push({s, id}),
            deleteConversation: (s, id) => calls.deleteConversation.push({s, id}),
            listConversations: s => calls.listConversations.push(s),
            sendUserMessage: (s, id, text) => calls.sendUserMessage.push({s, id, text}),
            abort: (s, id) => calls.abort.push({s, id}),
            calls
        }
    }

    describe('dispatches the matching domain method', () => {

        it('subscriptionUp → subscribe', () => {
            const handlers = aSpyHandlers()
            createWsRouter({bus, handlers}).receive({event: 'subscriptionUp', ...aliceWire})

            expect(handlers.calls.subscribe).toEqual([aliceSub])
        })

        it('subscriptionDown → unsubscribe', () => {
            const handlers = aSpyHandlers()
            createWsRouter({bus, handlers}).receive({event: 'subscriptionDown', ...aliceWire})

            expect(handlers.calls.unsubscribe).toEqual([aliceSub])
        })

        it('create-conversation → createConversation', () => {
            const handlers = aSpyHandlers()
            createWsRouter({bus, handlers}).receive({data: {type: 'create-conversation'}, ...aliceWire})

            expect(handlers.calls.createConversation).toEqual([aliceSub])
        })

        it('select-conversation → selectConversation with the conversationId', () => {
            const handlers = aSpyHandlers()
            createWsRouter({bus, handlers}).receive({data: {type: 'select-conversation', conversationId: 'conv-9'}, ...aliceWire})

            expect(handlers.calls.selectConversation).toEqual([{s: aliceSub, id: 'conv-9'}])
        })

        it('delete-conversation → deleteConversation with the conversationId', () => {
            const handlers = aSpyHandlers()
            createWsRouter({bus, handlers}).receive({data: {type: 'delete-conversation', conversationId: 'conv-9'}, ...aliceWire})

            expect(handlers.calls.deleteConversation).toEqual([{s: aliceSub, id: 'conv-9'}])
        })

        it('list-conversations → listConversations', () => {
            const handlers = aSpyHandlers()
            createWsRouter({bus, handlers}).receive({data: {type: 'list-conversations'}, ...aliceWire})

            expect(handlers.calls.listConversations).toEqual([aliceSub])
        })

        it('abort → abort with the conversationId', () => {
            const handlers = aSpyHandlers()
            createWsRouter({bus, handlers}).receive({data: {type: 'abort', conversationId: 'conv-9'}, ...aliceWire})

            expect(handlers.calls.abort).toEqual([{s: aliceSub, id: 'conv-9'}])
        })

        it('message → sendUserMessage with the conversationId and text', () => {
            const handlers = aSpyHandlers()
            createWsRouter({bus, handlers}).receive({data: {type: 'message', conversationId: 'conv-9', text: 'Hello'}, ...aliceWire})

            expect(handlers.calls.sendUserMessage).toEqual([{s: aliceSub, id: 'conv-9', text: 'Hello'}])
        })

        it('context — recognised, no handler dispatched (until templating lands)', () => {
            const handlers = aSpyHandlers()
            createWsRouter({bus, handlers}).receive({
                data: {type: 'context', selection: {section: 'process'}}, ...aliceWire
            })

            expect(handlers.calls).toEqual({
                subscribe: [], unsubscribe: [], createConversation: [],
                selectConversation: [], deleteConversation: [], listConversations: [],
                sendUserMessage: [], abort: []
            })
        })
    })

    describe('silently ignores noise', () => {

        it('heartbeat — no event, no dispatch', () => {
            const handlers = aSpyHandlers()
            createWsRouter({bus, handlers}).receive({hb: 12345})

            expect(published).toEqual([])
        })

        it('gateway lifecycle events (userUp, clientUp, etc.) — events we don\'t subscribe to', () => {
            const handlers = aSpyHandlers()
            const router = createWsRouter({bus, handlers})

            router.receive({event: 'userUp', user: {username: 'alice'}})
            router.receive({event: 'clientUp', user: {username: 'alice'}, clientId: 'c1'})
            router.receive({event: 'clientDown', user: {username: 'alice'}, clientId: 'c1'})

            expect(published).toEqual([])
        })

        it('empty messages — no event, no data', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({user: {username: 'alice'}})

            expect(published).toEqual([])
        })
    })

    describe('publishes a self-describing wsIn event', () => {

        it('subscriptionUp', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({event: 'subscriptionUp', ...aliceWire})

            expect(published).toEqual([{
                type: 'wsIn', kind: 'subscriptionUp', ...aliceSub,
                level: 'info',
                message: `WS in ${aliceLabel} subscriptionUp`
            }])
        })

        it('subscriptionDown', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({event: 'subscriptionDown', ...aliceWire})

            expect(published[0]).toMatchObject({
                kind: 'subscriptionDown',
                level: 'info',
                message: `WS in ${aliceLabel} subscriptionDown`
            })
        })

        it('createConversation', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({data: {type: 'create-conversation'}, ...aliceWire})

            expect(published[0]).toMatchObject({
                kind: 'createConversation',
                level: 'info',
                message: `WS in ${aliceLabel} createConversation`
            })
        })

        it('selectConversation with the conversationId', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({data: {type: 'select-conversation', conversationId: 'conv-9'}, ...aliceWire})

            expect(published[0]).toMatchObject({
                kind: 'selectConversation',
                conversationId: 'conv-9',
                level: 'info',
                message: `WS in ${aliceLabel} selectConversation conv-9`
            })
        })

        it('deleteConversation with the conversationId', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({data: {type: 'delete-conversation', conversationId: 'conv-9'}, ...aliceWire})

            expect(published[0]).toMatchObject({
                kind: 'deleteConversation',
                level: 'info',
                message: `WS in ${aliceLabel} deleteConversation conv-9`
            })
        })

        it('listConversations', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({data: {type: 'list-conversations'}, ...aliceWire})

            expect(published[0]).toMatchObject({
                kind: 'listConversations',
                level: 'info',
                message: `WS in ${aliceLabel} listConversations`
            })
        })

        it('abort with the conversationId', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({data: {type: 'abort', conversationId: 'conv-9'}, ...aliceWire})

            expect(published[0]).toMatchObject({
                kind: 'abort',
                conversationId: 'conv-9',
                level: 'info',
                message: `WS in ${aliceLabel} abort conv-9`
            })
        })

        it('message with the conversationId and text', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({data: {type: 'message', conversationId: 'conv-9', text: 'Hello'}, ...aliceWire})

            expect(published[0]).toMatchObject({
                kind: 'message',
                conversationId: 'conv-9',
                text: 'Hello',
                level: 'info',
                message: `WS in ${aliceLabel} message conv-9: "Hello"`
            })
        })

        it('context at debug (recognised, fires on every GUI selection change)', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({
                data: {type: 'context', selection: {section: 'process'}}, ...aliceWire
            })

            expect(published[0]).toMatchObject({
                kind: 'context',
                level: 'debug',
                message: `WS in ${aliceLabel} context`
            })
        })

        it('unknown data type — at warn level', () => {
            createWsRouter({bus, handlers: aSpyHandlers()}).receive({data: {type: 'something-else'}, ...aliceWire})

            expect(published[0]).toMatchObject({
                kind: 'unknown',
                dataType: 'something-else',
                level: 'warn',
                message: `WS in ${aliceLabel} unknown data type: something-else (ignored)`
            })
        })
    })
})
