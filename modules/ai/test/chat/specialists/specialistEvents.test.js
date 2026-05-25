const {
    publishSpecialistRequest,
    publishSpecialistResponse,
    publishSpecialistToolRequest,
    publishSpecialistToolResponse,
    publishUpdateRecipeOutcome
} = require('#mcp/chat/specialists/specialistEvents')

function aFakeBus() {
    const published = []
    return {publish: event => published.push(event), published}
}

describe('publishSpecialistRequest', () => {

    it('publishes a debug-level specialist.request event with name, round, message count, and tool names', () => {
        const bus = aFakeBus()

        publishSpecialistRequest({
            bus, name: 'recipe.update', round: 0, conversationId: 'c1',
            messages: [{role: 'system', content: 's'}, {role: 'user', content: 'u'}],
            toolSchemas: [{name: 'update_recipe_values'}]
        })

        expect(bus.published).toEqual([expect.objectContaining({
            type: 'specialist.request',
            level: 'debug',
            conversationId: 'c1',
            name: 'recipe.update',
            round: 0,
            messageCount: 2,
            toolNames: ['update_recipe_values']
        })])
    })

    it('reports no tool names when the tool list is empty', () => {
        const bus = aFakeBus()

        publishSpecialistRequest({bus, name: 'recipe.update', round: 0, messages: [], toolSchemas: []})

        expect(bus.published[0].toolNames).toEqual([])
    })
})

describe('publishSpecialistResponse', () => {

    it('publishes a debug-level specialist.response with textChars, tool call names, and empty flag', () => {
        const bus = aFakeBus()

        publishSpecialistResponse({
            bus, name: 'recipe.update', round: 0, conversationId: 'c1',
            text: 'Done.', toolCalls: []
        })

        expect(bus.published).toEqual([expect.objectContaining({
            type: 'specialist.response',
            level: 'debug',
            conversationId: 'c1',
            name: 'recipe.update',
            round: 0,
            textChars: 5,
            toolCallNames: [],
            empty: false
        })])
    })

    it('marks the response as empty=true when there is no text and no tool calls (pseudo-tool / reasoning-only signal)', () => {
        const bus = aFakeBus()

        publishSpecialistResponse({bus, name: 'recipe.update', round: 1, text: '', toolCalls: []})

        expect(bus.published[0].empty).toBe(true)
    })

    it('lists tool-call names when the response is a tool-call', () => {
        const bus = aFakeBus()

        publishSpecialistResponse({
            bus, name: 'recipe.update', round: 0, text: '',
            toolCalls: [{id: 't1', name: 'update_recipe_values'}]
        })

        expect(bus.published[0].toolCallNames).toEqual(['update_recipe_values'])
    })

    it('carries reasoningChars + finishReason so an empty round is self-diagnosing (reasoning-burn vs true empty)', () => {
        const bus = aFakeBus()

        publishSpecialistResponse({
            bus, name: 'recipe.update', round: 1, text: '', toolCalls: [],
            reasoningChars: 1840, finishReason: 'length'
        })

        expect(bus.published[0]).toMatchObject({empty: true, reasoningChars: 1840, finishReason: 'length'})
        expect(bus.published[0].message).toContain('reasoningChars=1840')
        expect(bus.published[0].message).toContain('finishReason=length')
    })

    it('defaults reasoningChars to 0 and finishReason to null when the provider summary is absent', () => {
        const bus = aFakeBus()

        publishSpecialistResponse({bus, name: 'recipe.update', round: 0, text: 'Done.', toolCalls: []})

        expect(bus.published[0]).toMatchObject({reasoningChars: 0, finishReason: null})
    })

    it('never carries reasoning text — only the count + finish reason', () => {
        const bus = aFakeBus()

        publishSpecialistResponse({
            bus, name: 'recipe.update', round: 1, text: '', toolCalls: [],
            reasoningChars: 42, finishReason: 'length'
        })

        expect(JSON.stringify(bus.published[0])).not.toMatch(/reasoning_content|reasoningText|"reasoning":/)
    })
})

describe('publishSpecialistToolRequest', () => {

    it('publishes a debug-level specialist.tool.request with specialist name, tool name, input keys, and bounded input summary', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({
            bus, name: 'recipe.update', conversationId: 'c1',
            toolCall: {id: 'tu1', name: 'update_recipe_values', input: {
                recipeId: 'r1', baseModelHash: '01234567-89ab', writableHandles: ['datasets'],
                values: {datasets: {LANDSAT: ['LANDSAT_9']}}
            }}
        })

        expect(bus.published).toEqual([expect.objectContaining({
            type: 'specialist.tool.request',
            level: 'debug',
            conversationId: 'c1',
            name: 'recipe.update',
            tool: 'update_recipe_values',
            inputKeys: ['recipeId', 'baseModelHash', 'writableHandles', 'values'],
            inputSummary: 'recipeId=r1 baseModelHash=01234567 handles=[datasets]'
        })])
    })

    it('lists every handle the LLM submitted so a narrow vs broad request is visible in logs', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({
            bus, name: 'recipe.update', conversationId: 'c1',
            toolCall: {id: 'tu1', name: 'update_recipe_values', input: {
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods', 'landsatCloudMask'],
                values: {cloudMethods: ['sepalCloudScore', 'landsatCFMask'], landsatCloudMask: 'AGGRESSIVE'}
            }}
        })

        expect(bus.published[0].inputSummary).toContain('handles=[cloudMethods,landsatCloudMask]')
    })

    it('handles a missing input gracefully', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({bus, name: 'recipe.update', toolCall: {id: 'tu1', name: 'update_recipe_values'}})

        expect(bus.published[0].inputKeys).toEqual([])
        expect(bus.published[0].inputSummary).toBe('')
    })

    it('renders a dash for no submitted values rather than a misleading empty bracket', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({
            bus, name: 'recipe.update', conversationId: 'c1',
            toolCall: {id: 'tu1', name: 'update_recipe_values', input: {recipeId: 'r1', baseModelHash: 'h', values: {}}}
        })

        expect(bus.published[0].inputSummary).toContain('handles=[-]')
    })
})

