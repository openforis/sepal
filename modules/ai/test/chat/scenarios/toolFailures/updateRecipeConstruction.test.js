const {throwError} = require('rxjs')
const {aToolFactoryHarness, aFakeGuiRequests} = require('../../harness')

describe('update_recipe construction and preflight', () => {

    describe('when constructing update_recipe without all required inner tools', () => {

        it('refuses to construct when load_for_update is missing from the inner registry', () => {
            const innerTools = innerToolsExposing(['recipe_patch'])

            expect(() => aToolFactoryHarness({specialist: 'update_recipe', innerTools}))
                .toThrow(/load_for_update/)
        })

        it('refuses to construct when recipe_patch is missing from the inner registry', () => {
            const innerTools = innerToolsExposing(['load_for_update'])

            expect(() => aToolFactoryHarness({specialist: 'update_recipe', innerTools}))
                .toThrow(/recipe_patch/)
        })
    })

    describe('when the update_recipe preflight metadata lookup fails', () => {
        let harness
        beforeEach(() => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI gone')))
            harness = aToolFactoryHarness({specialist: 'update_recipe', guiRequests})
        })

        it('returns a failure envelope carrying the bridge error message', () => {
            const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

            expect(result).toEqual({
                ok: false,
                error: expect.objectContaining({code: 'TOOL_FAILED', message: 'GUI gone'})
            })
        })

        it('does not invoke the inner specialist LLM', () => {
            harness.invoke({recipeId: 'r1', instruction: 'edit'})

            expect(harness.llm.receivedMessages).toEqual([])
        })
    })
})

// Inner-registry double exposing only the named tool schemas, with no
// invoke$ implementations. update_recipe construction only inspects
// schemas() to verify required tools are present.
function innerToolsExposing(names) {
    const SCHEMAS = {
        load_for_update: {
            name: 'load_for_update',
            description: 'Load + closure for ONE recipe.',
            parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}}
        },
        recipe_patch: {
            name: 'recipe_patch',
            description: 'Apply JSON Patch to ONE recipe.',
            parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}
        }
    }
    return {schemas: () => names.map(name => SCHEMAS[name])}
}
