const {of} = require('rxjs')
const {aConversation, aFakeHistory, aFakeLlm, aFakeTools, run} = require('../builders')

describe('Conversation list-tool drift regression', () => {
    const projectCall = {id: 'pc', name: 'project_list', input: {}}
    const recipeCall = {id: 'rc', name: 'recipe_list', input: {}}
    const recipeResult = {ok: true, data: {recipes: [{id: 'r1', name: 'Mosaic'}]}}
    const listSchemas = [
        {name: 'recipe_list', description: 'r', parameters: {type: 'object'}},
        {name: 'project_list', description: 'p', parameters: {type: 'object'}}
    ]

    let llm, tools, history, conversation

    beforeEach(() => {
        llm = aFakeLlm({replies: [
            {toolCalls: [projectCall]},
            {text: 'You have 1 project.'},
            {toolCalls: [recipeCall]},
            {text: 'You have 1 recipe.'}
        ]})
        tools = aFakeTools({
            project_list: () => of({projects: [{id: 'p1', name: 'Kenya'}]}),
            recipe_list: () => of({recipes: [{id: 'r1', name: 'Mosaic'}]})
        }, listSchemas)
        history = aFakeHistory()
        conversation = aConversation({llm, tools, history})
    })

    it('does not let a completed project-list turn drift the next recipe-list request back to projects', () => {
        run(conversation.sendUserMessage$('list my projects'))
        run(conversation.sendUserMessage$('list my recipes'))

        expect(tools.invocations).toEqual([projectCall, recipeCall])
        expect(llm.receivedMessages[2]).toEqual([
            {role: 'user', content: 'list my projects'},
            {role: 'assistant', content: 'You have 1 project.'},
            {role: 'user', content: 'list my recipes'}
        ])
        expect(llm.receivedMessages[3]).toEqual([
            {role: 'user', content: 'list my recipes'},
            {role: 'assistant', content: '', toolCalls: [recipeCall]},
            {role: 'tool', toolResults: [{toolCallId: recipeCall.id, toolName: recipeCall.name, result: recipeResult}]}
        ])
        expect(llm.receivedTools[3].map(schema => schema.name)).toEqual(['recipe_list', 'project_list'])
        expect(history.appended).toEqual([
            {role: 'user', content: 'list my projects'},
            {role: 'assistant', content: '', toolCalls: [projectCall]},
            {role: 'tool', toolResults: [{toolCallId: projectCall.id, toolName: projectCall.name, result: {ok: true, data: {projects: [{id: 'p1', name: 'Kenya'}]}}}]},
            {role: 'assistant', content: 'You have 1 project.'},
            {role: 'user', content: 'list my recipes'},
            {role: 'assistant', content: '', toolCalls: [recipeCall]},
            {role: 'tool', toolResults: [{toolCallId: recipeCall.id, toolName: recipeCall.name, result: recipeResult}]},
            {role: 'assistant', content: 'You have 1 recipe.'}
        ])
    })
})
