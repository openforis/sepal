const {aWsHandlerHarness} = require('../../harness')
const {alice} = require('./fixtures')

const aliceTargeted = {username: 'alice', clientId: 'c1', subscriptionId: 's1'}
// Metadata a freshly created conversation carries before any title or
// subsequent activity: empty title, createdAt === updatedAt at clock T0.
const FRESH_META = {
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
            data: {type: 'conversation-created', conversationId: 'conv-1', ...FRESH_META}
        }])
        expect(harness.sent.filter(frame => frame.data?.type === 'conversation-claimed')).toEqual([{
            username: 'alice',
            excludeClientId: 'c1',
            data: {type: 'conversation-claimed', conversationId: 'conv-1', ...FRESH_META}
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
                conversations: [{id: 'conv-1', ...FRESH_META}, {id: 'conv-2', ...FRESH_META}]
            }
        })
    })
})
