import {of, throwError} from 'rxjs'

import {
    aConversationHarness, aFakeGuiRequests,
    aToolFactoryHarness, collect, innerToolsWithSchemas
} from '../../harness.js'

function metadataFor(metadata) {
    return aFakeGuiRequests(() => of(metadata))
}

const mosaicMetadata = {id: 'r1', type: 'MOSAIC', name: 'Kenya mosaic', projectId: 'p1'}
const classificationMetadata = {id: 'r1', type: 'CLASSIFICATION', name: 'Kenya', projectId: 'p1'}
const unspeccedMetadata = {id: 'r-other', type: 'NOT_IN_REGISTRY', name: 'Other', projectId: 'p1'}

describe('describe_recipe', () => {

    describe('the tool descriptor', () => {
        let harness
        beforeEach(() => {
            harness = aToolFactoryHarness({specialist: 'describe_recipe'})
        })

        it('is named describe_recipe with recipeId required and question optional', () => {
            expect(harness.tool.name).toBe('describe_recipe')
            expect(harness.tool.parameters).toEqual({
                type: 'object',
                properties: {
                    recipeId: {type: 'string'},
                    question: {type: 'string'}
                },
                required: ['recipeId'],
                additionalProperties: false
            })
        })

        it('steers the orchestrator off chaining describe before update', () => {
            expect(harness.tool.description).toMatch(/don't chain.*describe.*update/i)
        })

        it('opts into directAnswer so the orchestrator streams specialist prose verbatim', () => {
            expect(harness.tool.directAnswer).toBe(true)
        })
    })

    describe('preflight failure', () => {

        function notFoundGui() {
            return aFakeGuiRequests(() => throwError(() => Object.assign(new Error('Recipe not found: r1'), {code: 'RECIPE_NOT_FOUND'})))
        }

        it('returns ok:false with a user-facing error.answer when the recipe is not found', () => {
            const harness = aToolFactoryHarness({specialist: 'describe_recipe', guiRequests: notFoundGui()})

            const result = harness.invoke({recipeId: 'r1', question: 'which classifier?'})

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('RECIPE_NOT_FOUND')
            expect(result.error.answer).toMatch(/couldn't find that recipe/i)
        })

        it('uses a transient try-again answer for a non-not-found preflight error', () => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('bridge down')))
            const harness = aToolFactoryHarness({specialist: 'describe_recipe', guiRequests})

            const result = harness.invoke({recipeId: 'r1', question: 'which classifier?'})

            expect(result.error.code).toBe('TOOL_FAILED')
            expect(result.error.answer).toMatch(/try again/i)
            expect(result.error.answer).not.toMatch(/closed, deleted/i)
        })
    })

    describe('seeding the specialist', () => {
        let harness
        beforeEach(() => {
            harness = aToolFactoryHarness({
                specialist: 'describe_recipe',
                replies: [{text: 'A 25-tree random-forest classifier.'}]
            })
        })

        it('returns the specialist answer as the tool result data', () => {
            const result = harness.invoke({recipeId: 'r1', question: 'which classifier?'})

            expect(result).toEqual({answer: 'A 25-tree random-forest classifier.'})
        })

        it('seeds the inner LLM with the recipe specialist system prompt', () => {
            harness.invoke({recipeId: 'r1', question: 'which classifier?'})

            expect(harness.llm.receivedMessages[0][0]).toEqual({
                role: 'system',
                content: expect.stringMatching(/recipe specialist/i)
            })
        })

        it('forwards recipeId and the optional question to the inner user message', () => {
            harness.invoke({recipeId: 'r1', question: 'which classifier?'})

            const userMessage = harness.llm.receivedMessages[0][1]
            expect(userMessage.role).toBe('user')
            expect(userMessage.content).toContain('r1')
            expect(userMessage.content).toMatch(/which classifier\?/)
        })

        it('tags the specialist LLM call with role and specialist name so usage accounting can attribute it', () => {
            harness.invoke({recipeId: 'r1', question: 'which classifier?'})

            expect(harness.llm.receivedRequests[0].usageContext).toMatchObject({
                role: 'specialist',
                specialist: 'recipe.describe',
                conversationId: 'conv-1'
            })
        })

        it('issues a recipe-metadata GUI request to resolve the recipe type (not a recipe_load preflight)', () => {
            harness.invoke({recipeId: 'r1'})

            expect(harness.guiRequests.requests.map(request => request.action)).toEqual(['recipe-metadata'])
            expect(harness.innerTools.invocations).toEqual([])
        })

        it('treats each invocation as a fresh session — the second call sees only its own user message', () => {
            harness.invoke({recipeId: 'r1', question: 'first question'})
            harness.invoke({recipeId: 'r1', question: 'second question'})

            const secondCall = harness.llm.receivedMessages[1]
            expect(secondCall).toHaveLength(2)
            expect(secondCall[0].role).toBe('system')
            expect(secondCall[1].content).toContain('second question')
            expect(secondCall[1].content).not.toContain('first question')
        })
    })

    describe('allowed-tool scoping', () => {

        it('offers only recipe_load to the specialist even when other inner tools are registered', () => {
            const innerTools = innerToolsWithSchemas([
                {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}},
                {name: 'recipe_list', description: 'List.', parameters: {type: 'object', properties: {}}}
            ])
            const harness = aToolFactoryHarness({specialist: 'describe_recipe', innerTools})

            harness.invoke({recipeId: 'r1'})

            expect(harness.llm.receivedTools[0].map(schema => schema.name)).toEqual(['recipe_load'])
        })

        it('routes a recipe_load call through the inner registry when the specialist asks for it', () => {
            const recipeLoadCall = {id: 'rl1', name: 'recipe_load', input: {recipeId: 'r1'}}
            const harness = aToolFactoryHarness({
                specialist: 'describe_recipe',
                replies: [
                    {toolCalls: [recipeLoadCall]},
                    {text: 'CLASSIFICATION recipe.'}
                ]
            })

            harness.invoke({recipeId: 'r1'})

            expect(harness.innerTools.invocations).toEqual([recipeLoadCall])
        })

        it('refuses recipe_load for a recipeId other than the one describe_recipe was asked about', () => {
            const wrongCall = {id: 'rl1', name: 'recipe_load', input: {recipeId: 'r999'}}
            const harness = aToolFactoryHarness({
                specialist: 'describe_recipe',
                replies: [
                    {toolCalls: [wrongCall]},
                    {text: 'cannot load.'}
                ]
            })

            harness.invoke({recipeId: 'r1'})

            expect(harness.innerTools.invocations).toEqual([])
            const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
            expect(toolMessage.toolResults[0].result).toEqual({
                ok: false,
                error: {code: 'RECIPE_SCOPE_VIOLATION', message: expect.stringContaining('r999')}
            })
        })

        it('refuses non-allowed tool calls with TOOL_NOT_ALLOWED so the specialist cannot escape its scope', () => {
            const escapeCall = {id: 't1', name: 'recipe_list', input: {}}
            const innerTools = innerToolsWithSchemas([
                {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}},
                {name: 'recipe_list', description: 'List.', parameters: {type: 'object', properties: {}}}
            ])
            const harness = aToolFactoryHarness({
                specialist: 'describe_recipe',
                innerTools,
                replies: [
                    {toolCalls: [escapeCall]},
                    {text: 'blocked.'}
                ]
            })

            harness.invoke({recipeId: 'r1'})

            expect(harness.innerTools.invocations).toEqual([])
            const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
            expect(toolMessage.toolResults[0].result.error.code).toBe('TOOL_NOT_ALLOWED')
        })
    })

    describe('per-type prompt assembly', () => {

        it('on a MOSAIC recipe, the system prompt carries MOSAIC describeFacts and suppresses selection facts + edit guidance', () => {
            const harness = aToolFactoryHarness({
                specialist: 'describe_recipe',
                guiRequests: metadataFor(mosaicMetadata)
            })

            harness.invoke({recipeId: 'r-mosaic'})

            const systemPrompt = harness.llm.receivedMessages[0][0].content
            expect(systemPrompt).toMatch(/recipe specialist/i)
            expect(systemPrompt).toMatch(/Recipe type: Optical Mosaic/)
            expect(systemPrompt).not.toMatch(/Recipe: MOSAIC/)
            expect(systemPrompt).toContain('Value labels:')
            expect(systemPrompt).toContain('landsatCFMask(Landsat CFMask)')
            expect(systemPrompt).toMatch(/Outputs:/i)
            expect(systemPrompt).not.toMatch(/Choose when:/i)
            expect(systemPrompt).not.toMatch(/Use cases:/i)
            expect(systemPrompt).not.toMatch(/Edit guidance:/i)
        })

        it('on a MOSAIC recipe, the describe prompt distinguishes derived index outputs (NDVI) from raw source bands', () => {
            const harness = aToolFactoryHarness({
                specialist: 'describe_recipe',
                guiRequests: metadataFor(mosaicMetadata)
            })

            harness.invoke({recipeId: 'r-mosaic'})

            const systemPrompt = harness.llm.receivedMessages[0][0].content
            expect(systemPrompt).toMatch(/NDVI/)
            expect(systemPrompt).toMatch(/derived index/i)
            expect(systemPrompt).toMatch(/not a raw source band/i)
        })

        it('on an unknown recipe type, the system prompt is the base frame (no per-type facts)', () => {
            const harness = aToolFactoryHarness({
                specialist: 'describe_recipe',
                guiRequests: metadataFor(unspeccedMetadata)
            })

            harness.invoke({recipeId: 'r-other'})

            const systemPrompt = harness.llm.receivedMessages[0][0].content
            expect(systemPrompt).toMatch(/recipe specialist/i)
            expect(systemPrompt).not.toMatch(/Outputs:/i)
            expect(systemPrompt).not.toMatch(/Choose when:/i)
            expect(systemPrompt).not.toMatch(/Edit guidance:/i)
        })
    })

    describe('direct-answer streaming through the orchestrator', () => {
        const toolContext = {channel: {}, conversationId: 'conv-1', clientId: 'c1', subscriptionId: 's1'}

        it('streams describe_recipe specialist prose verbatim to the user without an orchestrator restate', async () => {
            const describeCall = {id: 'd1', name: 'describe_recipe', input: {recipeId: 'r1'}}
            const factory = aToolFactoryHarness({
                specialist: 'describe_recipe',
                guiRequests: metadataFor(classificationMetadata),
                replies: [{text: 'CLASSIFICATION recipe using a random forest.'}]
            })
            const conversation = aConversationHarness({
                replies: [
                    {toolCalls: [describeCall]},
                    {text: 'orchestrator restate that should never run'}
                ],
                tools: [factory.tool]
            })

            const events = await collect(conversation.send$('describe recipe r1', {toolContext}))

            expect(events.filter(event => event.textDelta)).toEqual([
                {textDelta: 'CLASSIFICATION recipe using a random forest.'}
            ])
            expect(conversation.llm.receivedMessages).toHaveLength(1)
        })
    })
})
