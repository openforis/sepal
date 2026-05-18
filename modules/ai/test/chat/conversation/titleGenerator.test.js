const {Subject, from} = require('rxjs')
const {aFakeLlm, run} = require('../builders')
const {aTitleGenFixture, aConversation, titleUpdates} = require('./titleGeneratorHarness')

describe('TitleGenerator — first turn (title still empty)', () => {

    const conversation = aConversation([
        {role: 'user', content: 'How do I detect NDVI change in Kenya?'},
        {role: 'assistant', content: 'Use the change-detection recipe.'}
    ])

    function generateTitle(fixture) {
        return run(fixture.titleGen.afterTurn$({
            conversation,
            conversationId: 'conv-1',
            userText: 'How do I detect NDVI change in Kenya?'
        }))
    }

    it('generates a title via the LLM and emits a conversation-updated event', () => {
        const fixture = aTitleGenFixture()

        const {events} = generateTitle(fixture)

        expect(titleUpdates(events)).toEqual([{id: 'conv-1', title: 'NDVI change Kenya'}])
    })

    it('passes the user/assistant exchange to the LLM with a title system prompt', () => {
        const fixture = aTitleGenFixture()

        generateTitle(fixture)

        expect(fixture.llm.receivedMessages[0]).toEqual([
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
        const fixture = aTitleGenFixture({llm: boundedLlm})

        generateTitle(fixture)

        expect(requests[0]).toMatchObject({
            maxTokens: 32,
            temperature: 0,
            disableReasoning: true,
            debugLabel: 'title conv-1'
        })
    })

    it('publishes a bounded debug prompt event and a visible response event', () => {
        const fixture = aTitleGenFixture()

        generateTitle(fixture)

        expect(fixture.bus.published).toEqual(expect.arrayContaining([
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
        const promptEvent = fixture.bus.published.find(event => event.type === 'title.prompt')
        const responseEvent = fixture.bus.published.find(event => event.type === 'title.rawResponse')
        expect(promptEvent.message()).toMatch(/contentChars/)
        expect(promptEvent.message()).not.toContain('User asked:')
        expect(responseEvent.message()).toContain('NDVI change Kenya')
    })

    it('persists the final title to the store', () => {
        const fixture = aTitleGenFixture()

        generateTitle(fixture)

        let stored
        fixture.conversationsStore.get$('conv-1').subscribe(meta => { stored = meta })
        expect(stored.title).toBe('NDVI change Kenya')
    })

    it('streams partial titles as the LLM emits chunks', () => {
        const streamingLlm = aFakeLlm({replies: [{textChunks: ['NDVI ', 'change ', 'Kenya']}]})
        const fixture = aTitleGenFixture({llm: streamingLlm})

        const {events} = generateTitle(fixture)

        expect(titleUpdates(events)).toEqual([
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
        const fixture = aTitleGenFixture({llm: mixedLlm})

        const {events} = generateTitle(fixture)

        expect(titleUpdates(events)).toEqual([{id: 'conv-1', title: 'NDVI change Kenya'}])
    })
})

describe('TitleGenerator — re-entrancy', () => {

    const conversation = aConversation([
        {role: 'user', content: 'hello'},
        {role: 'assistant', content: 'hi'}
    ])

    it('does not start a second title generation while a previous one is still in flight', () => {
        let llmCalls = 0
        const held = new Subject()
        const heldLlm = {respondTo$: () => { llmCalls++; return held }}
        const fixture = aTitleGenFixture({llm: heldLlm})
        const turn = {conversation, conversationId: 'conv-1', userText: 'hello'}

        const first = run(fixture.titleGen.afterTurn$(turn))
        const second = run(fixture.titleGen.afterTurn$(turn))

        expect(llmCalls).toBe(1)
        expect(titleUpdates(first.events)).toEqual([])
        expect(titleUpdates(second.events)).toEqual([])
        held.complete()
    })
})
