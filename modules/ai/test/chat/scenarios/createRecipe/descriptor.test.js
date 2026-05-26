const {aToolFactoryHarness} = require('../../harness')

// Pin the orchestrator-facing surface of create_recipe: name, parameters,
// supported-types enum, directAnswer flag, and the orchestrator-routing
// language. Companion descriptor-shape pins for the inner create_recipe_values
// tool live with the unit tests.
describe('create_recipe descriptor', () => {

    let harness
    beforeEach(() => {
        harness = aToolFactoryHarness({specialist: 'create_recipe'})
    })

    it('is named create_recipe with recipeType + instruction required', () => {
        expect(harness.tool.name).toBe('create_recipe')
        expect(harness.tool.parameters.required.sort()).toEqual(['instruction', 'recipeType'])
        expect(harness.tool.parameters.additionalProperties).toBe(false)
    })

    it('restricts recipeType to the v1-supported set (MOSAIC only)', () => {
        expect(harness.tool.parameters.properties.recipeType.enum).toEqual(['MOSAIC'])
    })

    it('exposes projectId and name as optional parameters (not required)', () => {
        expect(harness.tool.parameters.properties).toMatchObject({
            projectId: {type: 'string'},
            name: {type: 'string'}
        })
        expect(harness.tool.parameters.required).not.toContain('projectId')
        expect(harness.tool.parameters.required).not.toContain('name')
    })

    it('steers the orchestrator off using update_recipe for new recipes', () => {
        expect(harness.tool.description).toMatch(/update_recipe/i)
        expect(harness.tool.description).toMatch(/(create|new)/i)
    })

    it('opts into directAnswer so the orchestrator streams specialist prose verbatim', () => {
        expect(harness.tool.directAnswer).toBe(true)
    })
})
