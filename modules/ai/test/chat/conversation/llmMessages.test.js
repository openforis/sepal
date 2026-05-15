const {messagesForLlm} = require('#mcp/chat/conversation/llmMessages')

describe('LLM message projection', () => {

    it('replays completed tool turns as plain user and assistant dialogue', () => {
        const projectCall = {id: 'p1', name: 'project_list', input: {}}
        const messages = [
            {role: 'user', content: 'list projects'},
            {role: 'assistant', content: ' ', toolCalls: [projectCall]},
            {role: 'tool', toolResults: [{toolCallId: 'p1', toolName: 'project_list', result: {ok: true, data: []}}]},
            {role: 'assistant', content: 'You have 1 project.'},
            {role: 'user', content: 'list recipes'}
        ]

        const {llmMessages} = messagesForLlm({messages})

        expect(llmMessages).toEqual([
            {role: 'user', content: 'list projects'},
            {role: 'assistant', content: 'You have 1 project.'},
            {role: 'user', content: 'list recipes'}
        ])
    })

    it('keeps assistant text from a completed tool-call message and drops only the executable tool call', () => {
        const messages = [
            {role: 'user', content: 'do work'},
            {role: 'assistant', content: 'I will check that.', toolCalls: [{id: 't1', name: 'get_context', input: {}}]},
            {role: 'tool', toolResults: [{toolCallId: 't1', toolName: 'get_context', result: {ok: true, data: {}}}]},
            {role: 'assistant', content: 'Done.'},
            {role: 'user', content: 'what happened?'}
        ]

        const {llmMessages} = messagesForLlm({messages})

        expect(llmMessages).toEqual([
            {role: 'user', content: 'do work'},
            {role: 'assistant', content: 'I will check that.'},
            {role: 'assistant', content: 'Done.'},
            {role: 'user', content: 'what happened?'}
        ])
    })

    it('isolates post-tool rounds to system messages and the active turn', () => {
        const recipeCall = {id: 'r1', name: 'recipe_list', input: {}}
        const messages = [
            {role: 'system', content: 'You are Sepalito.'},
            {role: 'user', content: 'earlier'},
            {role: 'assistant', content: 'earlier reply'},
            {role: 'user', content: 'list recipes'},
            {role: 'assistant', content: '', toolCalls: [recipeCall]},
            {role: 'tool', toolResults: [{toolCallId: 'r1', toolName: 'recipe_list', result: {ok: true, data: []}}]}
        ]

        const {llmMessages} = messagesForLlm({messages, isolateHistory: true})

        expect(llmMessages).toEqual([
            {role: 'system', content: 'You are Sepalito.'},
            {role: 'user', content: 'list recipes'},
            {role: 'assistant', content: '', toolCalls: [recipeCall]},
            {role: 'tool', toolResults: [{toolCallId: 'r1', toolName: 'recipe_list', result: {ok: true, data: []}}]}
        ])
    })

    it('adds runtime context between completed history and the current user message', () => {
        const messages = [
            {role: 'user', content: 'first'},
            {role: 'assistant', content: 'reply'},
            {role: 'user', content: 'second'}
        ]
        const selection = {section: 'process'}

        const {llmMessages} = messagesForLlm({messages, selection, includeTurnContext: true})

        expect(llmMessages).toEqual([
            {role: 'user', content: 'first'},
            {role: 'assistant', content: 'reply'},
            {role: 'system', content: expect.stringContaining('"section":"process"')},
            {role: 'user', content: 'second'}
        ])
    })
})
