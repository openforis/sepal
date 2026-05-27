const {of} = require('rxjs')
const {aToolFactoryHarness, innerToolsImpl, AOI_INNER_TOOL_SCHEMAS, AOI_INNER_TOOL_IMPLS} = require('../harness')
const {SPECIALIST_CAP_ANSWER} = require('#mcp/chat/specialists/runSpecialist')

// The specialist's productive-round budget must not be spent by empty-response
// stalls. A mid-flow stall is a transient hiccup, not real work; charging it
// against the same budget as tool/answer rounds starves recovery. Pathological
// all-empty loops must still terminate.
describe('specialist round budget separates productive rounds from stalls', () => {

    function updateCall(id, values) {
        return {id, name: 'update_recipe_values', input: {
            recipeId: 'r1', baseModelHash: 'h-base',
            writableHandles: ['datasets', 'corrections', 'sceneSelection'],
            values
        }}
    }

    it('finishes a stall-interrupted recovery: picker, updater stall, failed update, stall, successful update', () => {
        const updateResults = [
            {ok: false, error: {code: 'VALIDATION_FAILED', message: 'calibrate requires both source groups', handleErrors: [{handle: 'corrections', message: 'needs both'}]}},
            {ok: true, data: {summary: 'removed Sentinel-2 and dropped calibration', modelHash: 'h2', appliedHandles: ['datasets', 'corrections'], invalidatedPaths: []}}
        ]
        let i = 0
        const innerTools = innerToolsImpl(
            {
                update_recipe_values: () => of(updateResults[i++]),
                ...AOI_INNER_TOOL_IMPLS
            },
            [
                {
                    name: 'update_recipe_values',
                    description: 'Update.',
                    parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
                },
                ...AOI_INNER_TOOL_SCHEMAS
            ]
        )
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools,
            replies: [
                {text: '{"handles":["datasets"]}'},
                {text: ''},
                {toolCalls: [updateCall('tu1', {datasets: {LANDSAT: ['LANDSAT_9']}})]},
                {text: ''},
                {toolCalls: [updateCall('tu2', {datasets: {LANDSAT: ['LANDSAT_9']}, corrections: ['SR']})]},
                {text: 'Removed Sentinel-2 and dropped cross-sensor calibration.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(result).toEqual({ok: true, data: {answer: 'Removed Sentinel-2 and dropped cross-sensor calibration.'}})
        const updates = innerTools.invocations.filter(call => call.name === 'update_recipe_values')
        expect(updates).toHaveLength(2)
    })

    it('terminates an only-empty specialist with the cap answer rather than looping forever', () => {
        const harness = aToolFactoryHarness({
            specialist: 'consult_map',
            replies: [{text: ''}]
        })

        const result = harness.invoke({question: 'why is my map empty?'})

        expect(result).toEqual({answer: SPECIALIST_CAP_ANSWER})
    })
})
