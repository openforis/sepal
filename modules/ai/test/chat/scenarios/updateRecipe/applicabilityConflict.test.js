import {toEffectiveModel, validateRecipe} from '#sepal/recipes'

import {aToolFactoryHarness} from '../../harness.js'
import {aFullMosaicModel, aLiveMosaicSetup} from './fixtures.js'

// Two faces of the prerequisite-handle contract for a selector item the user
// asked to add/switch to:
//   (a) Picker did NOT include the prerequisite handle ("Use Cloud Score+
//       instead" on a Landsat-only recipe) — a scripted updater that tries the
//       inapplicable item anyway is rejected in handle terms, not paths.
//   (b) Picker DID include the prerequisite handle ("Use Sentinel-2 and Cloud
//       Score+") — both handles are writable and the updater applies them
//       together to a valid effective model.
describe('Cloud Score+ on a Landsat-only recipe — prerequisite-handle routing', () => {

    it('rejects an inapplicable item with handle-keyed feedback when the prerequisite handle is not in scope', () => {
        const setup = aLiveMosaicSetup({model: aLandsatOnlyMosaicModel(), validate: true})
        const updateCall = anInapplicableCloudScorePlusCall()
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["cloudMethods"]}'},
                {toolCalls: [updateCall]},
                {text: 'Cannot apply Cloud Score+ without Sentinel-2 in datasets.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'Use Cloud Score+ instead'})

        const error = toolEnvelopeFor(harness, updateCall.id).error
        expect(error.code).toBe('APPLICABILITY_VIOLATION')
        expect(error.handleErrors.map(handleError => handleError.handle)).toContain('cloudMethods')
        expect(error).not.toHaveProperty('errors')
        expect(JSON.stringify(error)).not.toMatch(/\/(compositeOptions|sources)\//)
    })

    it('returns CLARIFICATION_NEEDED carrying the updater question verbatim when the updater asks instead of submitting an inapplicable item', () => {
        const setup = aLiveMosaicSetup({model: aLandsatOnlyMosaicModel(), validate: true})
        const clarificationText = 'Cloud Score+ only applies to Sentinel-2. Do you want to add Sentinel-2 to this recipe?'
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["cloudMethods"]}'},
                {text: clarificationText}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'Use Cloud Score+ instead'})

        expect(result).toMatchObject({
            ok: false,
            error: {code: 'CLARIFICATION_NEEDED', answer: clarificationText}
        })
        expect(setup.patchCalls).toEqual([])
    })

    it('applies datasets + cloudMethods together when the picker put both in scope, leaving the recipe valid', () => {
        const setup = aLiveMosaicSetup({model: aLandsatOnlyMosaicModel(), validate: true})
        const updateCall = aCombinedSentinel2AndCloudScorePlusCall()
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["datasets","cloudMethods"]}'},
                {toolCalls: [updateCall]},
                {text: 'Added Sentinel-2 and switched to Cloud Score+.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'Use Sentinel-2 and Cloud Score+'})

        expect(result.ok).toBe(true)
        const finalModel = toEffectiveModel('MOSAIC', setup.getCurrentModel())
        expect(finalModel.sources.dataSets).toEqual({LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']})
        expect(finalModel.compositeOptions.includedCloudMasking).toContain('sentinel2CloudScorePlus')
        expect(validateRecipe('MOSAIC', finalModel)).toEqual([])
    })
})

function aLandsatOnlyMosaicModel() {
    const model = aFullMosaicModel()
    model.sources.dataSets = {LANDSAT: ['LANDSAT_9']}
    model.compositeOptions.corrections = ['SR']
    model.compositeOptions.includedCloudMasking = ['sepalCloudScore', 'landsatCFMask']
    delete model.compositeOptions.sentinel2CloudScorePlusBand
    delete model.compositeOptions.sentinel2CloudScorePlusMaxCloudProbability
    return model
}

function anInapplicableCloudScorePlusCall() {
    return {
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
}

function aCombinedSentinel2AndCloudScorePlusCall() {
    return {
        id: 'tu1', name: 'update_recipe_values',
        input: {
            recipeId: 'r1', baseModelHash: 'h-base',
            writableHandles: ['datasets', 'cloudMethods', 'corrections', 's2CloudScoreBand', 's2CloudScoreMax'],
            values: {
                datasets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']},
                cloudMethods: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
                corrections: ['CALIBRATE'],
                s2CloudScoreBand: 'cs_cdf',
                s2CloudScoreMax: 45
            }
        }
    }
}

function toolEnvelopeFor(harness, toolCallId) {
    for (const messages of harness.llm.receivedMessages) {
        const toolMessage = messages.find(message => message.role === 'tool')
        if (!toolMessage) continue
        const result = toolMessage.toolResults.find(entry => entry.toolCallId === toolCallId)
        if (result) return result.result
    }
    throw new Error(`no tool result captured for ${toolCallId}`)
}
