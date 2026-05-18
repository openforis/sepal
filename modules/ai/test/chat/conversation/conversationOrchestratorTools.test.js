const {of} = require('rxjs')
const {createOrchestratorToolRegistry} = require('#mcp/chat/orchestratorToolRegistry')
const {aConversation, aFakeBus, aFakeGuiRequests, aFakeLlm, run} = require('../builders')

describe('Conversation with the orchestrator tool surface', () => {

    function buildOrchestratorTools({llm, guiRequests}) {
        return createOrchestratorToolRegistry({guiRequests, llm, bus: aFakeBus()})
    }

    it('lets the LLM ask for the current GUI context', () => {
        const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [toolCall]},
            {text: 'You are in the process section.'}
        ]})
        const tools = buildOrchestratorTools({llm, guiRequests: aFakeGuiRequests()})
        const conversation = aConversation({llm, tools})
        const toolContext = {
            channel: {}, conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1',
            guiContext: {section: 'process'}
        }

        run(conversation.sendUserMessage$('where am i?', {toolContext}))

        expect(llm.receivedMessages[1]).toContainEqual({
            role: 'tool',
            toolResults: [{
                toolCallId: 'gc1',
                toolName: 'get_gui_context',
                result: {ok: true, data: {source: 'turn_snapshot', available: true, guiContext: {section: 'process'}}}
            }]
        })
    })

    it('lets the orchestrator describe a recipe through describe_recipe without seeing the raw recipe model', () => {
        const describeCall = {id: 'd1', name: 'describe_recipe', input: {recipeId: 'r1'}}
        const recipeLoadCall = {id: 'rl1', name: 'recipe_load', input: {recipeId: 'r1'}}
        const rawRecipe = {
            id: 'r1', type: 'CLASSIFICATION', title: 'Kenya land cover', modelHash: 'hash-abc',
            model: {classifier: {type: 'RANDOM_FOREST'}}
        }
        const llm = aFakeLlm({replies: [
            {toolCalls: [describeCall]},                   // orchestrator decides to call describe_recipe
            {toolCalls: [recipeLoadCall]},                 // specialist's inner LLM loads the recipe
            {text: 'CLASSIFICATION recipe using a random forest.'}, // specialist's final answer
            {text: 'It is a CLASSIFICATION using random forest.'}   // orchestrator's user-facing reply
        ]})
        const tools = buildOrchestratorTools({llm, guiRequests: aFakeGuiRequests(() => of(rawRecipe))})
        const conversation = aConversation({llm, tools})
        const toolContext = {channel: {}, conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

        run(conversation.sendUserMessage$('describe recipe r1', {toolContext}))

        // The orchestrator and the specialist share the fake LLM, so receivedMessages[]
        // mixes both turn-level conversations. Find the orchestrator's tool turn by
        // tool name rather than by index.
        const describeResult = llm.receivedMessages
            .flatMap(messages => messages.filter(m => m.role === 'tool').flatMap(m => m.toolResults))
            .find(r => r.toolName === 'describe_recipe')

        expect(describeResult).toEqual({
            toolCallId: 'd1', toolName: 'describe_recipe',
            result: {ok: true, data: {answer: 'CLASSIFICATION recipe using a random forest.'}}
        })
    })

    it('does not expose recipe_load directly to the orchestrator', () => {
        const tools = buildOrchestratorTools({llm: aFakeLlm(), guiRequests: aFakeGuiRequests()})

        expect(tools.schemas().map(s => s.name)).not.toContain('recipe_load')
    })
})
