const {from, throwError} = require('rxjs')
const {createInMemoryConversationsStore} = require('./inMemoryConversationsStore')
const {aFakeLlm, run} = require('../builders')
const {UNTITLED_META, aTitleGenFixture, aConversation} = require('./titleGeneratorHarness')

describe('TitleGenerator — fallback and error paths', () => {

    describe('when the conversation already has a title', () => {

        it('does not call the LLM and does not update the channel', () => {
            const titled = {...UNTITLED_META, title: 'Existing title'}
            const conversationsStore = createInMemoryConversationsStore([titled])
            const fixture = aTitleGenFixture({conversationsStore})
            const conversation = aConversation([
                {role: 'user', content: 'follow-up'},
                {role: 'assistant', content: 'follow-up reply'}
            ])

            run(fixture.titleGen.afterTurn$({
                channel: fixture.channel, conversation,
                conversationId: 'conv-1', userText: 'follow-up'
            }))

            expect(fixture.channel.metaUpdates).toEqual([])
            expect(fixture.llm.receivedMessages).toEqual([])
        })
    })

    describe('on an aborted turn (no assistant reply yet)', () => {

        it('does not call the LLM and leaves the title empty', () => {
            const fixture = aTitleGenFixture()
            const conversation = aConversation([
                {role: 'user', content: 'How do I detect NDVI change?'}
            ])

            run(fixture.titleGen.afterTurn$({
                channel: fixture.channel, conversation,
                conversationId: 'conv-1',
                userText: 'How do I detect NDVI change?'
            }))

            expect(fixture.channel.metaUpdates).toEqual([])
            expect(fixture.llm.receivedMessages).toEqual([])
        })
    })

    describe('when the LLM call fails', () => {

        it('leaves the title empty (will retry on the next turn)', () => {
            const failingLlm = {
                respondTo$: () => throwError(() => new Error('upstream gone')),
                receivedMessages: []
            }
            const fixture = aTitleGenFixture({llm: failingLlm})
            const conversation = aConversation([
                {role: 'user', content: 'hello'},
                {role: 'assistant', content: 'hi'}
            ])

            run(fixture.titleGen.afterTurn$({
                channel: fixture.channel, conversation,
                conversationId: 'conv-1', userText: 'hello'
            }))

            expect(fixture.channel.metaUpdates).toEqual([])
        })
    })

    describe('when the LLM returns nothing usable after cleanup', () => {

        it('uses a deterministic fallback title for a greeting', () => {
            const noisyLlm = aFakeLlm({replies: [{text: 'Title: '}]})
            const fixture = aTitleGenFixture({llm: noisyLlm})
            const conversation = aConversation([
                {role: 'user', content: 'hello'},
                {role: 'assistant', content: 'hi'}
            ])

            run(fixture.titleGen.afterTurn$({
                channel: fixture.channel, conversation,
                conversationId: 'conv-1', userText: 'hello'
            }))

            expect(fixture.channel.metaUpdates).toEqual([{id: 'conv-1', title: 'Greeting'}])
            let stored
            fixture.conversationsStore.get$('conv-1').subscribe(meta => { stored = meta })
            expect(stored.title).toBe('Greeting')
            expect(fixture.bus.published.find(event => event.type === 'title.generated').message)
                .toContain('(fallback)')
        })

        it('treats an empty LLM stream as fallback rather than a failed generation', () => {
            const emptyLlm = {respondTo$: () => from([])}
            const fixture = aTitleGenFixture({llm: emptyLlm})
            const conversation = aConversation([
                {role: 'user', content: 'hello'},
                {role: 'assistant', content: 'hi'}
            ])

            run(fixture.titleGen.afterTurn$({
                channel: fixture.channel, conversation,
                conversationId: 'conv-1', userText: 'hello'
            }))

            expect(fixture.channel.metaUpdates).toEqual([{id: 'conv-1', title: 'Greeting'}])
            const types = fixture.bus.published.map(event => event.type)
            expect(types).toContain('title.generated')
            expect(types).not.toContain('title.failed')
        })

        it('falls back to a cleaned summary of the user request', () => {
            const emptyLlm = {respondTo$: () => from([])}
            const fixture = aTitleGenFixture({llm: emptyLlm})
            const conversation = aConversation([
                {role: 'user', content: 'How do I detect NDVI change in Kenya?'},
                {role: 'assistant', content: 'Use the change-detection recipe.'}
            ])

            run(fixture.titleGen.afterTurn$({
                channel: fixture.channel, conversation,
                conversationId: 'conv-1',
                userText: 'How do I detect NDVI change in Kenya?'
            }))

            expect(fixture.channel.metaUpdates).toEqual([{id: 'conv-1', title: 'detect NDVI change in Kenya'}])
        })

        it('uses a deterministic fallback title for a thank-you message', () => {
            const emptyLlm = {respondTo$: () => from([])}
            const fixture = aTitleGenFixture({llm: emptyLlm})
            const conversation = aConversation([
                {role: 'user', content: 'thanks'},
                {role: 'assistant', content: 'You are welcome.'}
            ])

            run(fixture.titleGen.afterTurn$({
                channel: fixture.channel, conversation,
                conversationId: 'conv-1', userText: 'thanks'
            }))

            expect(fixture.channel.metaUpdates).toEqual([{id: 'conv-1', title: 'Thanks'}])
        })

        it('falls back to a cleaned summary of the assistant reply when the user message has no summarisable content', () => {
            const emptyLlm = {respondTo$: () => from([])}
            const fixture = aTitleGenFixture({llm: emptyLlm})
            const conversation = aConversation([
                {role: 'user', content: '!!!'},
                {role: 'assistant', content: 'Use the change-detection recipe to compare NDVI.'}
            ])

            run(fixture.titleGen.afterTurn$({
                channel: fixture.channel, conversation,
                conversationId: 'conv-1', userText: '!!!'
            }))

            expect(fixture.channel.metaUpdates[0].title).toMatch(/change-detection/i)
        })

        it('leaves the title empty when neither the user message nor the assistant reply has summarisable content', () => {
            const emptyLlm = {respondTo$: () => from([])}
            const fixture = aTitleGenFixture({llm: emptyLlm})
            const conversation = aConversation([
                {role: 'user', content: '!!!'},
                {role: 'assistant', content: '...'}
            ])

            run(fixture.titleGen.afterTurn$({
                channel: fixture.channel, conversation,
                conversationId: 'conv-1', userText: '!!!'
            }))

            expect(fixture.channel.metaUpdates).toEqual([])
            expect(fixture.bus.published.map(event => event.type)).toContain('title.empty')
        })
    })
})
