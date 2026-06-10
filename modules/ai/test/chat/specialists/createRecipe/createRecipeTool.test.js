import {of} from 'rxjs'

import {createRecipeTool} from '#mcp/chat/specialists/createRecipe/createRecipeTool'
import {createRecipeValuesTool} from '#mcp/chat/specialists/createRecipe/createRecipeValuesTool'

import {aFakeBus, aFakeGuiRequests, aFakeLlm, read} from '../../builders.js'
import {AOI_INNER_TOOL_IMPLS, AOI_INNER_TOOL_SCHEMAS, innerToolsImpl, innerToolsWithSchemas} from '../../harness.js'

const POLYGON = {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]}

describe('create_recipe tool (workflow integration)', () => {

    describe('the tool descriptor', () => {

        it('is named create_recipe with directAnswer=true and recipeType (enum) + instruction required', () => {
            const {tool} = aTool({replies: [{text: '{"handles":[]}'}, {text: 'ok'}]})

            expect(tool.name).toBe('create_recipe')
            expect(tool.directAnswer).toBe(true)
            expect(tool.parameters.required.sort()).toEqual(['instruction', 'recipeType'])
            expect(tool.parameters.properties.recipeType.enum).toEqual(['MOSAIC'])
            expect(tool.parameters.additionalProperties).toBe(false)
        })

        it('steers the orchestrator: use update_recipe for editing an existing recipe', () => {
            const {tool} = aTool({replies: [{text: '{"handles":[]}'}, {text: 'ok'}]})

            expect(tool.description).toMatch(/update_recipe/i)
            expect(tool.description).toMatch(/(create|new)/i)
        })
    })

    describe('happy path: instruction supplies AOI, creates a valid MOSAIC', () => {

        it('returns {ok:true, data:{answer}} streaming the specialist prose verbatim', () => {
            const calls = []
            const {invoke} = aTool({
                replies: [
                    {text: '{"handles":["aoi"]}'},
                    {toolCalls: [{id: 'tc1', name: 'create_recipe_values', input: {values: {aoi: POLYGON}}}]},
                    {text: 'Created a Kenya MOSAIC recipe.'}
                ],
                guiCalls: calls,
                createResponse: {summary: 'ok', recipeId: 'r-new', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'}
            })

            const result = invoke({recipeType: 'MOSAIC', instruction: 'Create a MOSAIC of polygon Kenya', name: 'Kenya', projectId: 'p1'})

            expect(result).toEqual({ok: true, data: {answer: 'Created a Kenya MOSAIC recipe.'}})
            expect(calls.find(call => call.action === 'create-recipe')).toBeDefined()
        })

        it('synthesizes a deterministic "Created …" answer when create succeeded but the specialist emitted nothing visible after the success (anyCreateApplied finish-on-empty)', () => {
            // The picker text + a create_recipe_values tool call (success) + an
            // empty final text. finishOnEmpty stops the specialist; without the
            // fallback the directAnswer would be empty and nothing would stream.
            const {invoke} = aTool({
                replies: [
                    {text: '{"handles":["aoi"]}'},
                    {toolCalls: [{id: 'tc1', name: 'create_recipe_values', input: {values: {aoi: POLYGON}}}]},
                    {text: ''}
                ],
                createResponse: {summary: 'created', recipeId: 'r-new', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'}
            })

            const result = invoke({recipeType: 'MOSAIC', instruction: 'Create a Kenya mosaic of polygon', projectId: 'p1', name: 'Kenya'})

            expect(result.ok).toBe(true)
            expect(result.data.answer.trim().length).toBeGreaterThan(0)
            expect(result.data.answer).toMatch(/Created.*Kenya.*mosaic/i)
        })

        it('falls back to "Created …" without the name part when no name was supplied', () => {
            const {invoke} = aTool({
                replies: [
                    {text: '{"handles":["aoi"]}'},
                    {toolCalls: [{id: 'tc1', name: 'create_recipe_values', input: {values: {aoi: POLYGON}}}]},
                    {text: ''}
                ]
            })

            const result = invoke({recipeType: 'MOSAIC', instruction: 'Create a mosaic of polygon'})

            expect(result.ok).toBe(true)
            expect(result.data.answer).toMatch(/Created.*mosaic recipe\./i)
            expect(result.data.answer).not.toMatch(/""/)
        })

        it('submits the effective model to GUI create-recipe with workflow-bound recipeType/name/projectId, ignoring any model-supplied versions', () => {
            const calls = []
            const {invoke} = aTool({
                replies: [
                    {text: '{"handles":["aoi"]}'},
                    {toolCalls: [{id: 'tc1', name: 'create_recipe_values', input: {recipeType: 'INVALID', name: 'wrong', values: {aoi: POLYGON}}}]},
                    {text: 'done.'}
                ],
                guiCalls: calls,
                createResponse: {summary: 'ok', recipeId: 'r-new'}
            })

            invoke({recipeType: 'MOSAIC', instruction: 'Create a mosaic of polygon', projectId: 'p2', name: 'My recipe'})

            const createCall = calls.find(call => call.action === 'create-recipe')
            expect(createCall.params).toMatchObject({type: 'MOSAIC', name: 'My recipe', projectId: 'p2'})
            expect(createCall.params.model.aoi).toEqual(POLYGON)
        })
    })

    describe('clarification path: instruction lacks AOI, specialist asks one question', () => {

        it('returns CLARIFICATION_NEEDED with the specialist answer, and never calls GUI create-recipe', () => {
            const calls = []
            const {invoke} = aTool({
                replies: [
                    {text: '{"handles":[]}'},
                    {text: 'What area should this mosaic cover? Send me a polygon or pick a country/region.'}
                ],
                guiCalls: calls
            })

            const result = invoke({recipeType: 'MOSAIC', instruction: 'Create a mosaic'})

            expect(result.ok).toBe(false)
            expect(result.error).toMatchObject({
                code: 'CLARIFICATION_NEEDED',
                answer: expect.stringMatching(/what area/i)
            })
            expect(calls.find(call => call.action === 'create-recipe')).toBeUndefined()
        })
    })

    describe('failure paths', () => {

        it('returns a direct UNSUPPORTED_RECIPE_TYPE answer when recipeType is not in the supported set', () => {
            const {invoke} = aTool({replies: [{text: 'never reached'}]})

            const result = invoke({recipeType: 'CLASSIFICATION', instruction: 'Create a classification'})

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('UNSUPPORTED_RECIPE_TYPE')
            expect(result.error.answer).toMatch(/(only mosaic|not.*supported)/i)
        })

        it('classifies a create_recipe_values failure as CREATE_FAILED with a user-facing failure answer built from handleErrors', () => {
            const {invoke} = aTool({
                replies: [
                    {text: '{"handles":["aoi"]}'},
                    {toolCalls: [{id: 'tc1', name: 'create_recipe_values', input: {values: {aoi: 'not-a-polygon'}}}]},
                    {text: 'Specialist gives up.'}
                ],
                createResponse: () => of({ok: false, error: {code: 'VALIDATION_FAILED', message: 'invalid aoi', handleErrors: [{handle: 'aoi', message: 'must be an object'}]}}),
                useRealInnerTool: false
            })

            const result = invoke({recipeType: 'MOSAIC', instruction: 'Create a mosaic'})

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('CREATE_FAILED')
            expect(result.error.toolError).toMatchObject({code: 'VALIDATION_FAILED'})
            expect(result.error.answer).toMatch(/aoi.*must be an object/i)
        })
    })

    describe('the create specialist sees only {values} on the LLM-visible schema', () => {

        it('hides recipeType, projectId, name, writableHandles from the create_recipe_values schema sent to the LLM', () => {
            const {invoke, llm} = aTool({replies: [{text: '{"handles":[]}'}, {text: 'ok'}]})

            invoke({recipeType: 'MOSAIC', instruction: 'Create a mosaic'})

            // receivedTools[0] is the picker call (tool-free).
            // receivedTools[1] is the create specialist call — should expose only `values`.
            expect(llm.receivedTools[0]).toEqual([])
            const createSchema = llm.receivedTools[1].find(schema => schema.name === 'create_recipe_values')
            expect(Object.keys(createSchema.parameters.properties).sort()).toEqual(['values'])
        })
    })
})

function aTool({replies, guiCalls, createResponse, useRealInnerTool = true} = {}) {
    const bus = aFakeBus()
    const busTracked = {publish: bus.publish, track$: (_n, _a, work$) => work$, track: bus.track}
    const llm = aFakeLlm({replies})
    const gui = aRecordingGui({calls: guiCalls, createResponse})
    const innerTools = useRealInnerTool
        ? innerToolsWithRealCreateValues(gui.handler)
        : innerToolsImpl(
            {
                create_recipe_values: (_input, _ctx) => typeof createResponse === 'function' ? createResponse() : of(createResponse),
                ...AOI_INNER_TOOL_IMPLS
            },
            [createRecipeValuesSchema(), ...AOI_INNER_TOOL_SCHEMAS]
        )
    const tool = createRecipeTool({llm, bus: busTracked, innerTools})
    return {
        tool,
        llm,
        bus,
        invoke(input, ctx = {clientId: 'c1', subscriptionId: 's1', conversationId: 'conv-1'}) {
            return read(tool.invoke$(input, ctx))
        }
    }
}

function innerToolsWithRealCreateValues(guiHandler) {
    const realTool = createRecipeValuesTool(aFakeGuiRequests(guiHandler))
    return innerToolsImpl(
        {
            create_recipe_values: (input, ctx) => realTool.invoke$(input, ctx),
            ...AOI_INNER_TOOL_IMPLS
        },
        [createRecipeValuesSchema(), ...AOI_INNER_TOOL_SCHEMAS]
    )
}

function aRecordingGui({calls, createResponse}) {
    const list = calls || []
    return {
        handler: request => {
            list.push(request)
            if (request.action === 'create-recipe') {
                if (typeof createResponse === 'function') return createResponse(request)
                if (createResponse !== undefined) return of(createResponse)
                return of({summary: 'created', recipeId: 'gen-id', type: request.params.type, name: request.params.name, projectId: request.params.projectId})
            }
            return of({})
        },
        calls: list
    }
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
