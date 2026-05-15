const {of} = require('rxjs')
const {runSpecialist$, SPECIALIST_MAX_ROUNDS} = require('#mcp/chat/specialists/runSpecialist')
const {aFakeLlm, aFakeTracer, read} = require('../builders')

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

        it('keeps the partial assistant text accumulated in the cap-reaching round instead of replacing it with the sentinel', () => {
            const llm = aFakeLlm({replies: [{textChunks: ['Partial progress.'], toolCalls: [toolCall]}]})
            const invokeTool$ = () => of({ok: true, data: {}})

            const result = read(runSpecialist$({
                llm, tracer: aFakeTracer(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(result).toEqual({answer: 'Partial progress.'})
        })
    })

    describe('tool-loop safety', () => {

        it('blocks an identical inner tool call after a prior failure without invoking it again', () => {
            const failingCall = (id) => ({id, name: 'get_context', input: {filter: 'mine'}})
            const llm = aFakeLlm({replies: [
                {toolCalls: [failingCall('a')]},
                {toolCalls: [failingCall('b')]},
                {text: 'Cannot answer.'}
            ]})
            const invocations = []
            const invokeTool$ = call => {
                invocations.push(call)
                return of({ok: false, error: {code: 'TOOL_FAILED', message: 'boom'}})
            }

            const result = read(runSpecialist$({
                llm, tracer: aFakeTracer(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(invocations).toHaveLength(1)
            expect(result).toEqual({answer: 'Cannot answer.'})
        })

        it('bails out of the inner loop after consecutive failures for the same tool name', () => {
            const failingCall = (id, x) => ({id, name: 'get_context', input: {x}})
            const llm = aFakeLlm({replies: [
                {toolCalls: [failingCall('a', 1)]},
                {toolCalls: [failingCall('b', 2)]},
                {toolCalls: [failingCall('c', 3)]},
                {text: 'should not reach'}
            ]})
            const invokeTool$ = () => of({ok: false, error: {code: 'TOOL_FAILED', message: 'boom'}})

            const result = read(runSpecialist$({
                llm, tracer: aFakeTracer(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(llm.receivedMessages).toHaveLength(3)
            expect(result.answer).toMatch(/repeated failures/i)
        })

        it('bails out of the inner loop after repeated INVALID_TOOL_ARGS for the same tool name', () => {
            const llm = aFakeLlm({replies: [
                {toolCalls: [{id: 'a', name: 'get_context', input: {x: 1}}]},
                {toolCalls: [{id: 'b', name: 'get_context', input: {x: 2}}]},
                {toolCalls: [{id: 'c', name: 'get_context', input: {x: 3}}]},
                {text: 'should not reach'}
            ]})
            const invokeTool$ = () => of({ok: false, error: {code: 'INVALID_TOOL_ARGS', message: 'bad'}})

            const result = read(runSpecialist$({
                llm, tracer: aFakeTracer(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(llm.receivedMessages).toHaveLength(3)
            expect(result.answer).toMatch(/invalid args/i)
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
