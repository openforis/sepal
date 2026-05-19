const {of} = require('rxjs')
const {createOrchestratorToolRegistry} = require('#mcp/chat/orchestratorToolRegistry')
const {aConversation, aFakeBus, aFakeGuiRequests, aFakeLlm, aFakeTools, run} = require('../builders')

describe('Conversation with specialists', () => {

    it('streams a successful consult_map specialist answer directly to the user (directAnswer bypass — orchestrator does not restate)', () => {
        const consultCall = {id: 'sm1', name: 'consult_map', input: {question: 'why is my map empty?'}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [consultCall]},
            {text: 'orchestrator would restate here but should never be called'}
        ]})
        const tools = aFakeTools(
            {consult_map: ({question}) => of({answer: `[map] ${question}`})},
            [{name: 'consult_map', description: 'd', parameters: {type: 'object'}, directAnswer: true}]
        )
        const conversation = aConversation({llm, tools})

        const {events} = run(conversation.sendUserMessage$('why is my map empty?'))

        expect(tools.invocations).toEqual([consultCall])
        expect(llm.receivedMessages).toHaveLength(1)
        expect(events.filter(event => event.textDelta)).toEqual([{textDelta: '[map] why is my map empty?'}])
    })

    it('streams a successful update_recipe specialist answer directly instead of asking the orchestrator to restate it', () => {
        const updateCall = {id: 'ur1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'set target date'}}
        const specialistAnswer = '\n\nSuccessfully updated the target date.'
        const llm = aFakeLlm({replies: [
            {toolCalls: [updateCall]},
            {text: 'This should not be needed.'}
        ]})
        const tools = aFakeTools(
            {update_recipe: () => of({ok: true, data: {answer: specialistAnswer}})},
            [{name: 'update_recipe', description: 'd', parameters: {type: 'object'}, directAnswer: true}]
        )
        const conversation = aConversation({llm, tools})

        const {events} = run(conversation.sendUserMessage$('set target date'))

        expect(tools.invocations).toEqual([updateCall])
        expect(llm.receivedMessages).toHaveLength(1)
        expect(events.filter(event => event.textDelta)).toEqual([
            {textDelta: 'Successfully updated the target date.'}
        ])
    })

    it('streams a successful describe_recipe specialist answer directly (describe_recipe also opts into directAnswer)', () => {
        const describeCall = {id: 'dr1', name: 'describe_recipe', input: {recipeId: 'r1'}}
        const specialistAnswer = 'MOSAIC recipe with target date 2025-07-02.'
        const llm = aFakeLlm({replies: [
            {toolCalls: [describeCall]},
            {text: 'orchestrator would restate here but should never be called'}
        ]})
        const tools = aFakeTools(
            {describe_recipe: () => of({ok: true, data: {answer: specialistAnswer}})},
            [{name: 'describe_recipe', description: 'd', parameters: {type: 'object'}, directAnswer: true}]
        )
        const conversation = aConversation({llm, tools})

        const {events} = run(conversation.sendUserMessage$('describe my recipe'))

        expect(tools.invocations).toEqual([describeCall])
        expect(llm.receivedMessages).toHaveLength(1)
        expect(events.filter(event => event.textDelta)).toEqual([{textDelta: specialistAnswer}])
    })

    it('does NOT bypass for tools without the directAnswer flag — orchestrator gets a restate round even if data has an answer field', () => {
        const listCall = {id: 'rl1', name: 'recipe_list', input: {}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [listCall]},
            {text: 'You have 2 recipes.'}
        ]})
        const tools = aFakeTools(
            {recipe_list: () => of({ok: true, data: {answer: 'specialist-style prose that should NOT stream verbatim'}})},
            [{name: 'recipe_list', description: 'd', parameters: {type: 'object'}}]
        )
        const conversation = aConversation({llm, tools})

        const {events} = run(conversation.sendUserMessage$('list'))

        expect(llm.receivedMessages).toHaveLength(2)
        expect(events.filter(event => event.textDelta)).toEqual([{textDelta: 'You have 2 recipes.'}])
    })

    it('runs the map specialist inner loop with its scoped map inspection tools', () => {
        const consultCall = {id: 'sm1', name: 'consult_map', input: {question: 'which areas?'}}
        const mapAreaCall = {id: 'ma1', name: 'map_area_list', input: {}}
        const mapAreaSummary = {
            recipeId: 'r1', recipeName: 'Mosaic', recipeType: 'MOSAIC',
            layout: 'single',
            areas: [{area: 'center', sourceId: 'this-recipe', sourceType: 'Recipe', sourceLabel: 'self'}]
        }
        const llm = aFakeLlm({replies: [
            {toolCalls: [consultCall]},
            {toolCalls: [mapAreaCall]},
            {text: 'Single area, this-recipe.'}
        ]})
        const guiRequests = aFakeGuiRequests(() => of(mapAreaSummary))
        const tools = buildTools(llm, guiRequests)
        const conversation = aConversation({llm, tools})
        const toolContext = {channel: {}, conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

        const {events} = run(conversation.sendUserMessage$('which areas?', {toolContext}))

        expect(guiRequests.requests.map(r => r.action)).toEqual(['list-map-areas'])
        // consult_map has directAnswer: true, so the specialist's prose streams verbatim — no orchestrator restate round.
        expect(events.filter(event => event.textDelta)).toEqual([
            {textDelta: 'Single area, this-recipe.'}
        ])
    })

    function buildTools(llm, guiRequests) {
        return createOrchestratorToolRegistry({guiRequests, llm, bus: aFakeBus()})
    }
})
