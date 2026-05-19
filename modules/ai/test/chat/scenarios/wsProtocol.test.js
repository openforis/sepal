const {EMPTY, throwError} = require('rxjs')
const {aWsHandlerHarness} = require('../harness')

describe('WS protocol', () => {

    const alice = {user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'}
    const aliceTargeted = {username: 'alice', clientId: 'c1', subscriptionId: 's1'}
    const META = {
        title: '',
        createdAt: new Date(1700000000000).toISOString(),
        updatedAt: new Date(1700000000000).toISOString()
    }

    describe('frame routing', () => {
        let harness
        beforeEach(() => {
            harness = aWsHandlerHarness()
        })

        it('pushes the conversation list to the new subscription on subscriptionUp', () => {
            harness.feed({event: 'subscriptionUp', ...alice})

            expect(harness.sent.filter(frame => frame.data?.type === 'conversations')).toEqual([{
                ...aliceTargeted,
                data: {type: 'conversations', conversations: []}
            }])
        })

        it('emits conversation-created targeted and conversation-claimed broadcast-except on create-conversation', () => {
            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})

            expect(harness.sent.filter(frame => frame.data?.type === 'conversation-created')).toEqual([{
                ...aliceTargeted,
                data: {type: 'conversation-created', conversationId: 'conv-1', ...META}
            }])
            expect(harness.sent.filter(frame => frame.data?.type === 'conversation-claimed')).toEqual([{
                username: 'alice',
                excludeClientId: 'c1',
                data: {type: 'conversation-claimed', conversationId: 'conv-1', ...META}
            }])
        })

        it('runs the message lock cycle: status (broadcast), user-message (broadcast-except), chat-response (broadcast)', () => {
            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})
            harness.feed({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(harness.sent.filter(frame => frame.data?.type === 'status')).toEqual([{
                username: 'alice',
                data: {type: 'status', conversationId: 'conv-1'}
            }])
            expect(harness.sent.filter(frame => frame.data?.type === 'user-message')).toEqual([{
                username: 'alice',
                excludeClientId: 'c1',
                data: {type: 'user-message', conversationId: 'conv-1', text: 'Hello'}
            }])
            expect(harness.sent.filter(frame => frame.data?.type === 'chat-response')).toEqual([
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', text: 'Hi there!'}},
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', complete: true}}
            ])
        })

        it('completes chat-response (broadcast) on abort', () => {
            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})
            harness.feed({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})
            harness.feed({data: {type: 'abort', conversationId: 'conv-1'}, ...alice})

            const completes = harness.sent.filter(
                frame => frame.data?.type === 'chat-response' && frame.data?.complete
            )
            expect(completes.at(-1)).toEqual({
                username: 'alice',
                data: {type: 'chat-response', conversationId: 'conv-1', complete: true}
            })
        })

        it('emits conversation-deleted (broadcast) on delete-conversation', () => {
            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})
            harness.feed({data: {type: 'delete-conversation', conversationId: 'conv-1'}, ...alice})

            expect(harness.sent.filter(frame => frame.data?.type === 'conversation-deleted')).toEqual([{
                username: 'alice',
                data: {type: 'conversation-deleted', conversationId: 'conv-1'}
            }])
        })

        it('emits conversation-deleted (broadcast) for each conversation on delete-all-conversations', () => {
            harness = aWsHandlerHarness({conversationIds: ['conv-1', 'conv-2']})

            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})
            harness.feed({data: {type: 'delete-all-conversations'}, ...alice})

            expect(harness.sent.filter(frame => frame.data?.type === 'conversation-deleted')).toEqual([
                {username: 'alice', data: {type: 'conversation-deleted', conversationId: 'conv-1'}},
                {username: 'alice', data: {type: 'conversation-deleted', conversationId: 'conv-2'}}
            ])
        })

        it('emits conversation-loaded targeted with messages on select-conversation', () => {
            harness = aWsHandlerHarness({
                conversationIds: ['conv-1', 'conv-2'],
                replies: [{text: 'A1'}]
            })

            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})
            harness.feed({data: {type: 'message', conversationId: 'conv-1', text: 'first'}, ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})
            harness.feed({data: {type: 'select-conversation', conversationId: 'conv-1'}, ...alice})

            expect(harness.sent.filter(frame => frame.data?.type === 'conversation-loaded')).toEqual([{
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

        it('emits conversations targeted on list-conversations', () => {
            harness = aWsHandlerHarness({conversationIds: ['conv-1', 'conv-2']})

            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})
            harness.feed({data: {type: 'message', conversationId: 'conv-1', text: 'hi'}, ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})
            harness.feed({data: {type: 'message', conversationId: 'conv-2', text: 'hi'}, ...alice})
            harness.feed({data: {type: 'list-conversations'}, ...alice})

            const lists = harness.sent.filter(frame => frame.data?.type === 'conversations')
            expect(lists.at(-1)).toEqual({
                ...aliceTargeted,
                data: {
                    type: 'conversations',
                    conversations: [{id: 'conv-1', ...META}, {id: 'conv-2', ...META}]
                }
            })
        })
    })

    describe('subscription lifecycle', () => {

        it('drops chat messages that arrive before subscriptionUp', () => {
            const harness = aWsHandlerHarness()

            harness.feed({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(harness.sent.filter(frame => frame.data?.type === 'chat-response')).toEqual([])
        })

        it('drops chat messages that arrive after subscriptionDown', () => {
            const harness = aWsHandlerHarness()

            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({data: {type: 'create-conversation'}, ...alice})
            harness.feed({event: 'subscriptionDown', ...alice})
            harness.feed({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(harness.sent.filter(frame => frame.data?.type === 'chat-response')).toEqual([])
        })

        it('recovers a missing subscription and routes a data message when the conversation persists', () => {
            const conversationsStore = aWsHandlerHarness().conversationsStore
            const first = aWsHandlerHarness({conversationsStore, replies: [{text: 'First reply'}]})
            first.feed({event: 'subscriptionUp', ...alice})
            first.feed({data: {type: 'create-conversation'}, ...alice})
            first.feed({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            const recovered = aWsHandlerHarness({conversationsStore, replies: [{text: 'Recovered reply'}]})
            recovered.feed({data: {type: 'message', conversationId: 'conv-1', text: 'Again'}, ...alice})

            expect(recovered.sent.filter(frame => frame.data?.type === 'chat-response')).toEqual([
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', text: 'Recovered reply'}},
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', complete: true}}
            ])
            expect(recovered.bus.events.filter(event => event.type === 'wsSubscriptionRecovered')).toHaveLength(1)
        })
    })

    describe('context routing', () => {
        let handled, harness

        beforeEach(() => {
            handled = []
            harness = aWsHandlerHarness({
                userChatFor: () => ({handle$: args => { handled.push(args); return EMPTY }})
            })
        })

        it('forwards a context message to userChat with subscription identity', () => {
            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({data: {type: 'context', guiContext: {section: 'process'}}, ...alice})

            expect(handled).toContainEqual(expect.objectContaining({
                type: 'context',
                clientId: 'c1',
                subscriptionId: 's1',
                guiContext: {section: 'process'}
            }))
        })

        it('routes clear-context to userChat on subscriptionDown', () => {
            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({event: 'subscriptionDown', ...alice})

            expect(handled).toContainEqual(expect.objectContaining({
                type: 'clear-context',
                clientId: 'c1',
                subscriptionId: 's1'
            }))
        })
    })

    describe('GUI bridge', () => {

        it('routes a gui-response to guiRequests.respond scoped to the responding subscription', () => {
            const harness = aWsHandlerHarness()

            harness.feed({event: 'subscriptionUp', ...alice})
            harness.feed({
                data: {type: 'gui-response', requestId: 'req-1', success: true, data: {echoed: 'hi'}},
                ...alice
            })

            expect(harness.guiRequests.respondCalls).toEqual([{
                clientId: 'c1', subscriptionId: 's1',
                requestId: 'req-1', success: true, data: {echoed: 'hi'}
            }])
        })

        it('cancels pending GUI requests for a subscription on subscriptionDown without creating a subscription', () => {
            const harness = aWsHandlerHarness()

            harness.feed({event: 'subscriptionDown', ...alice})

            expect(harness.guiRequests.cancelCalls).toEqual([{clientId: 'c1', subscriptionId: 's1'}])
            expect(harness.sent.filter(frame => frame.data?.type === 'conversations')).toEqual([])
        })
    })

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
})
