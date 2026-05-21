const {of} = require('rxjs')
const {aToolFactoryHarness, aConversationHarness, collect, innerToolsImpl} = require('../../harness')

// A failed update is a directAnswer tool returning ok:false. The validation
// reason must reach the user in the SAME orchestrator round — the live failure
// was the orchestrator going empty then silent on the post-tool restate. The
// failure explanation rides on the envelope and streams straight to the channel.
describe('a failed update_recipe surfaces the validation reason to the user', () => {

    const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: ['/sources/dataSets/SENTINEL_2']}}
    const patchCall = {id: 'tp1', name: 'recipe_patch', input: {recipeId: 'r1', baseModelHash: 'h1', operations: [{op: 'remove', path: '/sources/dataSets/SENTINEL_2'}]}}
    const prepareResult = {ok: true, data: {baseModelHash: 'h1', focusPaths: ['/sources/dataSets/SENTINEL_2'], dependentPaths: ['/compositeOptions/corrections'], writablePaths: ['/sources/dataSets/SENTINEL_2', '/compositeOptions/corrections'], currentValues: {}, dependencyFacts: [], validationRules: []}}
    const patchError = {
        code: 'VALIDATION_FAILED',
        message: 'recipe model failed validation',
        details: [{path: '/compositeOptions/corrections', rule: 'calibrateRequiresMultipleSources', message: 'cross-sensor calibration requires both Landsat and Sentinel-2 source groups'}]
    }
    const updateCall = {id: 'ur1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'use only Landsat'}}

    function aFailingUpdateTool() {
        const innerTools = innerToolsImpl(
            {
                prepare_update: () => of(prepareResult),
                recipe_patch: () => of({ok: false, error: patchError})
            },
            [
                {name: 'prepare_update', description: 'Prepare.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, focusPaths: {type: 'array', items: {type: 'string'}}}}},
                {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}}
            ]
        )
        return aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools,
            replies: [
                {toolCalls: [prepareCall]},
                {toolCalls: [patchCall]},
                {text: 'I attempted the change.'}
            ]
        }).tool
    }

    function aConversationOver(updateTool) {
        return aConversationHarness({
            replies: [
                {toolCalls: [updateCall]},
                {text: 'orchestrator restate that should never run'}
            ],
            tools: [updateTool]
        })
    }

    it('streams the human validation reason to the channel', async () => {
        const conversation = aConversationOver(aFailingUpdateTool())

        const events = await collect(conversation.send$('use only Landsat', {toolContext: {clientId: 'c1', subscriptionId: 's1', conversationId: 'conv-1'}}))

        const text = events.filter(event => event.textDelta).map(event => event.textDelta).join('')
        expect(text).toMatch(/cross-sensor calibration requires both Landsat and Sentinel-2/)
        // The human reason reaches the user; the internal rule name does not.
        expect(text).not.toMatch(/calibrateRequiresMultipleSources/)
    })

    it('reaches the user in one orchestrator round — no restate round', async () => {
        const conversation = aConversationOver(aFailingUpdateTool())

        await collect(conversation.send$('use only Landsat', {toolContext: {clientId: 'c1', subscriptionId: 's1', conversationId: 'conv-1'}}))

        expect(conversation.llm.receivedMessages).toHaveLength(1)
    })
})
