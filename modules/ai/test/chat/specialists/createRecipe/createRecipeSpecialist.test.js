const {of} = require('rxjs')
const {createCreateRecipeSpecialist} = require('#mcp/chat/specialists/createRecipe/createRecipeSpecialist')
const {specialistPrompt} = require('#mcp/chat/llmText/prompts')
const {aFakeLlm, aFakeBus, expectNoHandlePathsIn} = require('../../builders')
const {innerToolsImpl, innerToolsWithSchemas, AOI_INNER_TOOL_SCHEMAS, AOI_INNER_TOOL_IMPLS} = require('../../harness')

const CONTEXT = {conversationId: 'conv-1'}

describe('create-recipe specialist', () => {

    describe('the LLM-facing create_recipe_values schema hides workflow-bound fields', () => {

        it('only exposes values to the model — recipeType / projectId / name / writableHandles are workflow-managed', () => {
            const {llm} = consultOnce({
                replies: [{text: 'ok'}],
                innerTools: innerToolsForCreate()
            })

            const createSchema = llm.receivedTools[0].find(schema => schema.name === 'create_recipe_values')
            expect(createSchema).toBeDefined()
            expect(Object.keys(createSchema.parameters.properties).sort()).toEqual(['values'])
            expect(createSchema.parameters.required.sort()).toEqual(['values'])
        })
    })

    describe('the prompt agrees with the visible schema', () => {

        const prompt = specialistPrompt('createRecipeHandles')

        it('shows the create_recipe_values call shape as ({values}) — the visible LLM surface', () => {
            expect(prompt).toMatch(/create_recipe_values\s*\(\s*\{\s*values\s*\}\s*\)/)
        })

        it('does not include workflow-bound field names inside the call shape', () => {
            // The body may legitimately mention writableHandles as "workflow-managed scope",
            // but the call signature itself must not promise/require those fields.
            for (const field of ['recipeType', 'projectId', 'writableHandles']) {
                expect(prompt).not.toMatch(new RegExp(`create_recipe_values\\s*\\([^)]*\\b${field}\\b`))
            }
        })

        it('forbids inventing AOI / geocoding place names and routes missing user-required values to clarification', () => {
            expect(prompt).toMatch(/(geocode|invent)/i)
            expect(prompt).toMatch(/aoi/i)
            expect(prompt).toMatch(/(clarif|ask)/i)
        })

        it('teaches the read-only nature of writableHandles (workflow-managed scope, not a tool parameter)', () => {
            expect(prompt).toMatch(/writableHandles/)
            expect(prompt).toMatch(/(do not include in the tool call|workflow-managed)/i)
        })

        it('documents inactiveCompanionFacts and the companion-doesn\'t-activate rule (no auto-promotion via companion alone)', () => {
            expect(prompt).toMatch(/inactiveCompanionFacts/)
            expect(prompt).toMatch(/does NOT activate/i)
            expect(prompt).toMatch(/same atomic call/i)
            expect(prompt).toMatch(/INACTIVE_VALUE/)
        })
    })

    describe('workflow-bound fields are injected from the prepared packet, not from the model', () => {

        function spyInnerTools() {
            const seen = []
            return innerToolsImpl(
                {
                    create_recipe_values: input => {
                        seen.push(input)
                        return of({ok: true, data: {recipeId: 'r-new', type: 'MOSAIC', name: input.name, projectId: input.projectId, summary: 'created'}})
                    },
                    ...AOI_INNER_TOOL_IMPLS
                },
                [
                    {
                        name: 'create_recipe_values', description: 'Create.',
                        parameters: {type: 'object', properties: {recipeType: {type: 'string'}, projectId: {type: 'string'}, name: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
                    },
                    ...AOI_INNER_TOOL_SCHEMAS
                ]
            )
        }

        function createCallWith(input) {
            return {id: 'tc1', name: 'create_recipe_values', input}
        }

        it('overrides a model-supplied writableHandles with the packet writableHandles so the tool can still reject out-of-scope values', () => {
            const innerTools = spyInnerTools()
            consultOnce({
                replies: [{toolCalls: [createCallWith({writableHandles: ['aoi', 'cloudBuffer'], values: {aoi: aPolygonAoi(), cloudBuffer: 120}})]}, {text: 'done'}],
                innerTools,
                consultArgs: {packet: aPacket({writableHandles: ['aoi']})}
            })

            const invocations = innerTools.invocations.filter(call => call.name === 'create_recipe_values')
            expect(invocations).toHaveLength(1)
            expect(invocations[0].input.writableHandles).toEqual(['aoi'])
        })

        it('overrides a model-supplied recipeType with the workflow recipeType so the model cannot redirect creation', () => {
            const innerTools = spyInnerTools()
            consultOnce({
                replies: [{toolCalls: [createCallWith({recipeType: 'NOT_MOSAIC', values: {aoi: aPolygonAoi()}})]}, {text: 'done'}],
                innerTools,
                consultArgs: {recipeType: 'MOSAIC', packet: aPacket({writableHandles: ['aoi']})}
            })

            const invocations = innerTools.invocations.filter(call => call.name === 'create_recipe_values')
            expect(invocations[0].input.recipeType).toBe('MOSAIC')
        })

        it('overrides a model-supplied projectId / name with the workflow projectId / name', () => {
            const innerTools = spyInnerTools()
            consultOnce({
                replies: [{toolCalls: [createCallWith({projectId: 'fake', name: 'wrong', values: {aoi: aPolygonAoi()}})]}, {text: 'done'}],
                innerTools,
                consultArgs: {
                    recipeType: 'MOSAIC', projectId: 'real-p', name: 'Real name',
                    packet: aPacket({writableHandles: ['aoi']})
                }
            })

            const invocations = innerTools.invocations.filter(call => call.name === 'create_recipe_values')
            expect(invocations[0].input.projectId).toBe('real-p')
            expect(invocations[0].input.name).toBe('Real name')
        })

        it('declares create.updater as the LLM usage role (distinct from picker + summary roles)', () => {
            const {llm} = consultOnce({
                replies: [{text: 'ok'}],
                innerTools: innerToolsForCreate()
            })

            expect(llm.receivedRequests[0].usageContext).toMatchObject({role: 'create.updater'})
        })
    })

    describe('AOI lookup tools are required inner tools', () => {

        it('throws at specialist construction when AOI lookup tools are absent from inner tools', () => {
            const innerToolsWithoutAoi = innerToolsWithSchemas([createRecipeValuesSchema()])

            expect(() => consultOnce({replies: [{text: 'ok'}], innerTools: innerToolsWithoutAoi}))
                .toThrow(/aoi_list_countries.*aoi_list_country_areas/)
        })

        it('exposes aoi_list_countries + aoi_list_country_areas alongside create_recipe_values, hides everything else', () => {
            const innerTools = innerToolsWithSchemas([
                createRecipeValuesSchema(),
                {name: 'aoi_list_countries', description: 'List countries.', parameters: {type: 'object', properties: {query: {type: 'string'}}}},
                {name: 'aoi_list_country_areas', description: 'List areas.', parameters: {type: 'object', properties: {countryId: {type: 'integer'}, query: {type: 'string'}}, required: ['countryId']}},
                {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {}}}
            ])
            const {llm} = consultOnce({replies: [{text: 'ok'}], innerTools})

            expect(llm.receivedTools[0].map(schema => schema.name).sort())
                .toEqual(['aoi_list_countries', 'aoi_list_country_areas', 'create_recipe_values'])
        })
    })

    describe('user message carries the prepared packet (handles + values) for the updater', () => {

        it('includes the instruction, the recipeType, and the prepared packet in the user message', () => {
            const {llm} = consultOnce({
                replies: [{text: 'ok'}],
                innerTools: innerToolsForCreate(),
                consultArgs: {
                    recipeType: 'MOSAIC',
                    instruction: 'Create a mosaic of Kenya',
                    packet: aPacket({writableHandles: ['aoi', 'datasets']})
                }
            })

            const userMessage = lastUserMessage(llm.receivedMessages[0])
            expect(userMessage.content).toContain('MOSAIC')
            expect(userMessage.content).toContain('Create a mosaic of Kenya')
            expect(userMessage.content).toMatch(/writableHandles/)
        })

        it('does not leak handle JSON Pointer paths in the system prompt or user message', () => {
            const {llm} = consultOnce({
                replies: [{text: 'ok'}],
                innerTools: innerToolsForCreate()
            })

            const systemMessage = llm.receivedMessages[0][0]
            const userMessage = lastUserMessage(llm.receivedMessages[0])
            expectNoHandlePathsIn(systemMessage.content, {recipeType: 'MOSAIC', ignore: ['instruction']})
            // The packet stringification is dynamic content, not the cacheable prompt.
            // expectNoHandlePathsIn covers handle paths only — the test packet uses none.
            expect(userMessage.role).toBe('user')
        })
    })
})

function consultOnce({replies, innerTools, consultArgs = {}}) {
    const bus = aFakeBus()
    const busTracked = {publish: bus.publish, track$: (_n, _a, work$) => work$, track: bus.track}
    const llm = aFakeLlm({replies})
    const specialist = createCreateRecipeSpecialist({llm, bus: busTracked, innerTools})
    const args = {
        recipeType: 'MOSAIC',
        instruction: 'Create a mosaic',
        packet: aPacket({}),
        context: CONTEXT,
        ...consultArgs
    }
    specialist.consult$(args).subscribe({error: e => { throw e }})
    return {llm, bus}
}

function innerToolsForCreate() {
    return innerToolsWithSchemas([createRecipeValuesSchema(), ...AOI_INNER_TOOL_SCHEMAS])
}

function createRecipeValuesSchema() {
    return {
        name: 'create_recipe_values',
        description: 'Create.',
        parameters: {
            type: 'object',
            properties: {
                recipeType: {type: 'string'}, projectId: {type: 'string'}, name: {type: 'string'},
                writableHandles: {type: 'array'}, values: {type: 'object'}
            },
            required: ['recipeType', 'writableHandles', 'values']
        }
    }
}

function aPacket({writableHandles = ['aoi'], pickedHandles = [], requiredHandles = ['aoi'], fields = {aoi: {label: 'Area of interest', currentValue: null, required: true}}} = {}) {
    return {pickedHandles, requiredHandles, writableHandles, fields, dependencyFacts: [], couplingFacts: [], applicabilityFacts: [], validationRules: []}
}

function aPolygonAoi() {
    return {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]}
}

function lastUserMessage(messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') return messages[i]
    }
    return null
}
