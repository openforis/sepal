import {of} from 'rxjs'

import {updateRecipeValuesTool} from '#mcp/chat/specialists/updateRecipe/updateRecipeValuesTool'

import {aFakeGuiRequests} from '../../builders.js'
import {AOI_INNER_TOOL_IMPLS, AOI_INNER_TOOL_SCHEMAS, aToolFactoryHarness, innerToolsImpl} from '../../harness.js'
import {mosaicMetadata} from './fixtures.js'

// "It's still too cloudy" shape, post-prepare. The picker selected
// s2CloudProbabilityMax (among other cloud handles). The recipe's
// cloudMethods doesn't include sentinel2CloudProbability, so the companion
// is inactive — projection would silently strip s2CloudProbabilityMax and the
// summary would lie about Cloud Probability being enabled. The runtime
// guard catches this before any GUI patch and surfaces an INACTIVE_VALUE
// handle-keyed error so the updater can correct (omit, or activate the
// item in the same call).
describe('cloudy-update shape — picked s2CloudProbabilityMax with cloudMethods read-only', () => {

    function recipeWithoutSentinel2Probability() {
        return {
            id: 'r1', type: 'MOSAIC', modelHash: 'h-base',
            model: {
                dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2024-01-01', seasonEnd: '2025-01-01', yearsBefore: 0, yearsAfter: 0},
                sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}},
                sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
                compositeOptions: {
                    corrections: ['CALIBRATE', 'BRDF'], brdfMultiplier: 4, filters: [],
                    orbitOverlap: 'KEEP', tileOverlap: 'QUICK_REMOVE',
                    includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
                    landsatCFMaskCloudMasking: 'MODERATE',
                    landsatCFMaskCloudShadowMasking: 'MODERATE',
                    landsatCFMaskCirrusMasking: 'MODERATE',
                    landsatCFMaskDilatedCloud: 'REMOVE',
                    sepalCloudScoreMaxCloudProbability: 30,
                    sentinel2CloudScorePlusBand: 'cs_cdf',
                    sentinel2CloudScorePlusMaxCloudProbability: 45,
                    cloudBuffer: 0, holes: 'ALLOW', snowMasking: 'ON', compose: 'MEDOID'
                },
                aoi: {type: 'POLYGON', path: [[36.7, -1.4], [36.8, -1.4], [36.8, -1.3]]}
            }
        }
    }

    function liveSetup() {
        const calls = []
        const guiRequests = aFakeGuiRequests(request => {
            calls.push(request)
            if (request.action === 'recipe-metadata') return of(mosaicMetadata)
            if (request.action === 'load-recipe') return of(recipeWithoutSentinel2Probability())
            if (request.action === 'recipe-patch') return of({summary: 'ok', modelHash: 'h-next', invalidatedPaths: []})
            return of({})
        })
        const realTool = updateRecipeValuesTool(guiRequests)
        const innerTools = innerToolsImpl(
            {
                update_recipe_values: (input, ctx) => realTool.invoke$(input, ctx),
                ...AOI_INNER_TOOL_IMPLS
            },
            [
                {
                    name: 'update_recipe_values', description: 'Update.',
                    parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
                },
                ...AOI_INNER_TOOL_SCHEMAS
            ]
        )
        return {guiRequests, innerTools, calls}
    }

    it('rejects an updater write to s2CloudProbabilityMax with INACTIVE_VALUE — cloudMethods is read-only here so the companion can never activate', () => {
        const setup = liveSetup()
        // Picker selects only s2CloudProbabilityMax. cloudMethods is pulled
        // in as read-only context by the schema constraint. Updater tries to
        // set s2CloudProbabilityMax=30 alone — projection strips it.
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["s2CloudProbabilityMax"]}'},
                {toolCalls: [{
                    id: 'tu1', name: 'update_recipe_values',
                    input: {recipeId: 'r1', values: {s2CloudProbabilityMax: 30}}
                }]},
                {text: 'Cloud Probability requires Sentinel-2 Cloud Probability to be active; ask to enable that method first.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'tighten cloud probability'})

        const toolResponses = harness.bus.events.filter(event => event.type === 'specialist.tool.response' && event.tool === 'update_recipe_values')
        const first = toolResponses[0]
        expect(first.ok).toBe(false)
        expect(first.errorCode).toBe('INACTIVE_VALUE')
        expect(first.errorMessage).toMatch(/inactive/i)
        // No GUI patch attempted.
        expect(setup.calls.find(call => call.action === 'recipe-patch')).toBeUndefined()
    })
})
