import {of, throwError} from 'rxjs'

import {updateRecipeValuesTool} from '#mcp/chat/specialists/updateRecipe/updateRecipeValuesTool'

import {aConversationHarness, aFakeGuiRequests, AOI_INNER_TOOL_IMPLS, AOI_INNER_TOOL_SCHEMAS, aToolFactoryHarness, collect, innerToolsImpl} from '../../harness.js'
import {aFullMosaicModel} from './fixtures.js'

// A failed update is a directAnswer tool returning ok:false. The validation
// reason must reach the user in the same orchestrator round — falling back
// to an empty post-tool restate was the live regression. The failure
// explanation rides on the envelope and streams straight to the channel.
describe('a failed update_recipe surfaces the validation reason to the user', () => {

    const HUMAN_REASON = 'cross-sensor calibration requires both Landsat and Sentinel-2 source groups'
    const updateCall = {id: 'ur1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'use only Landsat'}}

    function aFailingUpdateTool() {
        const guiRequests = aFakeGuiRequests(request => {
            if (request.action === 'recipe-metadata') return of({id: 'r1', type: 'MOSAIC', name: 'Kenya'})
            if (request.action === 'load-recipe') return of({id: 'r1', type: 'MOSAIC', modelHash: 'h-base', model: aFullMosaicModel()})
            if (request.action === 'recipe-patch') return throwError(() => Object.assign(new Error('recipe model failed validation'), {
                code: 'VALIDATION_FAILED',
                errors: [{path: '/compositeOptions/corrections', rule: 'calibrateRequiresMultipleSources', message: HUMAN_REASON}]
            }))
            return of({})
        })
        const innerTools = innerToolsImpl(
            {
                update_recipe_values: (input, context) => updateRecipeValuesTool(guiRequests).invoke$(input, context),
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
        const updaterCall = {id: 'tu1', name: 'update_recipe_values', input: {
            recipeId: 'r1', baseModelHash: 'h-base',
            writableHandles: ['datasets', 'corrections', 'sceneSelection'],
            values: {datasets: {LANDSAT: ['LANDSAT_9']}}
        }}
        return aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests,
            innerTools,
            replies: [
                {text: '{"handles":["datasets"]}'},
                {toolCalls: [updaterCall]},
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
        expect(text).toMatch(new RegExp(HUMAN_REASON.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        expect(text).not.toMatch(/calibrateRequiresMultipleSources/)
    })

    it('reaches the user in one orchestrator round — no restate round', async () => {
        const conversation = aConversationOver(aFailingUpdateTool())

        await collect(conversation.send$('use only Landsat', {toolContext: {clientId: 'c1', subscriptionId: 's1', conversationId: 'conv-1'}}))

        expect(conversation.llm.receivedMessages).toHaveLength(1)
    })
})
