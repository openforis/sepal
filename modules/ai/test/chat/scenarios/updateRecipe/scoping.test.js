const {aToolFactoryHarness, innerToolsWithSchemas} = require('../../harness')

describe('update_recipe allowed-tool scoping', () => {

    it('offers the specialist load_for_update and recipe_patch only (no raw recipe_load, no recipe_list)', () => {
        const innerTools = innerToolsWithSchemas([
            {name: 'load_for_update', description: 'Closure.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}}},
            {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {}}},
            {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}},
            {name: 'recipe_list', description: 'List.', parameters: {type: 'object', properties: {}}}
        ])
        const harness = aToolFactoryHarness({specialist: 'update_recipe', innerTools})

        harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(harness.llm.receivedTools[0].map(schema => schema.name).sort()).toEqual(['load_for_update', 'recipe_patch'])
    })

    it('routes load_for_update and recipe_patch calls through the inner registry', () => {
        const loadCall = {id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'change target date'}}
        const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
            recipeId: 'r1', baseModelHash: 'h1',
            operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
        }}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [
                {toolCalls: [loadCall]},
                {toolCalls: [patchCall]},
                {text: 'Done.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'change target date'})

        expect(harness.innerTools.invocations).toEqual([loadCall, patchCall])
    })

    it('refuses recipe_patch and load_for_update calls for a different recipeId with RECIPE_SCOPE_VIOLATION', () => {
        const wrongPatch = {id: 'tp1', name: 'recipe_patch', input: {
            recipeId: 'r999', baseModelHash: 'h1', operations: [{op: 'replace', path: '/x', value: 1}]
        }}
        const wrongLoad = {id: 'tl1', name: 'load_for_update', input: {recipeId: 'r999', instruction: 'edit'}}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [
                {toolCalls: [wrongPatch, wrongLoad]},
                {text: 'cannot edit.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(harness.innerTools.invocations).toEqual([])
        const toolResults = harness.llm.receivedMessages[1].find(message => message.role === 'tool').toolResults
        expect(toolResults.map(result => result.result.error.code)).toEqual([
            'RECIPE_SCOPE_VIOLATION', 'RECIPE_SCOPE_VIOLATION'
        ])
        expect(toolResults[0].result.error.message).toContain('r999')
    })

    it('refuses raw recipe_load entirely — update specialists must go through load_for_update', () => {
        const recipeLoadCall = {id: 'tl1', name: 'recipe_load', input: {recipeId: 'r1'}}
        const innerTools = innerToolsWithSchemas([
            {name: 'load_for_update', description: 'Closure.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}}},
            {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {}}},
            {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}}
        ])
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools,
            replies: [
                {toolCalls: [recipeLoadCall]},
                {text: 'blocked.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(harness.innerTools.invocations).toEqual([])
        const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
        expect(toolMessage.toolResults[0].result.error.code).toBe('TOOL_NOT_ALLOWED')
    })
})