describe('publishSpecialistToolResponse', () => {

    it('summarises an update_recipe_values success with modelHash + applied/invalidated handle counts and names', () => {
        const bus = aFakeBus()
        const envelope = {ok: true, data: {
            summary: 'updated',
            modelHash: 'h2-deadbeef-xx',
            appliedHandles: ['datasets', 'corrections'],
            invalidatedHandles: ['cloudMethods']
        }}

        publishSpecialistToolResponse({bus, name: 'recipe.update', conversationId: 'c1', tool: 'update_recipe_values', envelope})

        expect(bus.published[0].shape).toBe('update(modelHash=h2-deadb,applied=2[datasets,corrections],invalidated=1[cloudMethods])')
    })

    it('publishes ok=false with the error code and the error message for failed envelopes', () => {
        const bus = aFakeBus()
        const envelope = {ok: false, error: {code: 'HANDLE_OUT_OF_SCOPE', message: 'Handle(s) not in writableHandles: snowMasking'}}

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'update_recipe_values', envelope})

        expect(bus.published[0]).toMatchObject({
            ok: false,
            tool: 'update_recipe_values',
            errorCode: 'HANDLE_OUT_OF_SCOPE',
            errorMessage: 'Handle(s) not in writableHandles: snowMasking'
        })
        expect(bus.published[0].message).toContain('snowMasking')
    })

    it('carries the handle-keyed reasons for a VALIDATION_FAILED failure', () => {
        const bus = aFakeBus()
        const envelope = {ok: false, error: {
            code: 'VALIDATION_FAILED',
            message: 'recipe model failed validation',
            handleErrors: [
                {handle: 'corrections', message: 'cross-sensor calibration requires both source groups'},
                {handle: 'cloudMethods', message: 'Cloud Score+ requires Sentinel-2'}
            ]
        }}

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'update_recipe_values', envelope})

        expect(bus.published[0].handleErrors).toEqual([
            {handle: 'corrections', message: 'cross-sensor calibration requires both source groups'},
            {handle: 'cloudMethods', message: 'Cloud Score+ requires Sentinel-2'}
        ])
        expect(bus.published[0].message).toContain('corrections: cross-sensor calibration requires both source groups')
        expect(bus.published[0].message).toContain('cloudMethods: Cloud Score+ requires Sentinel-2')
    })

    it('renders a "?" for a null-handle entry (path that did not map back to a handle)', () => {
        const bus = aFakeBus()
        const envelope = {ok: false, error: {
            code: 'VALIDATION_FAILED',
            handleErrors: [{handle: null, message: 'pathless detail'}]
        }}

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'update_recipe_values', envelope})

        expect(bus.published[0].message).toContain('?: pathless detail')
    })

    it('falls back to a generic kind summary for unknown tool names', () => {
        const bus = aFakeBus()

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'unfamiliar_tool', envelope: {ok: true, data: {x: 1}}})

        expect(bus.published[0].shape).toBe('object')
    })
})

describe('publishUpdateRecipeOutcome', () => {

    it('publishes an info-level update_recipe.outcome with success fields when the update applied', () => {
        const bus = aFakeBus()

        publishUpdateRecipeOutcome({
            bus, conversationId: 'c1', recipeId: 'r1',
            attempted: true, succeeded: true,
            code: 'ok', lastPatchErrorCode: null,
            answerChars: 42
        })

        expect(bus.published).toEqual([expect.objectContaining({
            type: 'update_recipe.outcome',
            level: 'info',
            conversationId: 'c1',
            recipeId: 'r1',
            patchAttempted: true,
            patchSucceeded: true,
            code: 'ok',
            lastPatchErrorCode: null,
            answerChars: 42
        })])
    })

    it('publishes UPDATE_NOT_ATTEMPTED with patchAttempted=false', () => {
        const bus = aFakeBus()

        publishUpdateRecipeOutcome({
            bus, recipeId: 'r1', attempted: false, succeeded: false,
            code: 'UPDATE_NOT_ATTEMPTED', lastPatchErrorCode: null, answerChars: 0
        })

        expect(bus.published[0]).toMatchObject({
            patchAttempted: false,
            patchSucceeded: false,
            code: 'UPDATE_NOT_ATTEMPTED',
            answerChars: 0
        })
    })

    it('publishes UPDATE_FAILED with the last update error code', () => {
        const bus = aFakeBus()

        publishUpdateRecipeOutcome({
            bus, recipeId: 'r1', attempted: true, succeeded: false,
            code: 'UPDATE_FAILED', lastPatchErrorCode: 'VALIDATION_FAILED', answerChars: 20
        })

        expect(bus.published[0].lastPatchErrorCode).toBe('VALIDATION_FAILED')
    })
})
