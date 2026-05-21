const {aToolFactoryHarness, aConversationHarness, collect} = require('../../harness')

describe('update_recipe descriptor, seeding, and direct answer', () => {

    describe('the tool descriptor', () => {
        let harness
        beforeEach(() => {
            harness = aToolFactoryHarness({specialist: 'update_recipe'})
        })

        it('is named update_recipe with recipeId and instruction both required', () => {
            expect(harness.tool.name).toBe('update_recipe')
            expect(harness.tool.parameters).toEqual({
                type: 'object',
                properties: {
                    recipeId: {type: 'string'},
                    instruction: {type: 'string'}
                },
                required: ['recipeId', 'instruction'],
                additionalProperties: false
            })
        })

        it('steers the orchestrator off chaining describe_recipe before update_recipe', () => {
            expect(harness.tool.description).toMatch(/do not call describe_recipe first/i)
            expect(harness.tool.description).toMatch(/problem \+ action/i)
        })

        it('does not imply the target recipe must already be explicitly saved', () => {
            expect(harness.tool.description).toMatch(/current recipe/i)
            expect(harness.tool.description).not.toMatch(/saved recipe/i)
        })

        it('opts into directAnswer so the orchestrator streams specialist prose verbatim', () => {
            expect(harness.tool.directAnswer).toBe(true)
        })
    })

    describe('seeding the specialist', () => {
        let harness
        beforeEach(() => {
            harness = aToolFactoryHarness({specialist: 'update_recipe'})
        })

        it('preflights recipe-metadata before invoking the inner specialist LLM', () => {
            harness.invoke({recipeId: 'r1', instruction: 'change season end'})

            expect(harness.guiRequests.requests.map(request => request.action)).toEqual(['recipe-metadata'])
        })

        it('forwards recipeId and instruction to the inner user message', () => {
            harness.invoke({recipeId: 'r1', instruction: 'change season end to 2026-06-01'})

            const userMessage = harness.llm.receivedMessages[0][1]
            expect(userMessage.role).toBe('user')
            expect(userMessage.content).toContain('r1')
            expect(userMessage.content).toMatch(/change season end to 2026-06-01/)
        })
    })

    describe('direct-answer streaming through the orchestrator', () => {
        const toolContext = {channel: {}, conversationId: 'conv-1', clientId: 'c1', subscriptionId: 's1'}

        it('streams update_recipe specialist prose verbatim to the user without an orchestrator restate', async () => {
            const updateCall = {id: 'u1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'set target date'}}
            const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h1',
                operations: [{op: 'replace', path: '/dates/targetDate', value: '2026-06-01'}]
            }}
            const factory = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {toolCalls: [patchCall]},
                    {text: 'Target date set to 2026-06-01.'}
                ]
            })
            const conversation = aConversationHarness({
                replies: [
                    {toolCalls: [updateCall]},
                    {text: 'orchestrator restate that should never run'}
                ],
                tools: [factory.tool]
            })

            const events = await collect(conversation.send$('set target date', {toolContext}))

            expect(events.filter(event => event.textDelta)).toEqual([
                {textDelta: 'Target date set to 2026-06-01.'}
            ])
            expect(conversation.llm.receivedMessages).toHaveLength(1)
        })
    })
})
