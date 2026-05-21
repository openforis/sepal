const {
    publishSpecialistRequest,
    publishSpecialistResponse,
    publishSpecialistToolRequest,
    publishSpecialistToolResponse,
    publishSpecialistNoProgress,
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
            toolSchemas: [{name: 'prepare_update'}, {name: 'recipe_patch'}]
        })

        expect(bus.published).toEqual([expect.objectContaining({
            type: 'specialist.request',
            level: 'debug',
            conversationId: 'c1',
            name: 'recipe.update',
            round: 0,
            messageCount: 2,
            toolNames: ['prepare_update', 'recipe_patch']
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
            toolCalls: [{id: 't1', name: 'prepare_update'}, {id: 't2', name: 'recipe_patch'}]
        })

        expect(bus.published[0].toolCallNames).toEqual(['prepare_update', 'recipe_patch'])
    })
})

describe('publishSpecialistToolRequest', () => {

    it('publishes a debug-level specialist.tool.request with specialist name, tool name, input keys, and bounded input summary', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({
            bus, name: 'recipe.update', conversationId: 'c1',
            toolCall: {id: 't1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: ['/dates/targetDate']}}
        })

        expect(bus.published).toEqual([expect.objectContaining({
            type: 'specialist.tool.request',
            level: 'debug',
            conversationId: 'c1',
            name: 'recipe.update',
            tool: 'prepare_update',
            inputKeys: ['recipeId', 'focusPaths'],
            inputSummary: 'recipeId=r1 focusPaths=[/dates/targetDate]'
        })])
        expect(bus.published[0].message).toContain('focusPaths=[/dates/targetDate]')
    })

    it('summarises recipe_patch request operations without enabling full payload trace logs', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({
            bus, name: 'recipe.update', conversationId: 'c1',
            toolCall: {id: 't1', name: 'recipe_patch', input: {
                recipeId: 'r1',
                baseModelHash: '01234567-89ab-cdef-0123-456789abcdef',
                operations: [
                    {op: 'replace', path: '/compositeOptions/cloudBuffer', value: 0},
                    {op: 'replace', path: '/compositeOptions/landsatCFMaskCloudMasking', value: 'AGGRESSIVE'}
                ]
            }}
        })

        expect(bus.published[0].inputSummary).toBe(
            'recipeId=r1 baseModelHash=01234567 ops=[replace /compositeOptions/cloudBuffer value=0;replace /compositeOptions/landsatCFMaskCloudMasking value="AGGRESSIVE"]'
        )
        expect(bus.published[0].message).toContain('/compositeOptions/cloudBuffer value=0')
    })

    it('handles a missing input gracefully', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({bus, name: 'recipe.update', toolCall: {id: 't1', name: 'prepare_update'}})

        expect(bus.published[0].inputKeys).toEqual([])
    })

    it('renders a small scalar array value inline so a narrowed includedCloudMasking is visible in logs', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({
            bus, name: 'recipe.update', conversationId: 'c1',
            toolCall: {id: 't1', name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h',
                operations: [{op: 'replace', path: '/compositeOptions/includedCloudMasking', value: ['sepalCloudScore', 'landsatCFMask']}]
            }}
        })

        expect(bus.published[0].inputSummary).toContain('replace /compositeOptions/includedCloudMasking value=["sepalCloudScore","landsatCFMask"]')
    })

    it('keeps a large scalar array summarized to avoid noisy logs', () => {
        const bus = aFakeBus()
        const manyMethods = Array.from({length: 30}, (_, i) => `method-${i}`)

        publishSpecialistToolRequest({
            bus, name: 'recipe.update', conversationId: 'c1',
            toolCall: {id: 't1', name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h',
                operations: [{op: 'replace', path: '/compositeOptions/includedCloudMasking', value: manyMethods}]
            }}
        })

        expect(bus.published[0].inputSummary).toContain('value=array(30)')
    })

    it('summarizes an array of objects rather than dumping nested structures', () => {
        const bus = aFakeBus()

        publishSpecialistToolRequest({
            bus, name: 'recipe.update', conversationId: 'c1',
            toolCall: {id: 't1', name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h',
                operations: [{op: 'replace', path: '/compositeOptions/filters', value: [{type: 'HAZE', percentile: 90}, {type: 'NDVI', percentile: 50}]}]
            }}
        })

        expect(bus.published[0].inputSummary).toContain('value=array(2)')
    })
})

