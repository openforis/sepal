const {
    alice, aliceTargeted, META,
    aHandler, captureSent, aRecordingBus, createInMemoryConversationsStore
} = require('./wsHandlerHarness')

describe('Chat WS handler — command routing', () => {

    describe('subscriptionUp', () => {

        it('pushes the user\'s conversation list to the new subscription so the tab can populate on connect', () => {
            const bus = aRecordingBus()
            const {arg$, sent} = captureSent(aHandler({bus}))

            arg$.next({event: 'subscriptionUp', ...alice})

            expect(sent.filter(m => m.data?.type === 'conversations')).toEqual([{
                ...aliceTargeted,
                data: {type: 'conversations', conversations: []}
            }])
            expect(recoveredSubscriptions(bus)).toEqual([])
        })
    })

    describe('create-conversation', () => {

        it('emits conversation-created targeted to the originator and conversation-claimed as broadcast-except', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'conversation-created')).toEqual([{
                ...aliceTargeted,
                data: {type: 'conversation-created', conversationId: 'conv-1', ...META}
            }])
            expect(sent.filter(m => m.data?.type === 'conversation-claimed')).toEqual([{
                username: 'alice',
                excludeClientId: 'c1',
                data: {type: 'conversation-claimed', conversationId: 'conv-1', ...META}
            }])
        })
    })

    describe('message', () => {

        it('emits chat-response as a broadcast (no clientId, no subscriptionId)', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'chat-response')).toEqual([
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', text: 'Hi there!'}},
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', complete: true}}
            ])
        })

        it('uses the supplied conversationId instead of server-side active selection', () => {
            const {arg$, sent} = captureSent(aHandler({
                replies: [{text: 'First reply'}, {text: 'Second reply'}],
                conversationIds: ['conv-1', 'conv-2']
            }))

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'chat-response')).toEqual([
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', text: 'First reply'}},
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', complete: true}}
            ])
        })

        it('drops messages that arrive before a conversation is created', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'chat-response')).toEqual([])
        })

        it('drops messages that arrive after subscriptionDown', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({event: 'subscriptionDown', ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'chat-response')).toEqual([])
        })

        it('recovers a missing subscription and routes a message after reconnect when the conversation is persisted', () => {
            const conversationsStore = createInMemoryConversationsStore()
            const first = captureSent(aHandler({
                conversationsStore,
                replies: [{text: 'First reply'}]
            }))
            first.arg$.next({event: 'subscriptionUp', ...alice})
            first.arg$.next({data: {type: 'create-conversation'}, ...alice})
            first.arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})
            expect(first.sent.filter(m => m.data?.type === 'chat-response')).toHaveLength(2)

            const bus = aRecordingBus()
            const recovered = captureSent(aHandler({
                conversationsStore,
                bus,
                replies: [{text: 'Recovered reply'}]
            }))
            recovered.arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Again'}, ...alice})

            expect(recovered.sent.filter(m => m.data?.type === 'chat-response')).toEqual([
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', text: 'Recovered reply'}},
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', complete: true}}
            ])
            expect(recoveredSubscriptions(bus)).toEqual([{
                username: 'alice', clientId: 'c1', subscriptionId: 's1'
            }])
        })
    })

    describe('select-conversation', () => {

        it('emits conversation-loaded targeted to the requester with the messages', () => {
            const {arg$, sent} = captureSent(aHandler({
                replies: [{text: 'A1'}], conversationIds: ['conv-1', 'conv-2']
            }))

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'first'}, ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'select-conversation', conversationId: 'conv-1'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'conversation-loaded')).toEqual([{
                ...aliceTargeted,
                data: {
                    type: 'conversation-loaded',
                    conversationId: 'conv-1',
                    messages: [
                        {role: 'user', content: 'first'},
                        {role: 'assistant', content: 'A1'}
                    ]
                }
            }])
        })
    })

    describe('list-conversations', () => {

        it('emits conversations targeted to the requester', () => {
            const {arg$, sent} = captureSent(aHandler({conversationIds: ['conv-1', 'conv-2']}))

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'hi'}, ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-2', text: 'hi'}, ...alice})
            arg$.next({data: {type: 'list-conversations'}, ...alice})

            const conversationsEvents = sent.filter(m => m.data?.type === 'conversations')
            expect(conversationsEvents.at(-1)).toEqual({
                ...aliceTargeted,
                data: {
                    type: 'conversations',
                    conversations: [{id: 'conv-1', ...META}, {id: 'conv-2', ...META}]
                }
            })
        })

        it('recovers a missing subscription for data messages and emits the targeted list', () => {
            const bus = aRecordingBus()
            const {arg$, sent} = captureSent(aHandler({bus}))

            arg$.next({data: {type: 'list-conversations'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'conversations')).toEqual([{
                ...aliceTargeted,
                data: {type: 'conversations', conversations: []}
            }])
            expect(recoveredSubscriptions(bus)).toEqual([{
                username: 'alice', clientId: 'c1', subscriptionId: 's1'
            }])
        })
    })

    describe('subscriptionDown', () => {

        it('does not create a missing subscription but still cancels pending GUI requests', () => {
            const bus = aRecordingBus()
            const cancellations = []
            const guiRequests = {
                respond: () => {},
                cancelForSubscription: subscription => cancellations.push(subscription)
            }
            const {arg$, sent} = captureSent(aHandler({bus, guiRequests}))

            arg$.next({event: 'subscriptionDown', ...alice})

            expect(cancellations).toEqual([{clientId: 'c1', subscriptionId: 's1'}])
            expect(recoveredSubscriptions(bus)).toEqual([])
            expect(sent.filter(m => m.data?.type === 'conversations')).toEqual([])
        })
    })

    describe('lock-cycle (status + user-message + abort)', () => {

        it('emits status (broadcast) and user-message (broadcast-except) when a message arrives', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'status')).toEqual([{
                username: 'alice',
                data: {type: 'status', conversationId: 'conv-1'}
            }])
            expect(sent.filter(m => m.data?.type === 'user-message')).toEqual([{
                username: 'alice',
                excludeClientId: 'c1',
                data: {type: 'user-message', conversationId: 'conv-1', text: 'Hello'}
            }])
        })

        it('routes abort through to a chat-response complete broadcast', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})
            arg$.next({data: {type: 'abort', conversationId: 'conv-1'}, ...alice})

            const completes = sent
                .filter(m => m.data?.type === 'chat-response' && m.data?.complete)
            expect(completes.length).toBeGreaterThanOrEqual(1)
            expect(completes[completes.length - 1]).toEqual({
                username: 'alice',
                data: {type: 'chat-response', conversationId: 'conv-1', complete: true}
            })
        })
    })

    describe('delete-conversation', () => {

        it('emits conversation-deleted as a broadcast', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'delete-conversation', conversationId: 'conv-1'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'conversation-deleted')).toEqual([{
                username: 'alice',
                data: {type: 'conversation-deleted', conversationId: 'conv-1'}
            }])
        })
    })

    describe('delete-all-conversations', () => {

        it('emits conversation-deleted as a broadcast for each conversation', () => {
            const {arg$, sent} = captureSent(aHandler({conversationIds: ['conv-1', 'conv-2']}))

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'delete-all-conversations'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'conversation-deleted')).toEqual([
                {username: 'alice', data: {type: 'conversation-deleted', conversationId: 'conv-1'}},
                {username: 'alice', data: {type: 'conversation-deleted', conversationId: 'conv-2'}}
            ])
        })
    })

    function recoveredSubscriptions(bus) {
        return bus.published
            .filter(event => event.type === 'wsSubscriptionRecovered')
            .map(({username, clientId, subscriptionId}) => ({username, clientId, subscriptionId}))
    }
})
