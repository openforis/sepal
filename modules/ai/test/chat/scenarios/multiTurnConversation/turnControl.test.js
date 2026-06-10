import {Subject} from 'rxjs'

import {aControllableLlm, aUserChatHarness, run} from '../../harness.js'

describe('turn sequencing and abort', () => {

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

                const completes = harness.channelEvents.filter(event =>
                    event.kind === 'chat-response' &&
                    event.payload.conversationId === 'conv-1' && event.payload.complete
                )
                expect(completes).toEqual([
                    {kind: 'chat-response', targeting: 'broadcast',
                        payload: {conversationId: 'conv-1', complete: true}}
                ])
            })

            it('drops late LLM textDelta events after the abort', () => {
                run(harness.handle$({type: 'abort', conversationId: 'conv-1'}))
                replies$.next({textDelta: 'too late'})

                const lateChatResponses = harness.channelEvents.filter(event =>
                    event.kind === 'chat-response' && event.payload.text === 'too late'
                )
                expect(lateChatResponses).toEqual([])
            })
        })

        describe('with no in-flight stream', () => {
            it('emits no channel events', () => {
                const harness = aUserChatHarness({conversationIds: ['conv-1']})
                run(harness.handle$({type: 'create-conversation'}))
                const marker = harness.eventsMarker()

                run(harness.handle$({type: 'abort', conversationId: 'conv-1'}))

                expect(harness.eventsSince(marker)).toEqual([])
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
})
