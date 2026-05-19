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
            toolSchemas: [{name: 'load_for_update'}, {name: 'recipe_patch'}]
        })

        expect(bus.published).toEqual([{
            type: 'specialist.request',
            level: 'debug',
            conversationId: 'c1',
            name: 'recipe.update',
            round: 0,
            messageCount: 2,
            toolNames: ['load_for_update', 'recipe_patch'],
            message: 'specialist.request name=recipe.update round=0 messages=2 tools=[load_for_update,recipe_patch]'
        }])
    })

    it('renders an empty tool list as [-]', () => {
        const bus = aFakeBus()

        publishSpecialistRequest({bus, name: 'recipe.update', round: 0, messages: [], toolSchemas: []})

        expect(bus.published[0].message).toContain('tools=[-]')
    })
})

describe('publishSpecialistResponse', () => {

    it('publishes a debug-level specialist.response with textChars, tool call names, and empty flag', () => {
        const bus = aFakeBus()

        publishSpecialistResponse({
            bus, name: 'recipe.update', round: 0, conversationId: 'c1',
            text: 'Done.', toolCalls: []
        })

        expect(bus.published).toEqual([{
            type: 'specialist.response',
            level: 'debug',
            conversationId: 'c1',
            name: 'recipe.update',
            round: 0,
            textChars: 5,
            toolCallNames: [],
            empty: false,
            message: 'specialist.response name=recipe.update round=0 textChars=5 toolCalls=[-]'
        }])
    })

    it('marks the response as empty=true when there is no text and no tool calls (pseudo-tool / reasoning-only signal)', () => {
        const bus = aFakeBus()

        publishSpecialistResponse({bus, name: 'recipe.update', round: 1, text: '', toolCalls: []})

        expect(bus.published[0].empty).toBe(true)
        expect(bus.published[0].message).toMatch(/empty=true/)
    })

    it('lists tool-call names when the response is a tool-call', () => {
        const bus = aFakeBus()

        publishSpecialistResponse({
            bus, name: 'recipe.update', round: 0, text: '',
            toolCalls: [{id: 't1', name: 'load_for_update'}, {id: 't2', name: 'recipe_patch'}]
        })

        expect(bus.published[0].toolCallNames).toEqual(['load_for_update', 'recipe_patch'])
        expect(bus.published[0].message).toContain('toolCalls=[load_for_update,recipe_patch]')
    })
})

describe('publishSpecialistToolRequest', () => {

    it('publishes a debug-level specialist.tool.request with specialist name, tool name, and input keys', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({
            bus, name: 'recipe.update', conversationId: 'c1',
            toolCall: {id: 't1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'edit'}}
        })

        expect(bus.published).toEqual([{
            type: 'specialist.tool.request',
            level: 'debug',
            conversationId: 'c1',
            name: 'recipe.update',
            tool: 'load_for_update',
            inputKeys: ['recipeId', 'instruction'],
            message: 'specialist.tool.request name=recipe.update tool=load_for_update inputKeys=[recipeId,instruction]'
        }])
    })

    it('handles a missing input gracefully', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({bus, name: 'recipe.update', toolCall: {id: 't1', name: 'load_for_update'}})

        expect(bus.published[0].inputKeys).toEqual([])
    })
})

describe('publishSpecialistToolResponse', () => {

    it('publishes a debug-level specialist.tool.response with ok flag and tool-specific shape summary for load_for_update', () => {
        const bus = aFakeBus()
        const envelope = {ok: true, data: {
            baseModelHash: 'h1',
            intent: 'dateWindow',
            currentValues: {a: 1, b: 2, c: 3},
            dependentPaths: ['/x', '/y'],
            guidance: ['rule1']
        }}

        publishSpecialistToolResponse({bus, name: 'recipe.update', conversationId: 'c1', tool: 'load_for_update', envelope})

        expect(bus.published).toEqual([{
            type: 'specialist.tool.response',
            level: 'debug',
            conversationId: 'c1',
            name: 'recipe.update',
            tool: 'load_for_update',
            ok: true,
            shape: 'closure(intent=dateWindow,currentValues=3,dependentPaths=2,guidance=1)',
            message: 'specialist.tool.response name=recipe.update tool=load_for_update ok=true shape=closure(intent=dateWindow,currentValues=3,dependentPaths=2,guidance=1)'
        }])
    })

    it('summarises a recipe_patch success with modelHash/invalidatedPaths counts', () => {
        const bus = aFakeBus()
        const envelope = {ok: true, data: {summary: 'patched', modelHash: 'h2', invalidatedPaths: ['/a', '/b']}}

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'recipe_patch', envelope})

        expect(bus.published[0].shape).toBe('patch(modelHash=h2,invalidatedPaths=2)')
    })

    it('publishes ok=false with the error code instead of a shape for failed envelopes', () => {
        const bus = aFakeBus()
        const envelope = {ok: false, error: {code: 'STALE_WRITE', message: 'base hash mismatch'}}

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'recipe_patch', envelope})

        expect(bus.published[0]).toMatchObject({
            ok: false,
            tool: 'recipe_patch',
            errorCode: 'STALE_WRITE'
        })
        expect(bus.published[0].message).toContain('errorCode=STALE_WRITE')
    })

    it('falls back to a generic kind summary for unknown tool names', () => {
        const bus = aFakeBus()

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'unfamiliar_tool', envelope: {ok: true, data: {x: 1}}})

        expect(bus.published[0].shape).toBe('object')
    })
})

describe('publishUpdateRecipeOutcome', () => {

    it('publishes an info-level update_recipe.outcome with success fields when the patch applied', () => {
        const bus = aFakeBus()

        publishUpdateRecipeOutcome({
            bus, conversationId: 'c1', recipeId: 'r1',
            attempted: true, succeeded: true,
            code: 'ok', lastPatchErrorCode: null,
            answerChars: 42
        })

        expect(bus.published).toEqual([{
            type: 'update_recipe.outcome',
            level: 'info',
            conversationId: 'c1',
            recipeId: 'r1',
            patchAttempted: true,
            patchSucceeded: true,
            code: 'ok',
            lastPatchErrorCode: null,
            answerChars: 42,
            message: 'update_recipe.outcome recipeId=r1 patchAttempted=true patchSucceeded=true code=ok answerChars=42'
        }])
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
        expect(bus.published[0].message).toContain('patchAttempted=false')
        expect(bus.published[0].message).toContain('code=UPDATE_NOT_ATTEMPTED')
    })

    it('publishes UPDATE_FAILED with the last patch error code', () => {
        const bus = aFakeBus()

        publishUpdateRecipeOutcome({
            bus, recipeId: 'r1', attempted: true, succeeded: false,
            code: 'UPDATE_FAILED', lastPatchErrorCode: 'VALIDATION_FAILED', answerChars: 20
        })

        expect(bus.published[0].lastPatchErrorCode).toBe('VALIDATION_FAILED')
        expect(bus.published[0].message).toContain('lastPatchErrorCode=VALIDATION_FAILED')
    })
})
