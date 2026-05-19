const {concat, of} = require('rxjs')
const {runSpecialist$, SPECIALIST_MAX_ROUNDS} = require('#mcp/chat/specialists/runSpecialist')
const {emitChannel, guiAction} = require('#mcp/chat/channelEvents')
const {aFakeLlm, aFakeBus, read, run} = require('../builders')

describe('runSpecialist$', () => {

    const allowedSchemas = [{name: 'get_gui_context', description: 'GUI context.', parameters: {type: 'object'}}]

    function noopInvokeTool$() {
        return of({ok: true, data: {}})
    }

    describe('with a direct text reply', () => {

        it('emits the final answer when the inner LLM replies with no tool calls', () => {
            const llm = aFakeLlm({replies: [{text: 'Map is empty.'}]})

            const result = read(runSpecialist$({
                llm, bus: aFakeBus(), name: 'map',
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
                llm, bus: aFakeBus(), name: 'map',
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
        const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}

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
                llm, bus: aFakeBus(), name: 'map',
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
                    toolCallId: 'gc1', toolName: 'get_gui_context',
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
                llm, bus: aFakeBus(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context
            }))

            expect(seenContexts).toEqual([context])
        })
    })

    describe('when the inner LLM never stops asking for tools', () => {
        const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}

        it('falls back to the cap sentinel when the inner LLM accumulated only whitespace text before each tool call', () => {
            const llm = aFakeLlm({replies: [{textChunks: ['\n\n'], toolCalls: [toolCall]}]})
            const invokeTool$ = () => of({ok: true, data: {}})

            const result = read(runSpecialist$({
                llm, bus: aFakeBus(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(result.answer).toMatch(/specialist/i)
        })

        it('caps the inner loop and still emits an answer', () => {
            const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}]})
            const invokeTool$ = () => of({ok: true, data: {}})

            const result = read(runSpecialist$({
                llm, bus: aFakeBus(), name: 'map',
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
                llm, bus: aFakeBus(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(result).toEqual({answer: 'Partial progress.'})
        })
    })

    describe('stall recovery — archive-style nudge on empty inner response', () => {

        it('retries once with a transient user-role nudge appended to the prompt when the inner LLM produced no text and no tool calls', () => {
            const llm = aFakeLlm({replies: [
                {text: ''},
                {text: 'Recovered.'}
            ]})

            const result = read(runSpecialist$({
                llm, bus: aFakeBus(), name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas,
                invokeTool$: noopInvokeTool$,
                context: {conversationId: 'c1'}
            }))

            expect(result).toEqual({answer: 'Recovered.'})
            expect(llm.receivedMessages[0]).toEqual([
                {role: 'system', content: 'p'},
                {role: 'user', content: 'q'}
            ])
            expect(llm.receivedMessages[1]).toEqual([
                {role: 'system', content: 'p'},
                {role: 'user', content: 'q'},
                {role: 'user', content: expect.stringMatching(/Continue working on the original request.*next tool call.*final summary.*fulfilled/i)}
            ])
        })

        it('keeps the scoped tools available on the recovery round so the LLM can emit a tool call instead of more text', () => {
            const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}
            const llm = aFakeLlm({replies: [
                {text: ''},
                {toolCalls: [toolCall]},
                {text: 'Done.'}
            ]})
            const invocations = []
            const invokeTool$ = call => {
                invocations.push(call)
                return of({ok: true, data: {section: 'process'}})
            }

            const result = read(runSpecialist$({
                llm, bus: aFakeBus(), name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {conversationId: 'c1'}
            }))

            expect(invocations).toEqual([toolCall])
            expect(result).toEqual({answer: 'Done.'})
            expect(llm.receivedTools[1]).toEqual(allowedSchemas)
        })

        it('terminates the inner loop with empty answer when the recovery round is also empty (no infinite nudge loop)', () => {
            const llm = aFakeLlm({replies: [
                {text: ''},
                {text: ''}
            ]})

            const result = read(runSpecialist$({
                llm, bus: aFakeBus(), name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$: noopInvokeTool$,
                context: {conversationId: 'c1'}
            }))

            expect(result).toEqual({answer: ''})
            expect(llm.receivedMessages).toHaveLength(2)
        })

        it('does not persist the nudge into post-tool-round message history (it is transient for the recovery round only)', () => {
            const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}
            const llm = aFakeLlm({replies: [
                {text: ''},                  // round 0: stall
                {toolCalls: [toolCall]},     // round 1 (recovery): tool call emitted
                {text: 'Done.'}              // round 2: final
            ]})

            read(runSpecialist$({
                llm, bus: aFakeBus(), name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas,
                invokeTool$: () => of({ok: true, data: {section: 'process'}}),
                context: {conversationId: 'c1'}
            }))

            const postToolMessages = llm.receivedMessages[2]
            expect(postToolMessages.filter(m => /Continue working/.test(m.content || ''))).toEqual([])
            expect(postToolMessages).toEqual([
                {role: 'system', content: 'p'},
                {role: 'user', content: 'q'},
                {role: 'assistant', content: '', toolCalls: [toolCall]},
                {role: 'tool', toolResults: [{toolCallId: 'gc1', toolName: 'get_gui_context', result: {ok: true, data: {section: 'process'}}}]}
            ])
        })

        it('publishes specialist.stall (warn) carrying name, round, conversationId, stallCount, messageCount, toolNames', () => {
            const bus = aFakeBus()
            const llm = aFakeLlm({replies: [
                {text: ''},
                {text: 'Recovered.'}
            ]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$: noopInvokeTool$,
                context: {conversationId: 'c1'}
            }))

            const stalls = bus.published.filter(e => e.type === 'specialist.stall')
            expect(stalls).toHaveLength(1)
            expect(stalls[0]).toMatchObject({
                type: 'specialist.stall',
                level: 'warn',
                conversationId: 'c1',
                name: 'recipe.update',
                round: 0,
                stallCount: 1,
                messageCount: 2,
                toolNames: ['get_gui_context']
            })
        })

        it('the specialist.prompt event for the recovery round shows the appended user nudge in the rendered snapshot', () => {
            const bus = aFakeBus()
            const llm = aFakeLlm({replies: [
                {text: ''},
                {text: 'Recovered.'}
            ]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$: noopInvokeTool$,
                context: {conversationId: 'c1'}
            }))

            const prompts = bus.published.filter(e => e.type === 'specialist.prompt')
            expect(prompts).toHaveLength(2)
            expect(prompts[1].messageCount).toBe(3)
            expect(prompts[1].message()).toMatch(/Continue working on the original request/)
        })

        it('does not emit user-facing toolStart/toolEnd events during stall recovery (the nudge is inner-loop only)', () => {
            const llm = aFakeLlm({replies: [
                {text: ''},
                {text: 'Recovered.'}
            ]})

            const {events} = run(runSpecialist$({
                llm, bus: aFakeBus(), name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$: noopInvokeTool$,
                context: {conversationId: 'c1'}
            }))

            expect(events.filter(e => e && (e.toolStart || e.toolEnd))).toEqual([])
        })
    })

    describe('tool-loop safety', () => {

        it('blocks an identical inner tool call after a prior failure without invoking it again', () => {
            const failingCall = (id) => ({id, name: 'get_gui_context', input: {filter: 'mine'}})
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
                llm, bus: aFakeBus(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(invocations).toHaveLength(1)
            expect(result).toEqual({answer: 'Cannot answer.'})
        })

        it('bails out of the inner loop after consecutive failures for the same tool name', () => {
            const failingCall = (id, x) => ({id, name: 'get_gui_context', input: {x}})
            const llm = aFakeLlm({replies: [
                {toolCalls: [failingCall('a', 1)]},
                {toolCalls: [failingCall('b', 2)]},
                {toolCalls: [failingCall('c', 3)]},
                {text: 'should not reach'}
            ]})
            const invokeTool$ = () => of({ok: false, error: {code: 'TOOL_FAILED', message: 'boom'}})

            const result = read(runSpecialist$({
                llm, bus: aFakeBus(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(llm.receivedMessages).toHaveLength(3)
            expect(result.answer).toMatch(/repeated failures/i)
        })

        it('bails out of the inner loop after repeated INVALID_TOOL_ARGS for the same tool name', () => {
            const llm = aFakeLlm({replies: [
                {toolCalls: [{id: 'a', name: 'get_gui_context', input: {x: 1}}]},
                {toolCalls: [{id: 'b', name: 'get_gui_context', input: {x: 2}}]},
                {toolCalls: [{id: 'c', name: 'get_gui_context', input: {x: 3}}]},
                {text: 'should not reach'}
            ]})
            const invokeTool$ = () => of({ok: false, error: {code: 'INVALID_TOOL_ARGS', message: 'bad'}})

            const result = read(runSpecialist$({
                llm, bus: aFakeBus(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(llm.receivedMessages).toHaveLength(3)
            expect(result.answer).toMatch(/invalid args/i)
        })
    })

    describe('when an inner tool emits channel events', () => {
        const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}

        it('forwards channel emissions to the outer stream and feeds only the tool result to the inner LLM', () => {
            const guiActionEmission = emitChannel(guiAction({requestId: 'req-1', action: 'echo', params: {}}))
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'done'}
            ]})
            const invokeTool$ = () => concat(of(guiActionEmission), of({ok: true, data: {section: 'process'}}))

            const {events} = run(runSpecialist$({
                llm, bus: aFakeBus(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(events).toContainEqual(guiActionEmission)
            expect(events.at(-1)).toEqual({answer: 'done'})
            expect(llm.receivedMessages[1].find(m => m.role === 'tool').toolResults).toEqual([
                {toolCallId: 'gc1', toolName: 'get_gui_context', result: {ok: true, data: {section: 'process'}}}
            ])
        })

        it('does not let a passed-through channel emission count toward the consecutive-failure cap', () => {
            const guiActionEmission = emitChannel(guiAction({requestId: 'req-1', action: 'echo', params: {}}))
            const llm = aFakeLlm({replies: [
                {toolCalls: [{id: 'a', name: 'get_gui_context', input: {x: 1}}]},
                {toolCalls: [{id: 'b', name: 'get_gui_context', input: {x: 2}}]},
                {text: 'reached'}
            ]})
            // Each invocation emits a channel emission followed by a TOOL_FAILED envelope. Without the
            // isChannelEmission guard, guard.record would log two failures per call and bail on call 2.
            const invokeTool$ = () => concat(
                of(guiActionEmission),
                of({ok: false, error: {code: 'TOOL_FAILED', message: 'boom'}})
            )

            const result = read(runSpecialist$({
                llm, bus: aFakeBus(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(result).toEqual({answer: 'reached'})
        })
    })

    describe('channel-emission collision safety', () => {
        const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}

        it('treats a tool result envelope whose data has {kind, targeting} as data, not a channel emission', () => {
            const lookalikeData = {kind: 'mosaic', targeting: 'whatever'}
            const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}, {text: 'done'}]})
            const invokeTool$ = () => of({ok: true, data: lookalikeData})

            const {events} = run(runSpecialist$({
                llm, bus: aFakeBus(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            // Only the final answer reaches the outer stream — the lookalike never gets dispatched.
            expect(events.filter(e => e.answer == null)).toEqual([])
            expect(events.at(-1)).toEqual({answer: 'done'})
            expect(llm.receivedMessages[1].find(m => m.role === 'tool').toolResults).toEqual([
                {toolCallId: 'gc1', toolName: 'get_gui_context', result: {ok: true, data: lookalikeData}}
            ])
        })

        it('treats a tool result that fakes the streamType marker as data, not a channel emission', () => {
            // The Symbol marker is unforgeable, so a JSON-shaped object with streamType: 'channel-event'
            // is plain tool data that must reach the inner LLM as a tool result.
            const fakeMarker = {streamType: 'channel-event', event: {kind: 'gui-action'}}
            const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}, {text: 'done'}]})
            const invokeTool$ = () => of(fakeMarker)

            const {events} = run(runSpecialist$({
                llm, bus: aFakeBus(), name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$, context: {}
            }))

            expect(events.filter(e => e.answer == null)).toEqual([])
            expect(events.at(-1)).toEqual({answer: 'done'})
            expect(llm.receivedMessages[1].find(m => m.role === 'tool').toolResults).toEqual([
                {toolCallId: 'gc1', toolName: 'get_gui_context', result: fakeMarker}
            ])
        })
    })

    describe('observability', () => {

        it('wraps the specialist run in a bus.track$ span identified by specialist name', () => {
            const bus = aFakeBus()
            const llm = aFakeLlm({replies: [{text: 'done'}]})

            read(runSpecialist$({
                llm, bus, name: 'map',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$: noopInvokeTool$, context: {}
            }))

            expect(bus.spans).toEqual(expect.arrayContaining([
                {name: 'specialist.run', attrs: {name: 'map'}}
            ]))
        })

        it('publishes specialist.request before each LLM round (name, round, message count, tool names)', () => {
            const bus = aFakeBus()
            const llm = aFakeLlm({replies: [{text: 'done'}]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$: noopInvokeTool$, context: {conversationId: 'c1'}
            }))

            const requests = bus.published.filter(e => e.type === 'specialist.request')
            expect(requests).toEqual([{
                type: 'specialist.request',
                level: 'debug',
                conversationId: 'c1',
                name: 'recipe.update',
                round: 0,
                messageCount: 2,
                toolNames: ['get_gui_context'],
                message: expect.stringContaining('specialist.request name=recipe.update round=0')
            }])
        })

        it('publishes specialist.response after the LLM stream (round, textChars, tool-call names, empty flag)', () => {
            const bus = aFakeBus()
            const llm = aFakeLlm({replies: [{text: 'Done.'}]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$: noopInvokeTool$, context: {conversationId: 'c1'}
            }))

            const responses = bus.published.filter(e => e.type === 'specialist.response')
            expect(responses).toEqual([{
                type: 'specialist.response',
                level: 'debug',
                conversationId: 'c1',
                name: 'recipe.update',
                round: 0,
                textChars: 5,
                toolCallNames: [],
                empty: false,
                message: expect.stringContaining('textChars=5')
            }])
        })

        it("publishes specialist.response with empty=true on each empty round; a second empty after stall recovery is what terminates with UPDATE_NOT_ATTEMPTED", () => {
            const bus = aFakeBus()
            const llm = aFakeLlm({replies: [{text: ''}, {text: ''}]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$: noopInvokeTool$, context: {conversationId: 'c1'}
            }))

            const responses = bus.published.filter(e => e.type === 'specialist.response')
            expect(responses).toHaveLength(2)
            expect(responses[0]).toMatchObject({empty: true, textChars: 0, toolCallNames: []})
            expect(responses[1]).toMatchObject({empty: true, textChars: 0, toolCallNames: []})
        })

        it('publishes specialist.tool.request and specialist.tool.response around each inner tool call', () => {
            const bus = aFakeBus()
            const toolCall = {id: 'gc1', name: 'get_gui_context', input: {section: 'process'}}
            const llm = aFakeLlm({replies: [
                {toolCalls: [toolCall]},
                {text: 'done'}
            ]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas,
                invokeTool$: () => of({ok: true, data: {a: 1}}),
                context: {conversationId: 'c1'}
            }))

            const requests = bus.published.filter(e => e.type === 'specialist.tool.request')
            const responses = bus.published.filter(e => e.type === 'specialist.tool.response')
            expect(requests).toHaveLength(1)
            expect(requests[0]).toMatchObject({
                name: 'recipe.update',
                tool: 'get_gui_context',
                inputKeys: ['section']
            })
            expect(responses).toHaveLength(1)
            expect(responses[0]).toMatchObject({
                name: 'recipe.update',
                tool: 'get_gui_context',
                ok: true
            })
        })

        it('publishes specialist.tool.response with ok=false and errorCode when the inner tool returned a failure envelope', () => {
            const bus = aFakeBus()
            const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}
            const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}, {text: 'done'}]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas,
                invokeTool$: () => of({ok: false, error: {code: 'TOOL_FAILED', message: 'boom'}}),
                context: {conversationId: 'c1'}
            }))

            const responses = bus.published.filter(e => e.type === 'specialist.tool.response')
            expect(responses[0]).toMatchObject({ok: false, errorCode: 'TOOL_FAILED'})
        })

        it('publishes specialist.prompt before each specialist LLM call (trace, lazy, with round/messageCount/toolNames/name)', () => {
            const bus = aFakeBus()
            const llm = aFakeLlm({replies: [{text: 'done'}]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'You are SEPAL update specialist.',
                userText: 'change the target date to 2026-06-01',
                allowedSchemas,
                invokeTool$: noopInvokeTool$, context: {conversationId: 'c1'}
            }))

            const prompts = bus.published.filter(e => e.type === 'specialist.prompt')
            expect(prompts).toHaveLength(1)
            expect(prompts[0]).toMatchObject({
                type: 'specialist.prompt',
                level: 'trace',
                conversationId: 'c1',
                name: 'recipe.update',
                round: 0,
                messageCount: 2,
                toolNames: ['get_gui_context']
            })
            expect(typeof prompts[0].message).toBe('function')
        })

        it('renders the user text and the system prompt in the specialist.prompt snapshot so the trace excerpt is enough to inspect a bad prompt', () => {
            const bus = aFakeBus()
            const llm = aFakeLlm({replies: [{text: 'done'}]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'You are SEPAL update specialist.',
                userText: 'change the target date to 2026-06-01',
                allowedSchemas,
                invokeTool$: noopInvokeTool$, context: {conversationId: 'c1'}
            }))

            const snapshot = bus.published.find(e => e.type === 'specialist.prompt').message()
            expect(snapshot).toContain('You are SEPAL update specialist.')
            expect(snapshot).toContain('change the target date to 2026-06-01')
        })

        it('publishes a fresh specialist.prompt for each round so the rendered snapshot reflects the post-tool history', () => {
            const bus = aFakeBus()
            const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}
            const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}, {text: 'done'}]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas,
                invokeTool$: () => of({ok: true, data: {section: 'process'}}),
                context: {conversationId: 'c1'}
            }))

            const prompts = bus.published.filter(e => e.type === 'specialist.prompt')
            expect(prompts.map(p => p.round)).toEqual([0, 1])
            expect(prompts[0].messageCount).toBe(2)
            expect(prompts[1].messageCount).toBe(4) // system, user, assistant(toolCalls), tool(results)
        })

        it('routes by type prefix to the specialist category (logListener splits on first dot — type=specialist.prompt -> category=specialist)', () => {
            const bus = aFakeBus()
            const llm = aFakeLlm({replies: [{text: 'ok'}]})

            read(runSpecialist$({
                llm, bus, name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas, invokeTool$: noopInvokeTool$, context: {conversationId: 'c1'}
            }))

            const prompt = bus.published.find(e => e.type === 'specialist.prompt')
            expect(prompt.type.split('.')[0]).toBe('specialist')
        })

        it('does not emit {toolStart} or {toolEnd} plain objects in the outer stream — inner specialist tools must not surface as user-facing tool usage', () => {
            const toolCall = {id: 'gc1', name: 'get_gui_context', input: {}}
            const llm = aFakeLlm({replies: [{toolCalls: [toolCall]}, {text: 'done'}]})

            const {events} = run(runSpecialist$({
                llm, bus: aFakeBus(), name: 'recipe.update',
                systemPrompt: 'p', userText: 'q',
                allowedSchemas,
                invokeTool$: () => of({ok: true, data: {section: 'process'}}),
                context: {conversationId: 'c1'}
            }))

            const userFacingEvents = events.filter(value => value && (value.toolStart || value.toolEnd))
            expect(userFacingEvents).toEqual([])
        })
    })
})
