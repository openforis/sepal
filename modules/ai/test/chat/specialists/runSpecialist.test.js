import {of} from 'rxjs'

import {createSpecialistRuntime, wasCapped} from '#mcp/chat/specialists/runSpecialist'

import {read} from '../builders.js'
import {aFakeLlm, aRecordingBus} from '../harness.js'

const loadCall = {id: 't1', name: 'recipe_load', input: {recipeId: 'r1'}}
const loadResult = {ok: true, data: {id: 'r1', type: 'MOSAIC'}}
const loadSchema = {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}}

function aConsult({replies, invoke$ = () => of(loadResult), canonicalizeCall} = {}) {
    const llm = aFakeLlm({replies})
    const bus = aRecordingBus()
    const runtime = createSpecialistRuntime({
        llm, bus, name: 'recipe.describe', systemPrompt: 'sys',
        tools: {schemas: [loadSchema], invoke$, canonicalizeCall}
    })
    const result = read(runtime.consult$({userText: 'describe r1', context: {conversationId: 'conv-1'}}))
    return {result, llm, bus}
}

describe('specialist runtime — consult$', () => {

    it('carries the answer the loop ended on', () => {
        const {result} = aConsult({replies: [{toolCalls: [loadCall]}, {text: 'A mosaic recipe.'}]})

        expect(result.answer).toBe('A mosaic recipe.')
    })

    it('records each tool call on the timeline with name, ok, result, and input', () => {
        const {result} = aConsult({replies: [{toolCalls: [loadCall]}, {text: 'A mosaic recipe.'}]})

        expect(result.timeline).toContainEqual({
            kind: 'tool', name: 'recipe_load', ok: true, result: loadResult, input: {recipeId: 'r1'}
        })
    })

    it('reports finishReason=answered when the loop stopped on visible text', () => {
        const {result} = aConsult({replies: [{text: 'Answered without a tool.'}]})

        expect(result.finishReason).toBe('answered')
    })

    it('caps at the stall budget when every round stays silent', () => {
        const {result} = aConsult({replies: [{text: ''}]})

        expect(wasCapped(result)).toBe(true)
    })

    it('records the canonicalised tool input, not the raw model emission', () => {
        const invoked = []
        const {result} = aConsult({
            replies: [{toolCalls: [{...loadCall, input: {recipeId: 'r-bogus'}}]}, {text: 'done.'}],
            canonicalizeCall: toolCall => ({...toolCall, input: {recipeId: 'r1'}}),
            invoke$: toolCall => { invoked.push(toolCall.input); return of(loadResult) }
        })

        expect(invoked).toEqual([{recipeId: 'r1'}])
        expect(result.timeline.find(entry => entry.kind === 'tool').input).toEqual({recipeId: 'r1'})
    })
})

describe('specialist runtime — reasoning across rounds', () => {

    it('rides reasoning forward on the assistant tool-call turn to the next round', () => {
        const {llm} = aConsult({replies: [
            {toolCalls: [loadCall], responseMeta: {reasoning: 'plan to load r1'}},
            {text: 'Done.'}
        ]})

        expect(toolCallTurnIn(llm.receivedMessages[1])).toMatchObject({reasoning: 'plan to load r1'})
    })

    it('omits reasoning on the assistant turn when none was emitted', () => {
        const {llm} = aConsult({replies: [
            {toolCalls: [loadCall], responseMeta: {finishReason: 'tool_calls'}},
            {text: 'Done.'}
        ]})

        expect(toolCallTurnIn(llm.receivedMessages[1])).not.toHaveProperty('reasoning')
    })

    it('appends a silent reasoning carrier on stall so the next round sees the prior thinking', () => {
        const {llm} = aConsult({replies: [
            {text: '', responseMeta: {reasoning: 'thinking out loud'}},
            {text: 'final answer.'}
        ]})

        expect(llm.receivedMessages[1]).toContainEqual(expect.objectContaining({
            role: 'assistant', reasoning: 'thinking out loud'
        }))
    })

    it('does not append a synthetic turn on stall when no reasoning was emitted', () => {
        const {llm} = aConsult({replies: [{text: ''}, {text: 'final answer.'}]})

        expect(llm.receivedMessages[1].filter(message => message.role === 'assistant')).toHaveLength(0)
    })
})

describe('specialist runtime — spans', () => {

    it('wraps inner tool invocation in a specialist.tool.invoke span', () => {
        const {bus} = aConsult({replies: [{toolCalls: [loadCall]}, {text: 'done.'}]})

        expect(bus.spans).toContainEqual({
            name: 'specialist.tool.invoke',
            attrs: {conversationId: 'conv-1', specialist: 'recipe.describe', tool: 'recipe_load'}
        })
    })
})

function toolCallTurnIn(messages) {
    return messages.find(message => message.role === 'assistant' && message.toolCalls)
}
