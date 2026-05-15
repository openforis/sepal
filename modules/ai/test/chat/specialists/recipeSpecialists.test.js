const {of} = require('rxjs')
const {describeRecipeTool} = require('#mcp/chat/specialists/recipeSpecialists')
const {aFakeLlm, aFakeTools, aFakeTracer, read} = require('../builders')

describe('describeRecipeTool', () => {

    const recipeLoadSchema = {
        name: 'recipe_load',
        description: 'Load ONE recipe.',
        parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}
    }

    function aTool(overrides = {}) {
        const llm = overrides.llm ?? aFakeLlm({replies: [{text: 'A 25-tree random-forest classifier.'}]})
        const innerTools = overrides.innerTools ?? aFakeTools(
            {recipe_load: () => of({id: 'r1', type: 'CLASSIFICATION', model: {classifier: {numberOfTrees: 25}}, modelHash: 'h1'})},
            [recipeLoadSchema]
        )
        const tool = describeRecipeTool({
            llm,
            tracer: overrides.tracer ?? aFakeTracer(),
            innerTools
        })
        return {tool, llm, innerTools}
    }

    it('exposes a describe_recipe tool with recipeId required and question optional', () => {
        const {tool} = aTool()

        expect(tool.name).toBe('describe_recipe')
        expect(tool.description).toMatch(/recipe/i)
        expect(tool.parameters).toEqual({
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                question: {type: 'string'}
            },
            required: ['recipeId'],
            additionalProperties: false
        })
    })

    it('throws at construction when the inner registry is missing the private recipe_load tool', () => {
        const innerTools = aFakeTools({}, [])

        expect(() => describeRecipeTool({
            llm: aFakeLlm(), tracer: aFakeTracer(), innerTools
        })).toThrow(/recipe_load/)
    })

    it('seeds the inner LLM with the recipe specialist prompt loaded from llmText/specialists/recipe.md', () => {
        const {tool, llm} = aTool()

        read(tool.invoke$({recipeId: 'r1'}, {channel: {}, conversationId: 'c1'}))

        expect(llm.receivedMessages[0][0]).toEqual({
            role: 'system',
            content: expect.stringContaining('recipe specialist')
        })
    })

    it('passes recipeId to the inner LLM as part of the user message so the specialist knows which recipe to describe', () => {
        const {tool, llm} = aTool()

        read(tool.invoke$({recipeId: 'r1'}, {channel: {}, conversationId: 'c1'}))

        const userMessage = llm.receivedMessages[0][1]
        expect(userMessage.role).toBe('user')
        expect(userMessage.content).toContain('r1')
    })

    it('forwards the user question to the inner LLM when one is provided', () => {
        const {tool, llm} = aTool()

        read(tool.invoke$({recipeId: 'r1', question: 'which classifier?'}, {channel: {}, conversationId: 'c1'}))

        expect(llm.receivedMessages[0][1].content).toMatch(/which classifier\?/)
    })

    it('only offers the specialist the recipe_load tool, not other inner tools', () => {
        const innerTools = aFakeTools(
            {
                recipe_load: () => of({id: 'r1'}),
                recipe_list: () => of([])
            },
            [recipeLoadSchema, {name: 'recipe_list', description: 'List.', parameters: {type: 'object'}}]
        )
        const {tool, llm} = aTool({innerTools})

        read(tool.invoke$({recipeId: 'r1'}, {channel: {}, conversationId: 'c1'}))

        expect(llm.receivedTools[0].map(s => s.name)).toEqual(['recipe_load'])
    })

    it('lets the inner LLM call recipe_load through the inner registry', () => {
        const recipeLoadCall = {id: 'rl1', name: 'recipe_load', input: {recipeId: 'r1'}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [recipeLoadCall]},
            {text: 'A 25-tree random forest classifier.'}
        ]})
        const innerTools = aFakeTools(
            {recipe_load: () => of({id: 'r1', type: 'CLASSIFICATION', model: {classifier: {numberOfTrees: 25}}})},
            [recipeLoadSchema]
        )
        const {tool} = aTool({llm, innerTools})

        read(tool.invoke$({recipeId: 'r1'}, {channel: {}, conversationId: 'c1'}))

        expect(innerTools.invocations).toEqual([recipeLoadCall])
    })

    it('returns a derived description from the specialist as the tool result, not the raw loaded recipe', () => {
        const llm = aFakeLlm({replies: [
            {toolCalls: [{id: 'rl1', name: 'recipe_load', input: {recipeId: 'r1'}}]},
            {text: 'CLASSIFICATION recipe using a 25-tree random forest.'}
        ]})
        const rawRecipe = {id: 'r1', type: 'CLASSIFICATION', model: {classifier: {numberOfTrees: 25}}}
        const innerTools = aFakeTools(
            {recipe_load: () => of(rawRecipe)},
            [recipeLoadSchema]
        )
        const {tool} = aTool({llm, innerTools})

        const result = read(tool.invoke$({recipeId: 'r1'}, {channel: {}, conversationId: 'c1'}))

        expect(result).toEqual({answer: 'CLASSIFICATION recipe using a 25-tree random forest.'})
        expect(result).not.toMatchObject({model: rawRecipe.model})
    })

    it('treats each invocation as a fresh session — no shared LLM messages between calls', () => {
        const {tool, llm} = aTool()
        const context = {channel: {}, conversationId: 'c1'}

        read(tool.invoke$({recipeId: 'r1', question: 'first question'}, context))
        read(tool.invoke$({recipeId: 'r1', question: 'second question'}, context))

        const secondCallMessages = llm.receivedMessages[1]
        expect(secondCallMessages).toHaveLength(2)
        expect(secondCallMessages[0].role).toBe('system')
        expect(secondCallMessages[1]).toEqual({role: 'user', content: expect.stringContaining('second question')})
        expect(secondCallMessages[1].content).not.toContain('first question')
    })

    it('refuses recipe_load calls for a recipeId other than the one describe_recipe was asked about', () => {
        const wrongCall = {id: 'rl1', name: 'recipe_load', input: {recipeId: 'r999'}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [wrongCall]},
            {text: 'cannot load.'}
        ]})
        const innerTools = aFakeTools(
            {recipe_load: () => of({id: 'r999'})},
            [recipeLoadSchema]
        )
        const {tool} = aTool({llm, innerTools})

        read(tool.invoke$({recipeId: 'r1'}, {channel: {}, conversationId: 'c1'}))

        expect(innerTools.invocations).toEqual([])
        const toolMessage = llm.receivedMessages[1].find(m => m.role === 'tool')
        expect(toolMessage.toolResults[0].result).toEqual({
            ok: false,
            error: {
                code: 'RECIPE_SCOPE_VIOLATION',
                message: expect.stringContaining('r999')
            }
        })
    })

    it('refuses non-allowed tool calls so the specialist cannot escape its scope', () => {
        const escapeCall = {id: 't1', name: 'recipe_list', input: {}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [escapeCall]},
            {text: 'blocked.'}
        ]})
        const innerTools = aFakeTools(
            {recipe_load: () => of({id: 'r1'}), recipe_list: () => of([])},
            [recipeLoadSchema, {name: 'recipe_list', description: 'List.', parameters: {type: 'object'}}]
        )
        const {tool} = aTool({llm, innerTools})

        read(tool.invoke$({recipeId: 'r1'}, {channel: {}, conversationId: 'c1'}))

        expect(innerTools.invocations).toEqual([])
        const toolMessage = llm.receivedMessages[1].find(m => m.role === 'tool')
        expect(toolMessage.toolResults[0].result.error.code).toBe('TOOL_NOT_ALLOWED')
    })
})
