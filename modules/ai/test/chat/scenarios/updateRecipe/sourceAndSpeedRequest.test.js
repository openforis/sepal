const {aToolFactoryHarness} = require('../../harness')
const {aFullMosaicModel, aLiveMosaicSetup} = require('./fixtures')
const {toEffectiveModel, validateRecipe} = require('#recipes')

// "Now I only need Landsat. Do other tweaks to speed up rendering too" —
// datasets + render-speed handles flow through update_recipe_values; final
// effective model validates. Also guards that the tool call the LLM submits
// is handle-keyed (no JSON Pointer paths in the model-facing tool input) and
// that no patch operation paths reach an array index.
describe('"Now I only need Landsat. Do other tweaks to speed up rendering too" — datasets + render-speed handles', () => {

    it('updates datasets, corrections, and render-speed handles via update_recipe_values; final effective model validates', () => {
        const setup = aLiveMosaicSetup({model: aFullMosaicModel()})
        const updateCall = {
            id: 'tu1', name: 'update_recipe_values',
            input: {
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['datasets', 'corrections', 'sceneSelection', 'cloudMethods', 'filters', 'compose', 'tileOverlap', 'orbitOverlap', 'cloudBuffer'],
                values: {
                    datasets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']},
                    corrections: ['SR'],
                    cloudMethods: ['sepalCloudScore', 'landsatCFMask'],
                    filters: [],
                    compose: 'MEDIAN',
                    tileOverlap: 'QUICK_REMOVE',
                    orbitOverlap: 'KEEP',
                    cloudBuffer: 0
                }
            }
        }
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["datasets","corrections","sceneSelection","cloudMethods","filters","compose","tileOverlap","orbitOverlap","cloudBuffer"]}'},
                {toolCalls: [updateCall]},
                {text: 'Switched to Landsat only, surface reflectance, median compose, no filters, no cloud buffer.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'Now I only need Landsat. Do other tweaks to speed up rendering too'})

        expect(result.ok).toBe(true)
        const finalModel = setup.getCurrentModel()
        expect(finalModel.sources.dataSets).toEqual({LANDSAT: ['LANDSAT_9', 'LANDSAT_8']})
        expect(finalModel.compositeOptions.corrections).toEqual(['SR'])
        expect(finalModel.compositeOptions.compose).toBe('MEDIAN')
        expect(finalModel.compositeOptions.filters).toEqual([])
        expect(finalModel.compositeOptions.cloudBuffer).toBe(0)
        expect(validateRecipe('MOSAIC', toEffectiveModel('MOSAIC', finalModel))).toEqual([])
        for (const patch of setup.patchCalls) {
            for (const op of patch.params.operations) {
                expect(op.path).not.toMatch(/\/\d+(\/|$)/)
            }
        }
    })

    it('the update_recipe_values input the LLM submits is handle-keyed — no JSON Pointer paths', () => {
        const setup = aLiveMosaicSetup({model: aFullMosaicModel()})
        const updateCall = {
            id: 'tu1', name: 'update_recipe_values',
            input: {
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['datasets', 'corrections', 'sceneSelection'],
                values: {datasets: {LANDSAT: ['LANDSAT_9']}, corrections: ['SR']}
            }
        }
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["datasets"]}'},
                {toolCalls: [updateCall]},
                {text: 'Switched to Landsat only.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        const submitted = setup.innerTools.invocations
            .filter(call => call.name === 'update_recipe_values')
            .map(call => call.input.values)
        expect(submitted).toHaveLength(1)
        for (const key of Object.keys(submitted[0])) {
            expect(key).not.toMatch(/^\//)
        }
        expect(JSON.stringify(submitted[0])).not.toMatch(/\/sources\/dataSets/)
    })
})
