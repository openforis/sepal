const {Subject} = require('rxjs')
const {aUserChatHarness, createInMemoryConversationsStore, eventsOfKind, run} = require('../../harness')
const {ISO_T1} = require('./fixtures')

describe('selecting a conversation', () => {

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
            const marker = harness.eventsMarker()

            run(harness.handle$({type: 'select-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness.eventsSince(marker), 'status')).toContainEqual(
                expect.objectContaining({payload: expect.objectContaining({conversationId: 'conv-1'})})
            )
        })

        it('replays the in-progress messages on the select event before the stream completes', () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))

            run(harness.handle$({type: 'select-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness.channelEvents, 'conversation-loaded')).toContainEqual(
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

            const marker = harness.eventsMarker()
            run(harness.handle$({type: 'select-conversation', conversationId: 'conv-1'}))

            expect(eventsOfKind(harness.eventsSince(marker), 'status')).toEqual([])
            expect(eventsOfKind(harness.eventsSince(marker), 'conversation-loaded')).toEqual([{
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

            expect(eventsOfKind(harness.channelEvents, 'conversation-loaded')).toEqual([{
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
})
