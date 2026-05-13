const {from, throwError} = require('rxjs')
const {createTitleGenerator, cleanTitle} = require('#mcp/chat/sendMessage/titleGenerator')
const {createInMemoryConversationsStore} = require('../io/inMemoryConversationsStore')
const {aFakeChannel, aFakeLlm, aFakeTracer, read, run} = require('./builders')

describe('TitleGenerator', () => {

    const UNTITLED = {id: 'conv-1', title: '', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z'}

    let channel, conversationsStore, llm, tracer, bus

    beforeEach(() => {
        channel = aFakeChannel()
        conversationsStore = createInMemoryConversationsStore([UNTITLED])
        llm = aFakeLlm({replies: [{text: 'NDVI change Kenya'}]})
        tracer = aFakeTracer()
        bus = aRecordingBus()
    })

    function aConversation(messages) {
        return {messagesSnapshot: () => messages}
    }

    function aRecordingBus() {
        const published = []
        return {publish: event => published.push(event), published}
    }

    function aTitleGen(overrides = {}) {
        return createTitleGenerator({
            llm: overrides.llm ?? llm,
            conversationsStore: overrides.conversationsStore ?? conversationsStore,
            tracer,
            bus
        })
    }

    describe('on the first turn (title still empty)', () => {

        const conversation = aConversation([
            {role: 'user', content: 'How do I detect NDVI change in Kenya?'},
            {role: 'assistant', content: 'Use the change-detection recipe.'}
        ])

        it('generates a title via the LLM', () => {
            const titleGenerator = aTitleGen()

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1',
                userText: 'How do I detect NDVI change in Kenya?'
            }))

            expect(channel.metaUpdates).toEqual([{id: 'conv-1', title: 'NDVI change Kenya'}])
        })

        it('passes the user/assistant exchange to the LLM with a title system prompt', () => {
            const titleGenerator = aTitleGen()

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1',
                userText: 'How do I detect NDVI change in Kenya?'
            }))

            expect(llm.receivedMessages[0]).toEqual([
                expect.objectContaining({role: 'system'}),
                {
                    role: 'user',
                    content: expect.stringContaining('User asked: How do I detect NDVI change in Kenya?')
                }
            ])
        })

        it('asks the LLM for a bounded deterministic title generation', () => {
            const requests = []
            const boundedLlm = {
                respondTo$(request) {
                    requests.push(request)
                    return from([{textDelta: 'NDVI change Kenya'}])
                }
            }
            const titleGenerator = aTitleGen({llm: boundedLlm})

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1',
                userText: 'How do I detect NDVI change in Kenya?'
            }))

            expect(requests[0]).toMatchObject({
                maxTokens: 32,
                temperature: 0,
                disableReasoning: true,
                debugLabel: 'title conv-1'
            })
        })

        it('publishes debug prompt and visible response events', () => {
            const titleGenerator = aTitleGen()

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1',
                userText: 'How do I detect NDVI change in Kenya?'
            }))

            expect(bus.published).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    type: 'title.prompt',
                    level: 'trace',
                    message: expect.any(Function)
                }),
                expect.objectContaining({
                    type: 'title.rawResponse',
                    level: 'debug',
                    message: expect.any(Function)
                })
            ]))
            const promptEvent = bus.published.find(event => event.type === 'title.prompt')
            const responseEvent = bus.published.find(event => event.type === 'title.rawResponse')
            expect(promptEvent.message()).toContain('User asked: How do I detect NDVI change in Kenya?')
            expect(responseEvent.message()).toContain('NDVI change Kenya')
        })

        it('persists the final title to the store', () => {
            const titleGenerator = aTitleGen()

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1',
                userText: 'How do I detect NDVI change in Kenya?'
            }))

            expect(read(conversationsStore.get$('conv-1')).title).toBe('NDVI change Kenya')
        })

        it('streams partial titles to the channel as the LLM emits chunks', () => {
            const streamingLlm = aFakeLlm({replies: [{textChunks: ['NDVI ', 'change ', 'Kenya']}]})
            const titleGenerator = aTitleGen({llm: streamingLlm})

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1',
                userText: 'How do I detect NDVI change in Kenya?'
            }))

            expect(channel.metaUpdates).toEqual([
                {id: 'conv-1', title: 'NDVI'},
                {id: 'conv-1', title: 'NDVI change'},
                {id: 'conv-1', title: 'NDVI change Kenya'}
            ])
        })

        it('ignores non-text events while accumulating the title', () => {
            const mixedLlm = {
                respondTo$: () => from([
                    {toolCall: {id: 'ignored', name: 'not_used'}},
                    {textDelta: 'NDVI change Kenya'}
                ]),
                receivedMessages: []
            }
            const titleGenerator = aTitleGen({llm: mixedLlm})

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1',
                userText: 'How do I detect NDVI change in Kenya?'
            }))

            expect(channel.metaUpdates).toEqual([{id: 'conv-1', title: 'NDVI change Kenya'}])
        })
    })

    describe('when the conversation already has a title', () => {

        it('does not call the LLM and does not update the channel', () => {
            const titled = {...UNTITLED, title: 'Existing title'}
            conversationsStore = createInMemoryConversationsStore([titled])
            const conversation = aConversation([
                {role: 'user', content: 'follow-up'},
                {role: 'assistant', content: 'follow-up reply'}
            ])
            const titleGenerator = aTitleGen()

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1', userText: 'follow-up'
            }))

            expect(channel.metaUpdates).toEqual([])
            expect(llm.receivedMessages).toEqual([])
        })
    })

    describe('on an aborted turn (no assistant reply yet)', () => {

        it('does not call the LLM and leaves the title empty', () => {
            const conversation = aConversation([
                {role: 'user', content: 'How do I detect NDVI change?'}
            ])
            const titleGenerator = aTitleGen()

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1',
                userText: 'How do I detect NDVI change?'
            }))

            expect(channel.metaUpdates).toEqual([])
            expect(llm.receivedMessages).toEqual([])
        })
    })

    describe('when the LLM call fails', () => {

        it('leaves the title empty (will retry on the next turn)', () => {
            const failingLlm = {
                respondTo$: () => throwError(() => new Error('upstream gone')),
                receivedMessages: []
            }
            const conversation = aConversation([
                {role: 'user', content: 'hello'},
                {role: 'assistant', content: 'hi'}
            ])
            const titleGenerator = aTitleGen({llm: failingLlm})

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1', userText: 'hello'
            }))

            expect(channel.metaUpdates).toEqual([])
        })
    })

    describe('when the LLM returns nothing usable after cleanup', () => {

        it('uses a deterministic fallback title', () => {
            const noisyLlm = aFakeLlm({replies: [{text: 'Title: '}]})
            const conversation = aConversation([
                {role: 'user', content: 'hello'},
                {role: 'assistant', content: 'hi'}
            ])
            const titleGenerator = aTitleGen({llm: noisyLlm})

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1', userText: 'hello'
            }))

            expect(channel.metaUpdates).toEqual([{id: 'conv-1', title: 'Greeting'}])
            expect(read(conversationsStore.get$('conv-1')).title).toBe('Greeting')
            expect(bus.published.find(event => event.type === 'title.generated').message)
                .toContain('(fallback)')
        })

        it('treats an empty LLM stream as fallback rather than a failed generation', () => {
            const emptyLlm = {
                respondTo$: () => from([])
            }
            const conversation = aConversation([
                {role: 'user', content: 'hello'},
                {role: 'assistant', content: 'hi'}
            ])
            const titleGenerator = aTitleGen({llm: emptyLlm})

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1', userText: 'hello'
            }))

            expect(channel.metaUpdates).toEqual([{id: 'conv-1', title: 'Greeting'}])
            expect(bus.published.map(event => event.type)).toContain('title.generated')
            expect(bus.published.map(event => event.type)).not.toContain('title.failed')
        })

        it('falls back to a cleaned summary of the user request', () => {
            const emptyLlm = {
                respondTo$: () => from([])
            }
            const conversation = aConversation([
                {role: 'user', content: 'How do I detect NDVI change in Kenya?'},
                {role: 'assistant', content: 'Use the change-detection recipe.'}
            ])
            const titleGenerator = aTitleGen({llm: emptyLlm})

            run(titleGenerator.afterTurn$({
                channel, conversation, conversationId: 'conv-1',
                userText: 'How do I detect NDVI change in Kenya?'
            }))

            expect(channel.metaUpdates).toEqual([{id: 'conv-1', title: 'detect NDVI change in Kenya'}])
        })
    })

    describe('cleanTitle', () => {

        it('strips wrapping quotes', () => {
            expect(cleanTitle('"NDVI change Kenya"')).toBe('NDVI change Kenya')
            expect(cleanTitle('\'NDVI change Kenya\'')).toBe('NDVI change Kenya')
        })

        it('strips trailing punctuation', () => {
            expect(cleanTitle('NDVI change Kenya.')).toBe('NDVI change Kenya')
            expect(cleanTitle('NDVI change Kenya?')).toBe('NDVI change Kenya')
        })

        it('strips preamble like "Title:" or "Topic:"', () => {
            expect(cleanTitle('Title: NDVI change Kenya')).toBe('NDVI change Kenya')
            expect(cleanTitle('Topic: NDVI change Kenya')).toBe('NDVI change Kenya')
        })

        it('strips list markers', () => {
            expect(cleanTitle('1. NDVI change Kenya')).toBe('NDVI change Kenya')
            expect(cleanTitle('- NDVI change Kenya')).toBe('NDVI change Kenya')
        })

        it('strips <think>...</think> tags', () => {
            expect(cleanTitle('<think>let me think</think>NDVI change Kenya')).toBe('NDVI change Kenya')
        })

        it('returns null on empty input', () => {
            expect(cleanTitle('')).toBeNull()
            expect(cleanTitle(null)).toBeNull()
        })

        it('keeps only the first line', () => {
            expect(cleanTitle('NDVI change Kenya\nmore stuff')).toBe('NDVI change Kenya')
        })

        it('truncates at 80 chars', () => {
            const longTitle = 'a'.repeat(100)
            expect(cleanTitle(longTitle).length).toBe(80)
        })
    })
})
