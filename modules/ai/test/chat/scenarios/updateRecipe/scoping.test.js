const {aToolFactoryHarness, innerToolsWithSchemas} = require('../../harness')

describe('update_recipe allowed-tool scoping', () => {

    function innerToolsForUpdate() {
        return innerToolsWithSchemas([
            {name: 'prepare_update', description: 'Prepare.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, focusPaths: {type: 'array', items: {type: 'string'}}}}},
            {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {}}},
            {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}},
            {name: 'recipe_list', description: 'List.', parameters: {type: 'object', properties: {}}}
        ])
    }

    it('offers the specialist prepare_update and recipe_patch only (no raw recipe_load, no recipe_list)', () => {
        const harness = aToolFactoryHarness({specialist: 'update_recipe', innerTools: innerToolsForUpdate()})

        harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(harness.llm.receivedTools[0].map(schema => schema.name).sort()).toEqual(['prepare_update', 'recipe_patch'])
    })

    it('routes prepare_update and recipe_patch calls through the inner registry', () => {
        const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: ['/dates/targetDate']}}
        const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
            recipeId: 'r1', baseModelHash: 'h1',
            operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
        }}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [
                {toolCalls: [prepareCall]},
                {toolCalls: [patchCall]},
                {text: 'Done.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'change target date'})

        expect(harness.innerTools.invocations).toEqual([prepareCall, patchCall])
    })

    it('refuses prepare_update and recipe_patch calls for a different recipeId with RECIPE_SCOPE_VIOLATION', () => {
        const wrongPrepare = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r999', focusPaths: ['/dates/targetDate']}}
        const wrongPatch = {id: 'tp1', name: 'recipe_patch', input: {
            recipeId: 'r999', baseModelHash: 'h1', operations: [{op: 'replace', path: '/x', value: 1}]
        }}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [
                {toolCalls: [wrongPrepare, wrongPatch]},
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

    it('refuses raw recipe_load entirely — update specialists must go through prepare_update', () => {
        const recipeLoadCall = {id: 'tl1', name: 'recipe_load', input: {recipeId: 'r1'}}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools: innerToolsForUpdate(),
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
