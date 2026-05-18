const {
    aConversation, aControllableLlm, aFakeHistory, aFakeLlm, run
} = require('../builders')

describe('Conversation queue + abort', () => {

    describe('queue serialization', () => {
        it('runs concurrent sends one at a time on the shared messages array', () => {
            const llm = aControllableLlm()
            const conversation = aConversation({llm})

            run(conversation.sendUserMessage$('first'))
            run(conversation.sendUserMessage$('second'))

            expect(llm.calls).toHaveLength(1)
            expect(llm.calls[0].messages.at(-1)).toEqual({role: 'user', content: 'first'})

            llm.calls[0].subject.next({textDelta: 'one'})
            llm.calls[0].subject.complete()

            expect(llm.calls).toHaveLength(2)
            expect(llm.calls[1].messages.at(-1)).toEqual({role: 'user', content: 'second'})
        })
    })

    describe('abort', () => {
        it('tears down the in-flight turn so no further events emit', () => {
            const llm = aControllableLlm()
            const conversation = aConversation({llm})
            const {events} = run(conversation.sendUserMessage$('hello'))

            llm.calls[0].subject.next({textDelta: 'hi'})
            conversation.abort()
            llm.calls[0].subject.next({textDelta: ' there'})

            expect(events).toEqual([{textDelta: 'hi'}])
        })

        it('is a no-op when nothing is in-flight', () => {
            const conversation = aConversation({llm: aFakeLlm({replies: [{text: 'ok'}]})})

            expect(() => conversation.abort()).not.toThrow()
        })

        it('cancels the running turn only; queued turns proceed with a fresh abort binding', () => {
            const llm = aControllableLlm()
            const conversation = aConversation({llm})
            run(conversation.sendUserMessage$('first'))
            run(conversation.sendUserMessage$('second'))

            conversation.abort()
            llm.calls[0].subject.complete()

            expect(llm.calls).toHaveLength(2)
            expect(llm.calls[1].messages.at(-1)).toEqual({role: 'user', content: 'second'})

            llm.calls[1].subject.next({textDelta: 'two'})
            llm.calls[1].subject.complete()
        })
    })

    describe('isStreaming', () => {
        it('is false when idle, true mid-turn, false after completion', () => {
            const llm = aControllableLlm()
            const conversation = aConversation({llm})

            expect(conversation.isStreaming).toBe(false)

            run(conversation.sendUserMessage$('hello'))
            expect(conversation.isStreaming).toBe(true)

            llm.calls[0].subject.next({textDelta: 'hi'})
            llm.calls[0].subject.complete()
            expect(conversation.isStreaming).toBe(false)
        })

        it('is false after an abort', () => {
            const llm = aControllableLlm()
            const conversation = aConversation({llm})

            run(conversation.sendUserMessage$('hello'))
            expect(conversation.isStreaming).toBe(true)

            conversation.abort()
            expect(conversation.isStreaming).toBe(false)
        })
    })

    describe('persistence on abort', () => {
        it('keeps the user message in history even when the turn is aborted before any assistant text', () => {
            const llm = aControllableLlm()
            const history = aFakeHistory()
            const conversation = aConversation({llm, history})

            run(conversation.sendUserMessage$('hello'))
            conversation.abort()

            expect(history.appended).toEqual([{role: 'user', content: 'hello'}])
        })
    })
})
