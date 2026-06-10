import {toEffectiveModel, validateRecipe} from '#recipes'

import {aToolFactoryHarness} from '../../harness.js'
import {aFullMosaicModel, aLiveMosaicSetup} from './fixtures.js'

// "There are still clouds, remove them" — semantic cloud-masking update.
// Exercises picker → prepare → updater end-to-end through the real
// update_recipe_values tool; asserts on the SEMANTIC final model rather than
// patch-op shape, with one load-bearing guard that config arrays are not
// edited by index or removed by value-name path.
describe('"There are still clouds, remove them" — semantic cloud-masking update', () => {

    it('on a mixed-source recipe with SR, a cloud-only update does not touch /compositeOptions/corrections and preserves SR through the projection', () => {
        const setup = aLiveMosaicSetup({model: aFullMosaicModel({compositeOptions: {corrections: ['SR', 'BRDF']}})})
        const updateCall = {
            id: 'tu1', name: 'update_recipe_values',
            input: {
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['sepalCloudScoreMax'],
                values: {sepalCloudScoreMax: 25}
            }
        }
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["sepalCloudScoreMax"]}'},
                {toolCalls: [updateCall]},
                {text: 'Tightened SEPAL Cloud Score.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'There are still clouds, remove them'})

        expect(result.ok).toBe(true)
        for (const patch of setup.patchCalls) {
            for (const op of patch.params.operations) {
                expect(op.path).not.toMatch(/^\/compositeOptions\/corrections/)
            }
        }
        const finalModel = setup.getCurrentModel()
        expect(toEffectiveModel('MOSAIC', finalModel).compositeOptions.corrections).toContain('SR')
    })

    it('strengthens cloud masking via handles, applies a valid effective model, and never patches a config array by index', () => {
        const setup = aLiveMosaicSetup({model: aFullMosaicModel()})
        const updateCall = {
            id: 'tu1', name: 'update_recipe_values',
            input: {
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods', 'sepalCloudScoreMax', 's2CloudScoreBand', 's2CloudScoreMax', 'landsatCloudMask', 'landsatShadowMask', 'landsatCirrusMask'],
                values: {
                    sepalCloudScoreMax: 25,
                    s2CloudScoreBand: 'cs',
                    s2CloudScoreMax: 35,
                    landsatCloudMask: 'AGGRESSIVE',
                    landsatShadowMask: 'AGGRESSIVE',
                    landsatCirrusMask: 'AGGRESSIVE'
                }
            }
        }
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["cloudMethods","sepalCloudScoreMax","s2CloudScoreBand","s2CloudScoreMax","landsatCloudMask","landsatShadowMask","landsatCirrusMask"]}'},
                {toolCalls: [updateCall]},
                {text: 'Strengthened cloud masking across SEPAL, S2 Cloud Score+, and Landsat CFMask.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'There are still clouds, remove them'})

        expect(result.ok).toBe(true)
        const finalModel = setup.getCurrentModel()
        expect(finalModel.compositeOptions.sepalCloudScoreMaxCloudProbability).toBe(25)
        expect(finalModel.compositeOptions.sentinel2CloudScorePlusBand).toBe('cs')
        expect(finalModel.compositeOptions.sentinel2CloudScorePlusMaxCloudProbability).toBe(35)
        expect(finalModel.compositeOptions.landsatCFMaskCloudMasking).toBe('AGGRESSIVE')
        expect(finalModel.compositeOptions.landsatCFMaskCloudShadowMasking).toBe('AGGRESSIVE')
        expect(finalModel.compositeOptions.landsatCFMaskCirrusMasking).toBe('AGGRESSIVE')
        expect(validateRecipe('MOSAIC', toEffectiveModel('MOSAIC', finalModel))).toEqual([])
        for (const patch of setup.patchCalls) {
            for (const op of patch.params.operations) {
                expect(op.path).not.toMatch(/\/compositeOptions\/includedCloudMasking\/\d+/)
                expect(op.op).not.toBe('remove')
            }
        }
    })
})
