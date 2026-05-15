const {of} = require('rxjs')
const {createToolRegistry} = require('#mcp/chat/tools/registry')
const {productTools} = require('#mcp/chat/tools/productTools')
const {specialistTools} = require('#mcp/chat/specialists/specialistTools')
const {aConversation, aFakeBus, aFakeGuiRequests, aFakeLlm, aFakeTools, aFakeTracer, run} = require('../builders')

describe('Conversation with specialists', () => {

    it('lets the LLM delegate a map question and answer from the specialist result', () => {
        const consultCall = {id: 'sm1', name: 'consult_map', input: {question: 'why is my map empty?'}}
        const specialistAnswer = 'No recipe is selected, so the map has no layers.'
        const llm = aFakeLlm({replies: [
            {toolCalls: [consultCall]},
            {text: specialistAnswer}
        ]})
        const tools = aFakeTools({
            consult_map: ({question}) => of({answer: `[map] ${question}`})
        })
        const conversation = aConversation({llm, tools})

        const {events} = run(conversation.sendUserMessage$('why is my map empty?'))

        expect(tools.invocations).toEqual([consultCall])
        expect(llm.receivedMessages[1]).toContainEqual({
            role: 'tool',
            toolResults: [{
                toolCallId: consultCall.id, toolName: consultCall.name,
                result: {ok: true, data: {answer: '[map] why is my map empty?'}}
            }]
        })
        expect(events.filter(event => event.textDelta)).toEqual([{textDelta: specialistAnswer}])
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
            {text: 'Single area, this-recipe.'},
            {text: 'You have one map area showing this recipe.'}
        ]})
        const guiRequests = aFakeGuiRequests(() => of(mapAreaSummary))
        const tools = buildTools(llm, guiRequests)
        const conversation = aConversation({llm, tools})
        const toolContext = {channel: {}, conversationId: 'conv1', clientId: 'c1', subscriptionId: 's1'}

        const {events} = run(conversation.sendUserMessage$('which areas?', {toolContext}))

        expect(guiRequests.requests.map(r => r.action)).toEqual(['list-map-areas'])
        expect(events.filter(event => event.textDelta)).toEqual([
            {textDelta: 'You have one map area showing this recipe.'}
        ])
    })

    function buildTools(llm, guiRequests) {
        const innerToolList = productTools({guiRequests})
        const innerTools = createToolRegistry({tools: innerToolList, bus: aFakeBus()})
        const specialistList = specialistTools({llm, tracer: aFakeTracer(), bus: aFakeBus(), innerTools})
        return createToolRegistry({tools: [...innerToolList, ...specialistList], bus: aFakeBus()})
    }
})
