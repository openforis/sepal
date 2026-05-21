const {of} = require('rxjs')
const {runSpecialist$} = require('#mcp/chat/specialists/runSpecialist')
const {aFakeLlm, aRecordingBus} = require('../harness')

// runSpecialist$ exposes its canonical loop timeline on the final result so a
// caller (update_recipe) can derive structured outcome from the loop record
// instead of shadowing the same state in a side tracker. The {answer} field
// stays for callers that only surface prose.
describe('runSpecialist$ result', () => {

    const loadCall = {id: 't1', name: 'recipe_load', input: {recipeId: 'r1'}}
    const loadResult = {ok: true, data: {id: 'r1', type: 'MOSAIC'}}
    const loadSchema = {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}}

    function run({replies, invokeTool$ = () => of(loadResult)}) {
        const result = lastValue(runSpecialist$({
            llm: aFakeLlm({replies}),
            bus: aRecordingBus(),
            name: 'recipe.describe',
            systemPrompt: 'sys',
            userText: 'describe r1',
            allowedSchemas: [loadSchema],
            invokeTool$,
            context: {conversationId: 'conv-1'}
        }))
        return result
    }

    it('carries the answer the loop ended on', () => {
        const result = run({replies: [{toolCalls: [loadCall]}, {text: 'A mosaic recipe.'}]})

        expect(result.answer).toBe('A mosaic recipe.')
    })

    it('records each tool call on the timeline with its name, ok, result, and input', () => {
        const result = run({replies: [{toolCalls: [loadCall]}, {text: 'A mosaic recipe.'}]})

        expect(result.timeline).toEqual(expect.arrayContaining([
            {kind: 'tool', name: 'recipe_load', ok: true, result: loadResult, input: {recipeId: 'r1'}}
        ]))
    })

    it('reports why the loop stopped', () => {
        const result = run({replies: [{text: 'Answered without a tool.'}]})

        expect(result.finishReason).toBe('answered')
    })
})

function lastValue(observable) {
    let value
    observable.subscribe({next: emitted => { value = emitted }, error: error => { throw error }})
    return value
}
