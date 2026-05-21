const {of} = require('rxjs')
const {aToolFactoryHarness, innerToolsImpl} = require('../../harness')
const {metadataFor, mosaicMetadata} = require('./fixtures')

// A failed recipe_patch result fed back to the specialist carries structured
// retryHints derived from the error, so recovery doesn't depend on parsing
// error strings. recipe_patch stays strict and the raw error fields remain.
describe('update_recipe annotates failed patch results with retry hints', () => {

    const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
        recipeId: 'r1', baseModelHash: 'h1',
        operations: [{op: 'remove', path: '/sources/dataSets/SENTINEL_2'}]
    }}
    const validationError = {
        code: 'VALIDATION_FAILED',
        message: 'recipe model failed validation',
        details: [{path: '/compositeOptions/corrections', rule: 'calibrateRequiresMultipleSources', message: 'needs both source groups'}]
    }

    function failingPatchTools() {
        return innerToolsImpl(
            {recipe_patch: () => of({ok: false, error: validationError})},
            [
                {name: 'prepare_update', description: 'Prepare.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, focusPaths: {type: 'array', items: {type: 'string'}}}}},
                {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}}
            ]
        )
    }

    function patchResultSeenBySpecialist(harness) {
        const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
        return toolMessage.toolResults.find(result => result.toolName === 'recipe_patch').result
    }

    function aHarness() {
        return aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: metadataFor(mosaicMetadata),
            innerTools: failingPatchTools(),
            replies: [{toolCalls: [patchCall]}, {text: 'Could not apply that.'}]
        })
    }

    it('adds validation-dependency retryHints to the failed result the specialist reads', () => {
        const harness = aHarness()

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        const result = patchResultSeenBySpecialist(harness)
        expect(result.ok).toBe(false)
        expect(result.error.retryHints).toEqual([expect.objectContaining({
            kind: 'validation-dependency',
            path: '/compositeOptions/corrections'
        })])
    })

    it('keeps the raw error code and validation details alongside the hints', () => {
        const harness = aHarness()

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        const result = patchResultSeenBySpecialist(harness)
        expect(result.error.code).toBe('VALIDATION_FAILED')
        expect(result.error.details).toEqual(validationError.details)
    })
})
