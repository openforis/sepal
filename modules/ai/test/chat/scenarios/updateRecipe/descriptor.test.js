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
        it('preflights recipe-metadata before invoking any inner LLM', () => {
            const harness = aToolFactoryHarness({specialist: 'update_recipe'})

            harness.invoke({recipeId: 'r1', instruction: 'change season end'})

            expect(harness.guiRequests.requests[0].action).toBe('recipe-metadata')
        })

        it('passes the instruction to the picker LLM call as the user message', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [{text: '{"handles":["seasonEnd"]}'}, {text: 'OK'}]
            })

            harness.invoke({recipeId: 'r1', instruction: 'change season end to 2026-06-01'})

            const pickerMessages = harness.llm.receivedMessages[0]
            const userMessage = pickerMessages[pickerMessages.length - 1]
            expect(userMessage.role).toBe('user')
            expect(userMessage.content).toMatch(/change season end to 2026-06-01/)
        })

        it('forwards recipeId and instruction into the updater user message alongside the prepared packet', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [{text: '{"handles":["seasonEnd"]}'}, {text: 'Updated.'}]
            })

            harness.invoke({recipeId: 'r1', instruction: 'change season end to 2026-06-01'})

            const updaterMessages = harness.llm.receivedMessages[1]
            const userMessage = updaterMessages[updaterMessages.length - 1]
            expect(userMessage.role).toBe('user')
            expect(userMessage.content).toContain('r1')
            expect(userMessage.content).toMatch(/change season end to 2026-06-01/)
            expect(userMessage.content).toContain('Prepared packet')
        })
    })

    describe('direct-answer streaming through the orchestrator', () => {
        const toolContext = {channel: {}, conversationId: 'conv-1', clientId: 'c1', subscriptionId: 's1'}

        it('streams update_recipe specialist prose verbatim to the user without an orchestrator restate', async () => {
            const updateCall = {id: 'u1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'set target date'}}
            const updaterToolCall = {id: 'tu1', name: 'update_recipe_values', input: {
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['targetDate', 'seasonStart', 'seasonEnd'],
                values: {targetDate: '2026-06-01', seasonStart: '2025-12-02', seasonEnd: '2026-06-02'}
            }}
            const factory = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {text: '{"handles":["targetDate"]}'},
                    {toolCalls: [updaterToolCall]},
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