describe('publishSpecialistToolResponse', () => {

    it('summarises a prepare_update success with focus/dependent/writable path counts', () => {
        const bus = aFakeBus()
        const envelope = {ok: true, data: {
            baseModelHash: 'h1',
            focusPaths: ['/sources/dataSets'],
            dependentPaths: ['/compositeOptions/corrections', '/sceneSelectionOptions/type'],
            writablePaths: ['/sources/dataSets', '/compositeOptions/corrections', '/sceneSelectionOptions/type']
        }}

        publishSpecialistToolResponse({bus, name: 'recipe.update', conversationId: 'c1', tool: 'prepare_update', envelope})

        expect(bus.published[0].shape).toBe('prepared(focus=1[/sources/dataSets],dependent=2[/compositeOptions/corrections,/sceneSelectionOptions/type],writable=3[/sources/dataSets,/compositeOptions/corrections,/sceneSelectionOptions/type])')
    })

    it('summarises a recipe_patch success with modelHash/invalidatedPaths counts', () => {
        const bus = aFakeBus()
        const envelope = {ok: true, data: {summary: 'patched', modelHash: 'h2', invalidatedPaths: ['/a', '/b']}}

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'recipe_patch', envelope})

        expect(bus.published[0].shape).toBe('patch(modelHash=h2,invalidatedPaths=2[/a,/b])')
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
    })

    it('falls back to a generic kind summary for unknown tool names', () => {
        const bus = aFakeBus()

        publishSpecialistToolResponse({bus, name: 'recipe.update', tool: 'unfamiliar_tool', envelope: {ok: true, data: {x: 1}}})

        expect(bus.published[0].shape).toBe('object')
    })
})

describe('publishSpecialistNoProgress', () => {

    it('publishes a warn-level specialist.noProgress event with name, round, message count, tool names, and reason', () => {
        const bus = aFakeBus()

        publishSpecialistNoProgress({
            bus, name: 'recipe.update', round: 1, conversationId: 'c1',
            messageCount: 4, toolNames: ['prepare_update', 'recipe_patch'],
            nudgeChars: 120, reason: 'no-progress-nudge'
        })

        expect(bus.published).toEqual([expect.objectContaining({
            type: 'specialist.noProgress',
            level: 'warn',
            conversationId: 'c1',
            name: 'recipe.update',
            round: 1,
            messageCount: 4,
            toolNames: ['prepare_update', 'recipe_patch'],
            nudgeChars: 120,
            reason: 'no-progress-nudge'
        })])
        expect(bus.published[0].message).toBe(
            'specialist.noProgress name=recipe.update round=1 messages=4 tools=[prepare_update,recipe_patch] reason=no-progress-nudge'
        )
    })

    it('renders no tool names as a dash, matching the other specialist diagnostics', () => {
        const bus = aFakeBus()

        publishSpecialistNoProgress({bus, name: 'recipe.update', round: 1, messageCount: 2, toolNames: [], reason: 'no-progress-nudge'})

        expect(bus.published[0].message).toContain('tools=[-]')
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

    it('publishes UPDATE_FAILED with the last patch error code', () => {
        const bus = aFakeBus()

        publishUpdateRecipeOutcome({
            bus, recipeId: 'r1', attempted: true, succeeded: false,
            code: 'UPDATE_FAILED', lastPatchErrorCode: 'VALIDATION_FAILED', answerChars: 20
        })

        expect(bus.published[0].lastPatchErrorCode).toBe('VALIDATION_FAILED')
    })
})
