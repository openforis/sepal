const {of} = require('rxjs')
const {aFakeGuiRequests} = require('../../builders')
const {aToolFactoryHarness, innerToolsImpl} = require('../../harness')
const {createRecipeValuesTool} = require('#mcp/chat/specialists/createRecipe/createRecipeValuesTool')
const {toEffectiveModel, validateRecipe} = require('#recipes')

const POLYGON = {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]}

// "Create a MOSAIC of polygon Kenya with aggressive cloud masking" — semantic
// create through the real picker -> prepare -> updater -> create_recipe_values
// path. Asserts on the SEMANTIC final model handed to GUI create-recipe, not
// on internal patch ops or model dumps.
describe('semantic create — instruction supplies AOI + handle tweaks, final model validates', () => {

    it('hands GUI a valid MOSAIC effective model carrying the supplied AOI and the requested cloud-masking strength', () => {
        const setup = aLiveCreateSetup()
        const updaterCall = {
            id: 'tc1', name: 'create_recipe_values',
            input: {
                values: {
                    aoi: POLYGON,
                    sepalCloudScoreMax: 25,
                    landsatCloudMask: 'AGGRESSIVE',
                    landsatShadowMask: 'AGGRESSIVE',
                    landsatCirrusMask: 'AGGRESSIVE'
                }
            }
        }
        const harness = aToolFactoryHarness({
            specialist: 'create_recipe',
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["sepalCloudScoreMax","landsatCloudMask","landsatShadowMask","landsatCirrusMask"]}'},
                {toolCalls: [updaterCall]},
                {text: 'Created Kenya MOSAIC with aggressive cloud masking.'}
            ]
        })

        const result = harness.invoke({
            recipeType: 'MOSAIC', instruction: 'Create a MOSAIC of polygon Kenya with aggressive cloud masking',
            projectId: 'p1', name: 'Kenya'
        })

        expect(result.ok).toBe(true)
        const submittedModel = setup.getSubmittedModel()
        expect(submittedModel.aoi).toEqual(POLYGON)
        expect(submittedModel.compositeOptions.sepalCloudScoreMaxCloudProbability).toBe(25)
        expect(submittedModel.compositeOptions.landsatCFMaskCloudMasking).toBe('AGGRESSIVE')
        expect(submittedModel.compositeOptions.landsatCFMaskCloudShadowMasking).toBe('AGGRESSIVE')
        expect(submittedModel.compositeOptions.landsatCFMaskCirrusMasking).toBe('AGGRESSIVE')
        // The submitted model is already projected through toEffectiveModel; revalidating yields no errors.
        expect(validateRecipe('MOSAIC', toEffectiveModel('MOSAIC', submittedModel))).toEqual([])
    })

    it('clarifies when the instruction does not supply an AOI — and no GUI create-recipe call is made', () => {
        const setup = aLiveCreateSetup()
        const harness = aToolFactoryHarness({
            specialist: 'create_recipe',
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":[]}'},
                {text: 'What area should this mosaic cover? Send me a polygon or pick a country/region.'}
            ]
        })

        const result = harness.invoke({recipeType: 'MOSAIC', instruction: 'Create a mosaic', projectId: 'p1', name: 'Kenya'})

        expect(result).toMatchObject({
            ok: false,
            error: {code: 'CLARIFICATION_NEEDED', answer: expect.stringMatching(/what area/i)}
        })
        expect(setup.createCalls).toHaveLength(0)
    })
})

// Live setup: real create_recipe_values tool + GUI handler that records the
// submitted model and echoes a success identity. Returns the submitted model
// for semantic assertions on what reached the GUI.
function aLiveCreateSetup() {
    const createCalls = []
    let submittedModel = null
    const guiRequests = aFakeGuiRequests(request => {
        if (request.action === 'create-recipe') {
            createCalls.push(request)
            submittedModel = request.params.model
            return of({summary: 'created', recipeId: 'r-new', type: request.params.type, name: request.params.name, projectId: request.params.projectId})
        }
        return of({})
    })
    const realTool = createRecipeValuesTool(guiRequests)
    const innerTools = innerToolsImpl(
        {create_recipe_values: (input, ctx) => realTool.invoke$(input, ctx)},
        [{
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
        }]
    )
    return {guiRequests, innerTools, createCalls, getSubmittedModel: () => submittedModel}
}
