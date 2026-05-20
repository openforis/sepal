const {Subject} = require('rxjs')
const {aUserChatHarness, eventsOfKind, firstValue, run} = require('../../harness')

describe('deleting conversations', () => {

    describe('when deleting a pending (unpersisted) conversation', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({conversationIds: ['conv-1']})
            run(harness.handle$({type: 'create-conversation'}))
        })

        it('emits a conversation-deleted event without touching the store', async () => {
            const marker = harness.eventsMarker()

            run(harness.handle$({type: 'delete-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness.eventsSince(marker), 'conversation-deleted')).toEqual([{
                kind: 'conversation-deleted',
                targeting: 'broadcast',
                payload: {conversationId: 'conv-1'}
            }])
            const persisted = await firstValue(harness.conversationsStore.list$())
            expect(persisted).toEqual([])
        })
    })

    describe('when deleting one conversation of several', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1', 'conv-2'],
                replies: [{text: 'Hi!'}]
            })
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi'}))
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-2', text: 'hi'}))
        })

        it('emits a broadcast conversation-deleted event for the target id', () => {
            const marker = harness.eventsMarker()

            run(harness.handle$({type: 'delete-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness.eventsSince(marker), 'conversation-deleted')).toEqual([{
                kind: 'conversation-deleted',
                targeting: 'broadcast',
                payload: {conversationId: 'conv-1'}
            }])
        })

        it('removes the conversation from the persisted store', async () => {
            run(harness.handle$({type: 'delete-conversation', conversationId: 'conv-1'}))

            const persisted = await firstValue(harness.conversationsStore.list$())
            expect(persisted.map(meta => meta.id)).toEqual(['conv-2'])
        })
    })

    describe('when delete-all-conversations runs over several persisted conversations', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1', 'conv-2'],
                replies: [{text: 'Hi!'}]
            })
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi'}))
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-2', text: 'hi'}))
        })

        it('emits one conversation-deleted event per conversation', () => {
            const marker = harness.eventsMarker()

            run(harness.handle$({type: 'delete-all-conversations'}))

            expect(eventsOfKind(harness.eventsSince(marker), 'conversation-deleted').map(event =>
                event.payload.conversationId
            )).toEqual(['conv-1', 'conv-2'])
        })

        it('leaves the persisted store empty', async () => {
            run(harness.handle$({type: 'delete-all-conversations'}))

            const persisted = await firstValue(harness.conversationsStore.list$())
            expect(persisted).toEqual([])
        })
    })

    describe('when delete-all-conversations runs with nothing to delete', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({conversationIds: ['conv-1']})
        })

        it('emits no channel events', () => {
            run(harness.handle$({type: 'delete-all-conversations'}))

            expect(harness.channelEvents).toEqual([])
        })
    })

    describe('when an in-flight stream is interrupted by delete-conversation', () => {
        let harness, replies$
        beforeEach(() => {
            replies$ = new Subject()
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                llm: {respondTo$: () => replies$, receivedMessages: []}
            })
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))
        })

        it('stops forwarding subsequent textDelta events to the channel', () => {
            run(harness.handle$({type: 'delete-conversation', conversationId: 'conv-1'}))
            replies$.next({textDelta: 'too late'})

            const lateChatResponses = eventsOfKind(harness.channelEvents, 'chat-response').filter(event =>
                event.payload.text === 'too late'
            )
            expect(lateChatResponses).toEqual([])
        })
    })
})
