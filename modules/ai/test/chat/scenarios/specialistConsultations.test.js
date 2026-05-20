const {aToolFactoryHarness, aConversationHarness, collect} = require('../harness')

describe('specialist consultations', () => {

    describe('the consult_map tool descriptor', () => {
        let harness
        beforeEach(() => {
            harness = aToolFactoryHarness({specialist: 'consult_map'})
        })

        it('is named consult_map with a single required question argument', () => {
            expect(harness.tool.name).toBe('consult_map')
            expect(harness.tool.parameters).toEqual({
                type: 'object',
                properties: {question: {type: 'string'}},
                required: ['question'],
                additionalProperties: false
            })
        })

        it('describes itself to the orchestrator as a map specialist', () => {
            expect(harness.tool.description).toMatch(/map/i)
        })

        it('opts into directAnswer so the orchestrator streams specialist prose verbatim', () => {
            expect(harness.tool.directAnswer).toBe(true)
        })
    })

    describe('constructing a consult_map factory with a missing allowed tool', () => {
        const innerToolsMissingGuiContext = {
            schemas: () => [
                {name: 'map_area_list', description: 'Map areas.', parameters: {type: 'object', properties: {}}},
                {name: 'layer_list', description: 'Layers per area.', parameters: {type: 'object', properties: {}}}
            ]
        }

        it('refuses to construct, naming the missing tool', () => {
            expect(() => aToolFactoryHarness({
                specialist: 'consult_map',
                innerTools: innerToolsMissingGuiContext
            })).toThrow(/get_gui_context/)
        })
    })

    describe('answering a map question with no inner tool calls', () => {
        let harness
        beforeEach(() => {
            harness = aToolFactoryHarness({
                specialist: 'consult_map',
                replies: [{text: 'No recipe is selected.'}]
            })
        })

        it('returns the inner LLM answer as the tool result data', () => {
            const result = harness.invoke({question: 'why is my map empty?'})

            expect(result).toEqual({answer: 'No recipe is selected.'})
        })

        it('seeds the inner LLM with the map specialist system prompt', () => {
            harness.invoke({question: 'why is my map empty?'})

            expect(harness.llm.receivedMessages[0][0]).toEqual({
                role: 'system',
                content: expect.stringContaining('map specialist')
            })
        })

        it('forwards the user question as the inner user message', () => {
            harness.invoke({question: 'why is my map empty?'})

            expect(harness.llm.receivedMessages[0][1]).toEqual({
                role: 'user',
                content: 'why is my map empty?'
            })
        })

        it('offers the inner LLM only the map specialist\'s scoped tool schemas', () => {
            harness.invoke({question: 'why is my map empty?'})

            expect(harness.llm.receivedTools[0].map(schema => schema.name)).toEqual([
                'get_gui_context', 'map_area_list', 'layer_list'
            ])
        })
    })

    describe('the inner LLM calling an allowed map tool', () => {
        const mapAreaCall = {id: 'ma1', name: 'map_area_list', input: {}}

        let harness
        beforeEach(() => {
            harness = aToolFactoryHarness({
                specialist: 'consult_map',
                replies: [
                    {toolCalls: [mapAreaCall]},
                    {text: 'Single area, this-recipe.'}
                ]
            })
        })

        it('routes the call through the inner registry', () => {
            harness.invoke({question: 'which areas?'})

            expect(harness.innerTools.invocations).toEqual([mapAreaCall])
        })

        it('returns the follow-up answer once the tool round completes', () => {
            const result = harness.invoke({question: 'which areas?'})

            expect(result).toEqual({answer: 'Single area, this-recipe.'})
        })
    })

    describe('the inner LLM calling a tool outside the map specialist\'s scope', () => {
        const recipeListCall = {id: 't1', name: 'recipe_list', input: {}}

        let harness
        beforeEach(() => {
            harness = aToolFactoryHarness({
                specialist: 'consult_map',
                replies: [
                    {toolCalls: [recipeListCall]},
                    {text: 'Tool blocked.'}
                ]
            })
        })

        it('does not invoke the out-of-scope tool through the inner registry', () => {
            harness.invoke({question: 'list recipes'})

            expect(harness.innerTools.invocations).toEqual([])
        })

        it('feeds the inner LLM a TOOL_NOT_ALLOWED envelope naming the refused tool', () => {
            harness.invoke({question: 'list recipes'})

            const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
            expect(toolMessage.toolResults[0].result).toEqual({
                ok: false,
                error: {code: 'TOOL_NOT_ALLOWED', message: expect.stringContaining('recipe_list')}
            })
        })
    })

    describe('the inner LLM never stopping to ask for tools', () => {
        const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}

        let harness
        beforeEach(() => {
            harness = aToolFactoryHarness({
                specialist: 'consult_map',
                replies: [{toolCalls: [toolCall]}]
            })
        })

        it('still resolves with a specialist answer rather than hanging or erroring', () => {
            const result = harness.invoke({question: 'why is my map empty?'})

            expect(result).toEqual({answer: expect.stringMatching(/specialist/i)})
        })
    })

    describe('a consult_map call routed through the orchestrator', () => {
        const consultCall = {id: 'sm1', name: 'consult_map', input: {question: 'why is my map empty?'}}

        let factory, conversation
        beforeEach(() => {
            factory = aToolFactoryHarness({
                specialist: 'consult_map',
                replies: [{text: 'No recipe selected.'}]
            })
            conversation = aConversationHarness({
                replies: [
                    {toolCalls: [consultCall]},
                    {text: 'orchestrator restate that should never run'}
                ],
                tools: [factory.tool]
            })
        })

        it('streams the specialist prose verbatim to the user without an orchestrator restate', async () => {
            const events = await collect(conversation.send$('why is my map empty?'))

            expect(events.filter(event => event.textDelta)).toEqual([{textDelta: 'No recipe selected.'}])
        })

        it('asks the orchestrator LLM only once — the directAnswer flag skips the restate round', async () => {
            await collect(conversation.send$('why is my map empty?'))

            expect(conversation.llm.receivedMessages).toHaveLength(1)
        })

        it('invokes consult_map through the orchestrator registry exactly once', async () => {
            await collect(conversation.send$('why is my map empty?'))

            expect(conversation.invocations).toEqual([consultCall])
        })
    })
})

