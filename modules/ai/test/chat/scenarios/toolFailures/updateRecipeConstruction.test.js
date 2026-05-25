const {throwError} = require('rxjs')
const {aToolFactoryHarness, aFakeGuiRequests} = require('../../harness')

describe('update_recipe construction and preflight', () => {

    describe('when constructing update_recipe without all required inner tools', () => {

        it('refuses to construct when update_recipe_values is missing from the inner registry', () => {
            const innerTools = innerToolsExposing([])

            expect(() => aToolFactoryHarness({specialist: 'update_recipe', innerTools}))
                .toThrow(/update_recipe_values/)
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

        it('does not invoke any inner specialist LLM', () => {
            harness.invoke({recipeId: 'r1', instruction: 'edit'})

            expect(harness.llm.receivedMessages).toEqual([])
        })
    })
})

function innerToolsExposing(names) {
    const SCHEMAS = {
        update_recipe_values: {
            name: 'update_recipe_values',
            description: 'Set values for ONE recipe by handle name.',
            parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
        }
    }
    return {schemas: () => names.map(name => SCHEMAS[name])}
}
