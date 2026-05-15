const {of} = require('rxjs')
const {createToolRegistry} = require('#mcp/chat/tools/registry')
const {productTools} = require('#mcp/chat/tools/productTools')
const {aConversation, aFakeBus, aFakeGuiRequests, aFakeLlm, run} = require('../builders')

describe('Conversation with product tools', () => {

    it('lets the LLM ask for the current GUI context', () => {
        const toolCall = {id: 'gc1', name: 'get_context', input: {}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [toolCall]},
            {text: 'You are in the process section.'}
        ]})
        const tools = createToolRegistry({tools: productTools({guiRequests: aFakeGuiRequests()}), bus: aFakeBus()})
        const conversation = aConversation({llm, tools})
        const toolContext = {
            channel: {}, conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1',
            selection: {section: 'process'}
        }

        run(conversation.sendUserMessage$('where am i?', {toolContext}))

        expect(llm.receivedMessages[1]).toContainEqual({
            role: 'tool',
            toolResults: [{
                toolCallId: 'gc1',
                toolName: 'get_context',
                result: {ok: true, data: {source: 'turn_snapshot', available: true, selection: {section: 'process'}}}
            }]
        })
    })

    it('lets the LLM load a projected recipe model', () => {
        const toolCall = {id: 'rl1', name: 'recipe_load', input: {recipeId: 'r1'}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [toolCall]},
            {text: 'It is a random forest classification.'}
        ]})
        const recipe = {
            id: 'r1', type: 'CLASSIFICATION', title: 'Kenya land cover', modelHash: 'hash-abc',
            model: {classifier: {type: 'RANDOM_FOREST'}}
        }
        const tools = createToolRegistry({tools: productTools({guiRequests: aFakeGuiRequests(() => of(recipe))}), bus: aFakeBus()})
        const conversation = aConversation({llm, tools})
        const toolContext = {channel: {}, conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

        run(conversation.sendUserMessage$('describe recipe r1', {toolContext}))

        expect(llm.receivedMessages[1]).toContainEqual({
            role: 'tool',
            toolResults: [{
                toolCallId: 'rl1',
                toolName: 'recipe_load',
                result: {ok: true, data: {
                    id: 'r1', type: 'CLASSIFICATION', name: 'Kenya land cover', modelHash: 'hash-abc',
                    model: {classifier: {type: 'RANDOM_FOREST'}}
                }}
            }]
        })
    })
})
