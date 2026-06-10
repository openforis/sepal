import {toEffectiveModel, validateRecipe} from '#recipes'

import {aToolFactoryHarness} from '../../harness.js'
import {aFullMosaicModel, aLiveMosaicSetup} from './fixtures.js'

// Deterministic application smoke test for a selector-item swap. The picker
// and updater replies are scripted, so this does NOT prove the model picks
// the right item or profile — that contract lives in:
//   - prepareHandlePacket.test.js (selector-companion expansion, allowedItems metadata)
//   - promptAssembly.test.js      (updater prompt teaches the selector rules)
//   - handles.test.js             (alternativeGroup + companionHandles + profiles data)
// What this test pins is that a handle-keyed write of cloudMethods plus its
// Cloud Score+ companions, against a recipe whose writable set was eagerly
// expanded by the selector-companion mechanism, lands as a valid effective
// model. Removing the eager expansion (v1 trade-off: any rich selector exposes
// every item's companions to the updater) would make the update_recipe_values
// call reject s2CloudScoreBand / s2CloudScoreMax as out-of-scope writes.
describe('selector-item swap — deterministic application smoke test', () => {

    it('applies a Cloud Score+ swap whose companion writes only succeed because selector-companion expansion exposed them', () => {
        const setup = aLiveMosaicSetup({model: aFullMosaicModel({
            compositeOptions: {
                includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudProbability'],
                sentinel2CloudProbabilityMaxCloudProbability: 40
            }
        })})
        const updateCall = {
            id: 'tu1', name: 'update_recipe_values',
            input: {
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods', 's2CloudScoreBand', 's2CloudScoreMax'],
                values: {
                    cloudMethods: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
                    s2CloudScoreBand: 'cs_cdf',
                    s2CloudScoreMax: 45
                }
            }
        }
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["cloudMethods"]}'},
                {toolCalls: [updateCall]},
                {text: 'Swapped Sentinel-2 Cloud Probability for Sentinel-2 Cloud Score+; kept SEPAL Cloud Score and Landsat CFMask.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'Use Cloud Score+ instead'})

        expect(result.ok).toBe(true)
        const effectiveModel = toEffectiveModel('MOSAIC', setup.getCurrentModel())
        expect(effectiveModel.compositeOptions.includedCloudMasking).toEqual(['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'])
        expect(effectiveModel.compositeOptions.sentinel2CloudScorePlusBand).toBe('cs_cdf')
        expect(effectiveModel.compositeOptions.sentinel2CloudScorePlusMaxCloudProbability).toBe(45)
        expect(effectiveModel.compositeOptions).not.toHaveProperty('sentinel2CloudProbabilityMaxCloudProbability')
        expect(validateRecipe('MOSAIC', effectiveModel)).toEqual([])
    })
})
