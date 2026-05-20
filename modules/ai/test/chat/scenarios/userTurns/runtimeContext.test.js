const {of} = require('rxjs')
const {aConversationHarness, collect, firstValue} = require('../../harness')
const {recipeListSchema} = require('./fixtures')

describe('runtime GUI context', () => {

    describe('attached to a single turn', () => {
        const guiContext = {section: 'process', selectedRecipe: {recipeId: 'r1', recipeName: 'Mosaic'}}

        let harness
        beforeEach(() => {
            harness = aConversationHarness({replies: [{text: 'ok'}]})
        })

        it('passes the GUI context as an LLM-visible runtime-context message', async () => {
            await collect(harness.send$('Hello', {guiContext}))

            expect(harness.llm.receivedMessages[0]).toContainEqual({
                role: 'system',
                content: expect.stringContaining('"recipeName":"Mosaic"')
            })
        })

        it('does not persist the runtime-context message into chat history', async () => {
            await collect(harness.send$('Hello', {guiContext}))

            const stored = await firstValue(harness.history.load$())
            expect(stored.find(message => /<runtime-context>/.test(message.content || ''))).toBeUndefined()
        })
    })

    describe('across tool rounds within a turn', () => {
        const toolCall = {id: 't1', name: 'recipe_list', input: {}}
        const guiContext = {selectedRecipe: {recipeId: 'r1', recipeType: 'MOSAIC'}}

        function runtimeContextOf(messages) {
            return messages.find(message =>
                message.role === 'system' && /<runtime-context>/.test(message.content || '')
            )
        }

        it('the post-tool round still sees the runtime-context system message', async () => {
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [toolCall]},
                    {text: 'done.'}
                ],
                tools: [{...recipeListSchema, invoke$: () => of([])}]
            })

            await collect(harness.send$('list', {guiContext}))

            expect(runtimeContextOf(harness.llm.receivedMessages[1])?.content).toContain('"recipeId":"r1"')
        })

        it('the empty-after-tool retry round still sees the runtime-context system message', async () => {
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [toolCall]},
                    {text: ''},
                    {text: 'No tool here can do that.'}
                ],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => of({ok: false, error: {code: 'NO_MATCH', message: 'nf'}})
                }]
            })

            await collect(harness.send$('open', {guiContext}))

            expect(runtimeContextOf(harness.llm.receivedMessages[2])?.content).toContain('"recipeId":"r1"')
        })
    })
})
