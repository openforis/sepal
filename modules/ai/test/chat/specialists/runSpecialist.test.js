const {of} = require('rxjs')
const {createSpecialistRuntime, wasCapped} = require('#mcp/chat/specialists/runSpecialist')
const {aFakeLlm, aRecordingBus} = require('../harness')
const {read} = require('../builders')

describe('createSpecialistRuntime — construction + consult$', () => {

    const loadCall = {id: 't1', name: 'recipe_load', input: {recipeId: 'r1'}}
    const loadResult = {ok: true, data: {id: 'r1', type: 'MOSAIC'}}
    const loadSchema = {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}}

    function consult({replies, invoke$ = () => of(loadResult), canonicalizeCall, context = {conversationId: 'conv-1'}}) {
        const runtime = createSpecialistRuntime({
            llm: aFakeLlm({replies}),
            bus: aRecordingBus(),
            name: 'recipe.describe',
            systemPrompt: 'sys',
            tools: {schemas: [loadSchema], invoke$, canonicalizeCall}
        })
        return read(runtime.consult$({userText: 'describe r1', context}))
    }

    it('carries the answer the loop ended on', () => {
        const result = consult({replies: [{toolCalls: [loadCall]}, {text: 'A mosaic recipe.'}]})

        expect(result.answer).toBe('A mosaic recipe.')
    })

    it('records each tool call on the timeline with its name, ok, result, and input', () => {
        const result = consult({replies: [{toolCalls: [loadCall]}, {text: 'A mosaic recipe.'}]})

        expect(result.timeline).toEqual(expect.arrayContaining([
            {kind: 'tool', name: 'recipe_load', ok: true, result: loadResult, input: {recipeId: 'r1'}}
        ]))
    })

    it('reports why the loop stopped', () => {
        const result = consult({replies: [{text: 'Answered without a tool.'}]})

        expect(result.finishReason).toBe('answered')
    })

    it('wasCapped is true when the loop terminated at the round/stall cap', () => {
        const result = consult({replies: [{text: ''}]})

        expect(result.finishReason).toBe('capped')
        expect(wasCapped(result)).toBe(true)
    })

    it('records the canonicalized tool input on the timeline, not the raw model emission', () => {
        const seen = []
        const result = consult({
            replies: [{toolCalls: [{...loadCall, input: {recipeId: 'r-bogus'}}]}, {text: 'done.'}],
            canonicalizeCall: toolCall => ({...toolCall, input: {recipeId: 'r1'}}),
            invoke$: toolCall => { seen.push(toolCall.input); return of(loadResult) }
        })

        expect(seen).toEqual([{recipeId: 'r1'}])
        const toolEntry = result.timeline.find(entry => entry.kind === 'tool')
        expect(toolEntry.input).toEqual({recipeId: 'r1'})
    })

    it('wraps inner tool invocation in a specialist.tool.invoke span', () => {
        const bus = aSpanRecordingBus()
        const runtime = createSpecialistRuntime({
            llm: aFakeLlm({replies: [{toolCalls: [loadCall]}, {text: 'done.'}]}),
            bus,
            name: 'recipe.describe',
            systemPrompt: 'sys',
            tools: {schemas: [loadSchema], invoke$: () => of(loadResult)}
        })

        read(runtime.consult$({userText: 'describe r1', context: {conversationId: 'conv-1'}}))

        expect(bus.spans).toContainEqual({
            name: 'specialist.tool.invoke',
            attrs: {conversationId: 'conv-1', specialist: 'recipe.describe', tool: 'recipe_load'}
        })
    })
})

function aSpanRecordingBus() {
    const spans = []
    return {
        spans,
        publish() {},
        track$(name, attrs, work$) {
            spans.push({name, attrs})
            return work$
        }
    }
}
