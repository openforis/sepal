const {of} = require('rxjs')
const {aToolFactoryHarness, innerToolsWithSchemas, innerToolsImpl} = require('../../harness')

describe('update_recipe allowed-tool scoping', () => {

    function innerToolsForUpdate() {
        return innerToolsWithSchemas([
            {name: 'update_recipe_values', description: 'Update.', parameters: {
                type: 'object',
                properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}},
                required: ['recipeId', 'baseModelHash', 'writableHandles', 'values']
            }},
            {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {}}},
            {name: 'recipe_list', description: 'List.', parameters: {type: 'object', properties: {}}}
        ])
    }

    it('offers the updater only update_recipe_values — no recipe_patch, no recipe_load, no prepare_update', () => {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools: innerToolsForUpdate(),
            replies: [
                {text: '{"handles":["targetDate"]}'},
                {text: 'OK'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'edit'})

        // receivedTools[0] is the picker call (tool-free). receivedTools[1] is the updater call.
        expect(harness.llm.receivedTools[0]).toEqual([])
        expect(harness.llm.receivedTools[1].map(schema => schema.name).sort()).toEqual(['update_recipe_values'])
    })

    it('refuses an update_recipe_values call for a different recipeId with RECIPE_SCOPE_VIOLATION', () => {
        const wrongUpdate = {id: 'tu1', name: 'update_recipe_values', input: {
            recipeId: 'r999', baseModelHash: 'h-base',
            writableHandles: ['targetDate'], values: {targetDate: '2023-07-02'}
        }}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools: innerToolsForUpdate(),
            replies: [
                {text: '{"handles":["targetDate"]}'},
                {toolCalls: [wrongUpdate]},
                {text: 'cannot edit.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(harness.innerTools.invocations).toEqual([])
        const toolMessage = harness.llm.receivedMessages[2].find(message => message.role === 'tool')
        expect(toolMessage.toolResults[0].result.error.code).toBe('RECIPE_SCOPE_VIOLATION')
        expect(toolMessage.toolResults[0].result.error.message).toContain('r999')
    })

    it('refuses raw recipe_load entirely from the updater — only update_recipe_values is in scope', () => {
        const recipeLoadCall = {id: 'tl1', name: 'recipe_load', input: {recipeId: 'r1'}}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools: innerToolsForUpdate(),
            replies: [
                {text: '{"handles":["targetDate"]}'},
                {toolCalls: [recipeLoadCall]},
                {text: 'blocked.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(harness.innerTools.invocations).toEqual([])
        const toolMessage = harness.llm.receivedMessages[2].find(message => message.role === 'tool')
        expect(toolMessage.toolResults[0].result.error.code).toBe('TOOL_NOT_ALLOWED')
    })

    describe('the LLM-facing update_recipe_values schema hides workflow-bound fields', () => {

        it('only exposes recipeId + values to the model — writableHandles and baseModelHash are workflow-managed', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                innerTools: innerToolsForUpdate(),
                replies: [
                    {text: '{"handles":["targetDate"]}'},
                    {text: 'OK'}
                ]
            })

            harness.invoke({recipeId: 'r1', instruction: 'edit'})

            const updaterSchema = harness.llm.receivedTools[1].find(schema => schema.name === 'update_recipe_values')
            expect(Object.keys(updaterSchema.parameters.properties).sort()).toEqual(['recipeId', 'values'])
            expect(updaterSchema.parameters.required.sort()).toEqual(['recipeId', 'values'])
        })
    })

    describe('writableHandles and baseModelHash are bound from the prepared packet, not from the model', () => {

        // Spying inner-tool double that records the input the orchestrator
        // actually delivered downstream — the seam for verifying the binding.
        function spyInnerTools() {
            const seen = []
            return innerToolsImpl(
                {update_recipe_values: input => {
                    seen.push(input)
                    return of({ok: true, data: {summary: 'ok', modelHash: 'h-next', appliedHandles: Object.keys(input.values), invalidatedHandles: []}})
                }},
                [{
                    name: 'update_recipe_values', description: 'Update.',
                    parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
                }]
            )
        }

        function updateCallWith(input) {
            return {id: 'tu1', name: 'update_recipe_values', input}
        }

        it('overrides a model-widened writableHandles with the prepared packet writableHandles so the tool can still reject out-of-scope values', () => {
            // Picker chose `cloudBuffer` only; prepared writableHandles = ['cloudBuffer'].
            // Updater LLM tries to widen by adding `snowMasking` to writableHandles and submitting both values.
            const innerTools = spyInnerTools()
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                innerTools,
                replies: [
                    {text: '{"handles":["cloudBuffer"]}'},
                    {toolCalls: [updateCallWith({
                        recipeId: 'r1', baseModelHash: 'h-base',
                        writableHandles: ['cloudBuffer', 'snowMasking'],
                        values: {cloudBuffer: 120, snowMasking: 'OFF'}
                    })]},
                    {text: 'done.'}
                ]
            })

            harness.invoke({recipeId: 'r1', instruction: 'set cloud buffer'})

            const invocations = innerTools.invocations.filter(call => call.name === 'update_recipe_values')
            expect(invocations).toHaveLength(1)
            // The downstream tool sees the closure-bound writableHandles, not what the model supplied.
            expect(invocations[0].input.writableHandles).toEqual(['cloudBuffer'])
        })

        it('overrides a model-supplied baseModelHash with the packet baseModelHash so the model cannot bypass concurrency control', () => {
            const innerTools = spyInnerTools()
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                innerTools,
                replies: [
                    {text: '{"handles":["cloudBuffer"]}'},
                    {toolCalls: [updateCallWith({
                        recipeId: 'r1', baseModelHash: 'h-tampered',
                        writableHandles: ['cloudBuffer'],
                        values: {cloudBuffer: 120}
                    })]},
                    {text: 'done.'}
                ]
            })

            harness.invoke({recipeId: 'r1', instruction: 'set cloud buffer'})

            const invocations = innerTools.invocations.filter(call => call.name === 'update_recipe_values')
            expect(invocations[0].input.baseModelHash).toBe('h-base')
        })

        it('declares update.updater as the LLM usage role for the updater specialist (distinct from picker + summary)', () => {
            const innerTools = spyInnerTools()
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                innerTools,
                replies: [
                    {text: '{"handles":["cloudBuffer"]}'},
                    {toolCalls: [updateCallWith({
                        recipeId: 'r1', baseModelHash: 'h-base',
                        writableHandles: ['cloudBuffer'],
                        values: {cloudBuffer: 120}
                    })]},
                    {text: 'done.'}
                ]
            })

            harness.invoke({recipeId: 'r1', instruction: 'set cloud buffer'})

            const updaterRequests = harness.llm.receivedRequests.filter(req => req.usageContext?.role === 'update.updater')
            expect(updaterRequests.length).toBeGreaterThan(0)
        })

        // The runtime canonicalizes the tool call before logging, so the
        // specialist.tool.request diagnostic never carries the model's
        // pre-bound fakes. Timeline canonicalization is covered directly
        // at the runtime seam in runSpecialist.test.js.
        it('records the canonicalized values on the specialist.tool.request log', () => {
            const innerTools = spyInnerTools()
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                innerTools,
                replies: [
                    {text: '{"handles":["cloudBuffer"]}'},
                    {toolCalls: [updateCallWith({
                        recipeId: 'r1',
                        baseModelHash: 'h-tampered',
                        writableHandles: ['cloudBuffer', 'snowMasking'],
                        values: {cloudBuffer: 120}
                    })]},
                    {text: 'done.'}
                ]
            })

            harness.invoke({recipeId: 'r1', instruction: 'set cloud buffer'})

            const requests = harness.bus.events.filter(event => event.type === 'specialist.tool.request' && event.tool === 'update_recipe_values')
            expect(requests).toHaveLength(1)
            expect(requests[0].inputSummary).toContain('baseModelHash=h-base')
            expect(requests[0].inputSummary).not.toMatch(/h-tampered/)
        })
    })
})
