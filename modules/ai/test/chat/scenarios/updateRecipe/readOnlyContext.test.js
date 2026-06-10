import {of} from 'rxjs'

import {updateRecipeValuesTool} from '#mcp/chat/specialists/updateRecipe/updateRecipeValuesTool'

import {aFakeGuiRequests} from '../../builders.js'
import {AOI_INNER_TOOL_IMPLS, AOI_INNER_TOOL_SCHEMAS, aToolFactoryHarness, innerToolsImpl} from '../../harness.js'
import {aFullMosaicModel, metadataFor, mosaicMetadata} from './fixtures.js'

// Closes the cloudMethods → corrections → brdfMultiplier detour. When the
// picker selects only cloudMethods, prepare emits corrections + datasets as
// read-only validation context, NOT as writable. brdfMultiplier is not pulled
// in at all (its rule has no writable path to anchor to). The updater can
// still inspect them through readOnlyFields and validationRules, but any
// attempt to write them is rejected by update_recipe_values.
describe('"only cloudMethods picked" — corrections/brdfMultiplier are read-only context', () => {

    function liveSetup() {
        const calls = []
        const guiRequests = aFakeGuiRequests(request => {
            calls.push(request)
            if (request.action === 'recipe-metadata') return of(mosaicMetadata)
            if (request.action === 'load-recipe') return of({id: 'r1', type: 'MOSAIC', modelHash: 'h-base', model: aFullMosaicModel()})
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

    it('rejects an updater write to corrections with HANDLE_OUT_OF_SCOPE when only cloudMethods is picked (corrections is read-only context)', () => {
        const setup = liveSetup()
        // Picker chooses cloudMethods only. Updater tries to set both cloudMethods
        // AND corrections — corrections must be rejected by the tool's scope check.
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["cloudMethods"]}'},
                {toolCalls: [{
                    id: 'tu1', name: 'update_recipe_values',
                    input: {recipeId: 'r1', values: {cloudMethods: ['sepalCloudScore'], corrections: ['SR']}}
                }]},
                {text: 'second attempt'},
                {toolCalls: [{
                    id: 'tu2', name: 'update_recipe_values',
                    input: {recipeId: 'r1', values: {cloudMethods: ['sepalCloudScore']}}
                }]},
                {text: 'Restricted cloud methods to SEPAL Cloud Score.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'remove residual clouds'})

        // The first tool round must have produced a HANDLE_OUT_OF_SCOPE error
        // for corrections — visible on the tool-response bus event.
        const toolResponses = harness.bus.events.filter(event => event.type === 'specialist.tool.response' && event.tool === 'update_recipe_values')
        const firstResponse = toolResponses[0]
        expect(firstResponse.ok).toBe(false)
        expect(firstResponse.errorCode).toBe('HANDLE_OUT_OF_SCOPE')
        expect(firstResponse.errorMessage).toMatch(/corrections/)
    })

    it('rejects an updater write to brdfMultiplier with HANDLE_OUT_OF_SCOPE when only cloudMethods is picked (brdfMultiplier is not pulled in at all)', () => {
        const setup = liveSetup()
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: setup.guiRequests,
            innerTools: setup.innerTools,
            replies: [
                {text: '{"handles":["cloudMethods"]}'},
                {toolCalls: [{
                    id: 'tu1', name: 'update_recipe_values',
                    input: {recipeId: 'r1', values: {cloudMethods: ['sepalCloudScore'], brdfMultiplier: 4}}
                }]},
                {text: 'second attempt'},
                {toolCalls: [{
                    id: 'tu2', name: 'update_recipe_values',
                    input: {recipeId: 'r1', values: {cloudMethods: ['sepalCloudScore']}}
                }]},
                {text: 'Done.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'remove residual clouds'})

        const toolResponses = harness.bus.events.filter(event => event.type === 'specialist.tool.response' && event.tool === 'update_recipe_values')
        const firstResponse = toolResponses[0]
        expect(firstResponse.ok).toBe(false)
        expect(firstResponse.errorCode).toBe('HANDLE_OUT_OF_SCOPE')
        expect(firstResponse.errorMessage).toMatch(/brdfMultiplier/)
    })

    it('still includes the cloud-mask availability rule in validationRules with handle names cloudMethods/datasets/corrections', () => {
        const setup = liveSetup()
        const updaterUserMessages = []
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: metadataFor(mosaicMetadata),
            replies: [
                {text: '{"handles":["cloudMethods"]}'},
                {text: 'ok'}
            ]
        })
        harness.invoke({recipeId: 'r1', instruction: 'remove residual clouds'})

        // The updater user message carries the prepared packet as JSON; the
        // validationRules block is part of that.
        const updaterMessages = harness.llm.receivedMessages[1]
        const userMessage = updaterMessages[updaterMessages.length - 1]
        const packet = JSON.parse(userMessage.content.split('Prepared packet:\n')[1])
        const rule = packet.validationRules.find(r => r.name === 'cloudMaskingMethodAvailability')
        expect(rule.handles.sort()).toEqual(['cloudMethods', 'corrections', 'datasets'])
        expect(updaterUserMessages.length).toBe(0)  // suppress unused-var lint via reference
    })
})
