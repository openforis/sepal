import {aConversationHarness, aToolFactoryHarness, collect} from '../../harness.js'

describe('update_recipe descriptor, seeding, and direct answer', () => {

    describe('the tool descriptor', () => {
        let harness
        beforeEach(() => {
            harness = aToolFactoryHarness({specialist: 'update_recipe'})
        })

        it('exposes recipeId, request, optional context, and legacy instruction alias', () => {
            expect(harness.tool.name).toBe('update_recipe')
            expect(harness.tool.parameters).toEqual({
                type: 'object',
                properties: {
                    recipeId: {type: 'string'},
                    request: {type: 'string'},
                    context: {type: 'string'},
                    instruction: {type: 'string'}
                },
                required: ['recipeId'],
                additionalProperties: false
            })
        })

        it('has a non-empty description', () => {
            expect(typeof harness.tool.description).toBe('string')
            expect(harness.tool.description.trim().length).toBeGreaterThan(0)
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

        it('passes the request to the picker LLM call as the user message', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [{text: '{"handles":["seasonEnd"]}'}, {text: 'OK'}]
            })

            harness.invoke({recipeId: 'r1', request: 'change season end to 2026-06-01'})

            const pickerMessages = harness.llm.receivedMessages[0]
            const userMessage = pickerMessages[pickerMessages.length - 1]
            expect(userMessage.role).toBe('user')
            expect(userMessage.content).toMatch(/request:.*change season end to 2026-06-01/)
        })

        it('forwards request + neutral context into the picker user message with distinct labels', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [{text: '{"handles":["seasonEnd"]}'}, {text: 'OK'}]
            })

            harness.invoke({recipeId: 'r1', request: 'try again', context: 'follow-up to slow rendering'})

            const pickerMessages = harness.llm.receivedMessages[0]
            const userMessage = pickerMessages[pickerMessages.length - 1]
            expect(userMessage.content).toMatch(/request:.*try again/)
            expect(userMessage.content).toMatch(/context:.*follow-up to slow rendering/)
        })

        it('accepts legacy instruction as a request fallback', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [{text: '{"handles":["seasonEnd"]}'}, {text: 'OK'}]
            })

            harness.invoke({recipeId: 'r1', instruction: 'change season end to 2026-06-01'})

            const pickerMessages = harness.llm.receivedMessages[0]
            const userMessage = pickerMessages[pickerMessages.length - 1]
            expect(userMessage.content).toMatch(/change season end to 2026-06-01/)
        })

        it('forwards recipeId and request into the updater user message alongside the prepared packet', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [{text: '{"handles":["seasonEnd"]}'}, {text: 'Updated.'}]
            })

            harness.invoke({recipeId: 'r1', request: 'change season end to 2026-06-01'})

            const updaterMessages = harness.llm.receivedMessages[1]
            const userMessage = updaterMessages[updaterMessages.length - 1]
            expect(userMessage.role).toBe('user')
            expect(userMessage.content).toContain('r1')
            expect(userMessage.content).toMatch(/request:.*change season end to 2026-06-01/)
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
