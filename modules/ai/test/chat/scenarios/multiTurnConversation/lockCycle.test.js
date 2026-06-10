import {aUserChatHarness, eventsOfKind, run} from '../../harness.js'

describe('first-turn lock cycle', () => {
    let harness
    beforeEach(() => {
        harness = aUserChatHarness({conversationIds: ['conv-1'], replies: [{text: 'Hi!'}]})
        run(harness.handle$({type: 'create-conversation'}))
    })

    it('broadcasts a status event for the locked conversation', () => {
        run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))

        expect(eventsOfKind(harness.channelEvents, 'status')).toEqual([
            {kind: 'status', targeting: 'broadcast', payload: {conversationId: 'conv-1'}}
        ])
    })

    it('broadcasts the user message to sibling tabs (broadcastExcept)', () => {
        run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))

        expect(eventsOfKind(harness.channelEvents, 'user-message')).toEqual([
            {kind: 'user-message', targeting: 'broadcastExcept',
                payload: {conversationId: 'conv-1', text: 'hello'}}
        ])
    })

    it('streams the assistant reply and a final complete on the chat-response channel', () => {
        run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))

        expect(eventsOfKind(harness.channelEvents, 'chat-response')).toEqual([
            {kind: 'chat-response', targeting: 'broadcast',
                payload: {conversationId: 'conv-1', text: 'Hi!'}},
            {kind: 'chat-response', targeting: 'broadcast',
                payload: {conversationId: 'conv-1', complete: true}}
        ])
    })
})
