const {Subject} = require('rxjs')
const {
    aUserChatHarness, anAdvancingClock, createInMemoryConversationsStore,
    firstValue, run
} = require('../harness')

const T1 = 1700000000000
const T2 = T1 + 60000
const ISO_T1 = new Date(T1).toISOString()
const ISO_T2 = new Date(T2).toISOString()

describe('conversation lifecycle', () => {

    describe('when creating a conversation', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({conversationIds: ['conv-1']})
        })

        it('emits a targeted conversation-created event with the pending metadata', () => {
            run(harness.handle$({type: 'create-conversation'}))

            expect(eventsOfKind(harness, 'conversation-created')).toEqual([{
                kind: 'conversation-created',
                targeting: 'targeted',
                payload: {conversationId: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            }])
        })

        it('claims the new conversation for sibling tabs via a broadcast-except event', () => {
            run(harness.handle$({type: 'create-conversation'}))

            expect(eventsOfKind(harness, 'conversation-claimed')).toEqual([{
                kind: 'conversation-claimed',
                targeting: 'broadcastExcept',
                payload: {conversationId: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            }])
        })

        it('does not persist the conversation until the user sends its first message', async () => {
            run(harness.handle$({type: 'create-conversation'}))

            const persisted = await firstValue(harness.conversationsStore.list$())
            expect(persisted).toEqual([])
        })
    })

    describe('when sending a first user message in a pending conversation', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{text: 'Hi!'}]
            })
        })

        it('persists the conversation metadata in the store', async () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi'}))

            const persisted = await firstValue(harness.conversationsStore.list$())
            expect(persisted).toEqual([
                {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            ])
        })

        it('records the user message and assistant reply in the conversation history', async () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi'}))

            const stored = await firstValue(harness.historyFor('conv-1').load$())
            expect(stored).toEqual([
                {role: 'user', content: 'hi'},
                {role: 'assistant', content: 'Hi!'}
            ])
        })
    })

    describe('when a persisted conversation receives a subsequent message', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{text: 'Hi!'}, {text: 'Hi again!'}],
                clock: anAdvancingClock([T1, T2])
            })
        })

        it('touches updatedAt on the persisted metadata', async () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi'}))

            const persisted = await firstValue(harness.conversationsStore.list$())
            expect(persisted).toEqual([
                {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T2}
            ])
        })
    })

    describe('when listing conversations after several persisted turns', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1', 'conv-2'],
                replies: [{text: 'Hi!'}]
            })
        })

        it('emits a targeted conversations event with every persisted conversation', () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi'}))
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-2', text: 'hi'}))
            run(harness.handle$({type: 'list-conversations'}))

            expect(eventsOfKind(harness, 'conversations')).toEqual([{
                kind: 'conversations',
                targeting: 'targeted',
                payload: {conversations: [
                    {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1},
                    {id: 'conv-2', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
                ]}
            }])
        })
    })

    describe('when a select-conversation arrives while the assistant is still streaming', () => {
        let harness, replies$
        beforeEach(() => {
            replies$ = new Subject()
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                llm: {respondTo$: () => replies$, receivedMessages: []}
            })
        })

        it('emits a status event for the conversation that is still streaming', () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))
            harness.channelEvents.length = 0

            run(harness.handle$({type: 'select-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness, 'status')).toContainEqual(
                expect.objectContaining({payload: expect.objectContaining({conversationId: 'conv-1'})})
            )
        })

        it('replays the in-progress messages on the select event before the stream completes', () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))

            run(harness.handle$({type: 'select-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness, 'conversation-loaded')).toContainEqual(
                expect.objectContaining({
                    payload: expect.objectContaining({
                        conversationId: 'conv-1',
                        messages: [{role: 'user', content: 'hello'}]
                    })
                })
            )
        })

        it('omits status from the select event once the stream has completed', () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))
            replies$.next({textDelta: 'Hi!'})
            replies$.complete()

            harness.channelEvents.length = 0
            run(harness.handle$({type: 'select-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness, 'status')).toEqual([])
            expect(eventsOfKind(harness, 'conversation-loaded')).toEqual([{
                kind: 'conversation-loaded',
                targeting: 'targeted',
                payload: {
                    conversationId: 'conv-1',
                    messages: [
                        {role: 'user', content: 'hello'},
                        {role: 'assistant', content: 'Hi!'}
                    ]
                }
            }])
        })
    })

    describe('when the conversation exists only in the store (rebuilt on demand)', () => {
        const persistedMeta = {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
        const priorMessages = [
            {role: 'user', content: 'first'},
            {role: 'assistant', content: 'reply'}
        ]

        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{text: 'Again!'}],
                conversationsStore: createInMemoryConversationsStore([persistedMeta]),
                initialMessagesById: {'conv-1': priorMessages}
            })
        })

        it('emits the persisted messages on select-conversation', () => {
            run(harness.handle$({type: 'select-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness, 'conversation-loaded')).toEqual([{
                kind: 'conversation-loaded',
                targeting: 'targeted',
                payload: {conversationId: 'conv-1', messages: priorMessages}
            }])
        })

        it('passes the rebuilt history plus the new user message to the LLM on the next turn', () => {
            run(harness.handle$({type: 'select-conversation', conversationId: 'conv-1'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'again'}))

            expect(harness.llm.receivedMessages[0]).toEqual([
                ...priorMessages,
                {role: 'user', content: 'again'}
            ])
        })
    })

    describe('when commands target an unknown conversation id', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({conversationIds: ['conv-1']})
        })

        it('emits no channel events for select / message / delete on an unknown id', () => {
            run(harness.handle$({type: 'select-conversation', conversationId: 'nope'}))
            run(harness.handle$({type: 'message', conversationId: 'nope', text: 'hello'}))
            run(harness.handle$({type: 'delete-conversation', conversationId: 'nope'}))

            expect(harness.channelEvents).toEqual([])
        })
    })

    describe('when deleting a pending (unpersisted) conversation', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({conversationIds: ['conv-1']})
            run(harness.handle$({type: 'create-conversation'}))
        })

        it('emits a conversation-deleted event without touching the store', async () => {
            harness.channelEvents.length = 0

            run(harness.handle$({type: 'delete-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness, 'conversation-deleted')).toEqual([{
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
            harness.channelEvents.length = 0

            run(harness.handle$({type: 'delete-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness, 'conversation-deleted')).toEqual([{
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
            harness.channelEvents.length = 0

            run(harness.handle$({type: 'delete-all-conversations'}))

            expect(eventsOfKind(harness, 'conversation-deleted').map(event =>
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

            const lateChatResponses = eventsOfKind(harness, 'chat-response').filter(event =>
                event.payload.text === 'too late'
            )
            expect(lateChatResponses).toEqual([])
        })
    })
})

function eventsOfKind(harness, kind) {
    return harness.channelEvents.filter(event => event.kind === kind)
}
