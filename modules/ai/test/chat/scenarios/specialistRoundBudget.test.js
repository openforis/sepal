const {of} = require('rxjs')
const {aToolFactoryHarness, innerToolsImpl} = require('../harness')
const {SPECIALIST_CAP_ANSWER} = require('#mcp/chat/specialists/runSpecialist')

// The specialist's productive-round budget must not be spent by empty-response
// stalls. A mid-flow stall is a transient hiccup, not real work; charging it
// against the same budget as tool/answer rounds starves recovery (the live
// failure: two stalls pushed the specialist to its cap mid-recovery, returning
// the generic cap string instead of finishing the patch). Pathological
// all-empty loops must still terminate.
describe('specialist round budget separates productive rounds from stalls', () => {

    const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: ['/sources/dataSets/SENTINEL_2']}}
    const prepareResult = {ok: true, data: {baseModelHash: 'h1', focusPaths: ['/sources/dataSets/SENTINEL_2'], dependentPaths: ['/compositeOptions/corrections'], writablePaths: ['/sources/dataSets/SENTINEL_2', '/compositeOptions/corrections'], currentValues: {}, dependencyFacts: [], validationRules: []}}

    function patchCall(id, operations) {
        return {id, name: 'recipe_patch', input: {recipeId: 'r1', baseModelHash: 'h1', operations}}
    }

    const removeSourceOnly = [{op: 'remove', path: '/sources/dataSets/SENTINEL_2'}]
    const removeSourceAndCalibrate = [
        {op: 'remove', path: '/sources/dataSets/SENTINEL_2'},
        {op: 'replace', path: '/compositeOptions/corrections', value: []}
    ]

    it('finishes a stall-interrupted recovery: prepare, stall, failed patch, stall, re-prepare, successful patch', () => {
        const patchResults = [
            {ok: false, error: {code: 'VALIDATION_FAILED', message: 'calibrate requires both source groups', details: [{path: '/compositeOptions/corrections', rule: 'calibrateRequiresMultipleSources', message: 'needs both'}]}},
            {ok: true, data: {summary: 'removed Sentinel-2 and dropped calibration', modelHash: 'h2', invalidatedPaths: []}}
        ]
        let patchIndex = 0
        const innerTools = innerToolsImpl(
            {
                prepare_update: () => of(prepareResult),
                recipe_patch: () => of(patchResults[patchIndex++])
            },
            [
                {name: 'prepare_update', description: 'Prepare.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, focusPaths: {type: 'array', items: {type: 'string'}}}}},
                {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}}
            ]
        )
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools,
            replies: [
                {toolCalls: [prepareCall]},
                {text: ''},
                {toolCalls: [patchCall('tp1', removeSourceOnly)]},
                {text: ''},
                {toolCalls: [prepareCall]},
                {toolCalls: [patchCall('tp2', removeSourceAndCalibrate)]},
                {text: 'Removed Sentinel-2 and dropped cross-sensor calibration.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(result).toEqual({ok: true, data: {answer: 'Removed Sentinel-2 and dropped cross-sensor calibration.'}})
        const patches = innerTools.invocations.filter(call => call.name === 'recipe_patch')
        expect(patches).toHaveLength(2)
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
