const {of} = require('rxjs')
const {runSpecialist$, SPECIALIST_MAX_ROUNDS} = require('#mcp/chat/specialists/runSpecialist')
const {aFakeLlm, aFakeTracer, read} = require('../sendMessage/builders')

describe('runSpecialist$', () => {

    const allowedSchemas = [{name: 'get_context', description: 'GUI context.', parameters: {type: 'object'}}]

    function noopInvokeTool$() {
        return of({ok: true, data: {}})
    }

    describe('with a direct text reply', () => {

        it('emits the final answer when the inner LLM replies with no tool calls', () => {
            const llm = aFakeLlm({replies: [{text: 'Map is empty.'}]})

            const result = read(runSpecialist$({
                llm, tracer: aFakeTracer(), name: 'map',
                systemPrompt: 'You are the map specialist.',
                userText: 'What is on the map?',
                allowedSchemas,
                invokeTool$: noopInvokeTool$,
                context: {}
            }))

            expect(result).toEqual({answer: 'Map is empty.'})
        })

        it('seeds the inner LLM with [system, user] and offers only the allowed tool schemas', () => {
            const llm = aFakeLlm({replies: [{text: 'ok'}]})

            read(runSpecialist$({
                llm, tracer: aFakeTracer(), name: 'map',
                systemPrompt: 'You are the map specialist.',
                userText: 'What is on the map?',
                allowedSchemas,
                invokeTool$: noopInvokeTool$,
                context: {}
            }))

            expect(llm.receivedMessages[0]).toEqual([
                {role: 'system', content: 'You are the map specialist.'},
                {role: 'user', content: 'What is on the map?'}
            ])
            expect(llm.receivedTools[0]).toEqual(allowedSchemas)
        })
    })

    describe('with one tool round', () => {
        const toolCall = {id: 'gc1', name: 'get_context', input: {}}

        it('invokes the requested tool, feeds the result back, and emits the final answer', () => {
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'No recipe is selected, so the map has no layers.'}
            ]})
            const seenToolCalls = []
            const invokeTool$ = (call, _ctx) => {
                seenToolCalls.push(call)
                return of({ok: true, data: {section: 'process'}})
            }

            const result = read(runSpecialist$({
                llm, tracer: aFakeTracer(), name: 'map',
                systemPrompt: 'You are the map specialist.',
                userText: 'Why is the map empty?',
                allowedSchemas,
                invokeTool$,
                context: {channel: {}, conversationId: 'c1'}
            }))

            expect(seenToolCalls).toEqual([toolCall])
            expect(result).toEqual({answer: 'No recipe is selected, so the map has no layers.'})
            expect(llm.receivedMessages[1]).toEqual([
                {role: 'system', content: 'You are the map specialist.'},
                {role: 'user', content: 'Why is the map empty?'},
                {role: 'assistant', content: '', toolCalls: [toolCall]},
                {role: 'tool', toolResults: [{
                    toolCallId: 'gc1', toolName: 'get_context',
                    result: {ok: true, data: {section: 'process'}}
                }]}
            ])
        })

        it('threads the caller-supplied context to invokeTool$ for every call', () => {
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'done'}
            ]})
            const seenContexts = []
            const invokeTool$ = (_call, ctx) => {
                seenContexts.push(ctx)
                return of({ok: true, data: {}})
            }
            const context = {channel: 'CH', conversationId: 'c1', clientId: 'tab', subscriptionId: 's1'}

            read(runSpecialist$({
                llm, tracer: aFakeTracer(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context
            }))

            expect(seenContexts).toEqual([context])
        })
    })

    describe('when the inner LLM never stops asking for tools', () => {
        const toolCall = {id: 'gc1', name: 'get_context', input: {}}

        it('falls back to the cap sentinel when the inner LLM accumulated only whitespace text before each tool call', () => {
            const llm = aFakeLlm({replies: [{textChunks: ['\n\n'], toolCalls: [toolCall]}]})
            const invokeTool$ = () => of({ok: true, data: {}})

            const result = read(runSpecialist$({
                llm, tracer: aFakeTracer(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(result.answer).toMatch(/specialist/i)
        })

        it('caps the inner loop and still emits an answer', () => {
            const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}]})
            const invokeTool$ = () => of({ok: true, data: {}})

            const result = read(runSpecialist$({
                llm, tracer: aFakeTracer(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(llm.receivedMessages).toHaveLength(SPECIALIST_MAX_ROUNDS)
            expect(result.answer).toMatch(/specialist/i)
        })
    })

    describe('observability', () => {

        it('wraps the specialist run in a tracer span identified by specialist name', () => {
            const tracer = aFakeTracer()
            const llm = aFakeLlm({replies: [{text: 'done'}]})

            read(runSpecialist$({
                llm, tracer, name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$: noopInvokeTool$, context: {}
            }))

            expect(tracer.spans).toEqual(expect.arrayContaining([
                {name: 'specialist.run', attrs: {name: 'map'}}
            ]))
        })
    })
})
