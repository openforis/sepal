const {of} = require('rxjs')
const {aToolFactoryHarness, innerToolsImpl} = require('../../harness')
const {metadataFor, mosaicMetadata} = require('./fixtures')

// A successful recipe_patch result fed back to the specialist carries
// deterministic, label-enriched appliedChanges (derived from the recipe spec's
// valueLabels), so the specialist's own final answer can speak user-facing
// labels instead of raw enum ids. Raw operations stay untouched for the actual
// tool call, validation, and logs.
describe('update_recipe enriches successful patch results with value labels', () => {

    const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
        recipeId: 'r1', baseModelHash: 'h1',
        operations: [
            {op: 'replace', path: '/compositeOptions/includedCloudMasking', value: ['landsatCFMask']},
            {op: 'replace', path: '/compositeOptions/landsatCFMaskCloudMasking', value: 'AGGRESSIVE'}
        ]
    }}

    function patchInnerTools() {
        return innerToolsImpl(
            {recipe_patch: () => of({ok: true, data: {summary: 'patched', modelHash: 'h2', invalidatedPaths: []}})},
            [
                {name: 'prepare_update', description: 'Prepare.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, focusPaths: {type: 'array', items: {type: 'string'}}}}},
                {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}}
            ]
        )
    }

    function recipePatchResultSeenBySpecialist(harness) {
        const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
        return toolMessage.toolResults.find(result => result.toolName === 'recipe_patch').result
    }

    function aHarness(replies) {
        return aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: metadataFor(mosaicMetadata),
            innerTools: patchInnerTools(),
            replies
        })
    }

    it('adds appliedChanges with scalar and array value labels to the patch result the specialist reads', () => {
        const harness = aHarness([{toolCalls: [patchCall]}, {text: 'Done.'}])

        harness.invoke({recipeId: 'r1', instruction: 'use Landsat CFMask, set it aggressive'})

        const result = recipePatchResultSeenBySpecialist(harness)
        expect(result.data.appliedChanges).toEqual(expect.arrayContaining([
            {op: 'replace', path: '/compositeOptions/landsatCFMaskCloudMasking', value: 'AGGRESSIVE', valueLabel: 'aggressive'},
            {op: 'replace', path: '/compositeOptions/includedCloudMasking', value: ['landsatCFMask'], valueLabels: ['Landsat CFMask']}
        ]))
    })

    it('leaves the raw operations untouched on the result for grounding', () => {
        const harness = aHarness([{toolCalls: [patchCall]}, {text: 'Done.'}])

        harness.invoke({recipeId: 'r1', instruction: 'use Landsat CFMask, set it aggressive'})

        const result = recipePatchResultSeenBySpecialist(harness)
        expect(result.data.summary).toBe('patched')
        expect(result.data.modelHash).toBe('h2')
    })

    it('does not disturb the non-empty specialist answer path', () => {
        const harness = aHarness([{toolCalls: [patchCall]}, {text: 'Switched to aggressive Landsat cloud masking.'}])

        const result = harness.invoke({recipeId: 'r1', instruction: 'use Landsat CFMask, set it aggressive'})

        expect(result).toEqual({ok: true, data: {answer: 'Switched to aggressive Landsat cloud masking.'}})
    })
})
