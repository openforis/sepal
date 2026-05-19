const {Subject} = require('rxjs')
const {aUserChatHarness, aControllableLlm, aStallingTitleGenerator, firstValue, run} = require('../harness')

const SUB_A = {clientId: 'c1', subscriptionId: 's1'}
const SUB_B = {clientId: 'c2', subscriptionId: 's2'}

describe('multi-turn conversation', () => {

    describe('turn ordering', () => {

        describe('within one conversation', () => {
            let harness, llm
            beforeEach(() => {
                llm = aControllableLlm()
                harness = aUserChatHarness({conversationIds: ['conv-1'], llm})
                run(harness.handle$({type: 'create-conversation'}))
            })

            it('the second turn sees the completed first-turn history on its LLM call', () => {
                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'first'}))
                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'second'}))
                llm.calls[0].subject.next({textDelta: 'reply one'})
                llm.calls[0].subject.complete()

                expect(llm.calls[1].messages).toEqual([
                    {role: 'user', content: 'first'},
                    {role: 'assistant', content: 'reply one'},
                    {role: 'user', content: 'second'}
                ])
            })

            it('does not start the second LLM call until the first turn completes', () => {
                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'first'}))
                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'second'}))

                expect(llm.calls).toHaveLength(1)
            })
        })

        describe('across two conversations', () => {
            let harness, llm
            beforeEach(() => {
                llm = aControllableLlm()
                harness = aUserChatHarness({conversationIds: ['conv-1', 'conv-2'], llm})
                run(harness.handle$({type: 'create-conversation'}))
                run(harness.handle$({type: 'create-conversation'}))
            })

            it('lets two unfinished turns run in parallel', () => {
                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'to one'}))
                run(harness.handle$({type: 'message', conversationId: 'conv-2', text: 'to two'}))

                expect(llm.calls).toHaveLength(2)
            })
        })
    })

    describe('abort', () => {

        describe('with an in-flight stream', () => {
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

            it('completes the chat-response channel for the conversation', () => {
                run(harness.handle$({type: 'abort', conversationId: 'conv-1'}))

                expect(chatResponseCompletes(harness, 'conv-1')).toEqual([
                    {kind: 'chat-response', targeting: 'broadcast',
                        payload: {conversationId: 'conv-1', complete: true}}
                ])
            })

            it('drops late LLM textDelta events after the abort', () => {
                run(harness.handle$({type: 'abort', conversationId: 'conv-1'}))
                replies$.next({textDelta: 'too late'})

                expect(lateChatResponses(harness)).toEqual([])
            })
        })

        describe('with no in-flight stream', () => {
            it('emits no channel events', () => {
                const harness = aUserChatHarness({conversationIds: ['conv-1']})
                run(harness.handle$({type: 'create-conversation'}))
                harness.channelEvents.length = 0

                run(harness.handle$({type: 'abort', conversationId: 'conv-1'}))

                expect(harness.channelEvents).toEqual([])
            })
        })

        describe('with a turn queued behind the running one', () => {
            it('lets the queued turn run after the running turn is aborted', () => {
                const llm = aControllableLlm()
                const harness = aUserChatHarness({conversationIds: ['conv-1'], llm})
                run(harness.handle$({type: 'create-conversation'}))
                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'first'}))
                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'second'}))

                run(harness.handle$({type: 'abort', conversationId: 'conv-1'}))
                llm.calls[0].subject.complete()

                expect(llm.calls).toHaveLength(2)
                expect(llm.calls[1].messages.at(-1)).toEqual({role: 'user', content: 'second'})
            })
        })
    })

    describe('first-turn lock cycle', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({conversationIds: ['conv-1'], replies: [{text: 'Hi!'}]})
            run(harness.handle$({type: 'create-conversation'}))
        })

        it('broadcasts a status event for the locked conversation', () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))

            expect(eventsOfKind(harness, 'status')).toEqual([
                {kind: 'status', targeting: 'broadcast', payload: {conversationId: 'conv-1'}}
            ])
        })

        it('broadcasts the user message to sibling tabs (broadcastExcept)', () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))

            expect(eventsOfKind(harness, 'user-message')).toEqual([
                {kind: 'user-message', targeting: 'broadcastExcept',
                    payload: {conversationId: 'conv-1', text: 'hello'}}
            ])
        })

        it('streams the assistant reply and a final complete on the chat-response channel', () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello'}))

            expect(eventsOfKind(harness, 'chat-response')).toEqual([
                {kind: 'chat-response', targeting: 'broadcast',
                    payload: {conversationId: 'conv-1', text: 'Hi!'}},
                {kind: 'chat-response', targeting: 'broadcast',
                    payload: {conversationId: 'conv-1', complete: true}}
            ])
        })
    })

    describe('title generation', () => {

        describe('after a known-conversation turn', () => {
            let harness
            beforeEach(() => {
                harness = aUserChatHarness({
                    conversationIds: ['conv-1'],
                    replies: [
                        {text: 'Use the change-detection recipe.'},
                        {text: 'NDVI change Kenya'}
                    ],
                    titleGenerator: 'real'
                })
                run(harness.handle$({type: 'create-conversation'}))
                run(harness.handle$({
                    type: 'message', conversationId: 'conv-1',
                    text: 'How do I detect NDVI change in Kenya?'
                }))
            })

            it('broadcasts a conversation-updated event with the generated title', () => {
                expect(eventsOfKind(harness, 'conversation-updated')).toEqual([
                    {kind: 'conversation-updated', targeting: 'broadcast',
                        payload: {conversationId: 'conv-1', title: 'NDVI change Kenya'}}
                ])
            })

            it('persists the generated title on the conversation metadata', async () => {
                const stored = await firstValue(harness.conversationsStore.get$('conv-1'))
                expect(stored.title).toBe('NDVI change Kenya')
            })
        })

        describe('after an unknown-conversation message', () => {
            it('emits no conversation-updated event for the unknown id', () => {
                const harness = aUserChatHarness({
                    conversationIds: ['conv-1'],
                    replies: [{text: 'NDVI change Kenya'}],
                    titleGenerator: 'real'
                })

                run(harness.handle$({type: 'message', conversationId: 'nope', text: 'ignored'}))

                expect(eventsOfKind(harness, 'conversation-updated')).toEqual([])
            })
        })

        describe('while a previous title is still generating', () => {
            it('does not hold the second turn behind it', () => {
                const llm = aControllableLlm()
                const harness = aUserChatHarness({
                    conversationIds: ['conv-1'], llm,
                    titleGenerator: aStallingTitleGenerator()
                })
                run(harness.handle$({type: 'create-conversation'}))
                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'first'}))
                run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'second'}))

                llm.calls[0].subject.next({textDelta: 'reply one'})
                llm.calls[0].subject.complete()

                expect(llm.calls).toHaveLength(2)
            })
        })
    })

    describe('cross-subscription GUI context', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({conversationIds: ['conv-1']})
            run(harness.handle$({type: 'create-conversation'}))
        })

        it('attaches only the sending subscription context to the LLM turn', () => {
            run(harness.handle$({type: 'context', ...SUB_A, guiContext: {section: 'process'}}))
            run(harness.handle$({type: 'context', ...SUB_B, guiContext: {section: 'browse'}}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB_A}))

            const turnContext = runtimeContext(harness.llm.receivedMessages[0])
            expect(turnContext).toContain('"section":"process"')
            expect(turnContext).not.toContain('browse')
        })

        it('attaches no runtime context when another subscription sends without one', () => {
            run(harness.handle$({type: 'context', ...SUB_A, guiContext: {section: 'process'}}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB_B}))

            expect(harness.llm.receivedMessages[0]).toEqual([{role: 'user', content: 'hello'}])
        })

        it('drops the cached context after clear-context', () => {
            run(harness.handle$({type: 'context', ...SUB_A, guiContext: {section: 'process'}}))
            run(harness.handle$({type: 'clear-context', ...SUB_A}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB_A}))

            expect(harness.llm.receivedMessages[0]).toEqual([{role: 'user', content: 'hello'}])
        })
    })
})

function eventsOfKind(harness, kind) {
    return harness.channelEvents.filter(event => event.kind === kind)
}

function chatResponseCompletes(harness, conversationId) {
    return eventsOfKind(harness, 'chat-response').filter(event =>
        event.payload.conversationId === conversationId && event.payload.complete
    )
}

function lateChatResponses(harness) {
    return eventsOfKind(harness, 'chat-response').filter(event =>
        event.payload.text === 'too late'
    )
}

function runtimeContext(messages) {
    return messages.find(message => message.content?.includes('<runtime-context>'))?.content
}
