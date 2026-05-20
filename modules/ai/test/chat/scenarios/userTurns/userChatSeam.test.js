const {of} = require('rxjs')
const {emitChannel, guiAction} = require('#mcp/chat/channelEvents')
const {aUserChatHarness, eventsOfKind, firstValue, run} = require('../../harness')

const SUB = {clientId: 'c1', subscriptionId: 's1'}
const echoSchema = {
    name: 'echo',
    description: 'Echo input.',
    parameters: {type: 'object', properties: {text: {type: 'string'}}, additionalProperties: true}
}

describe('user turns through the userChat seam', () => {

    describe('tool invocation context and broadcasts', () => {
        const toolCall = {id: 't1', name: 'echo', input: {text: 'hi'}}

        it('broadcasts tool-start and tool-end channel events for each invocation', () => {
            const harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{toolCalls: [toolCall]}, {text: 'done'}],
                tools: [{...echoSchema, invoke$: () => of({echoed: 'hi'})}]
            })
            run(harness.handle$({type: 'create-conversation'}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'echo it', ...SUB}))

            const toolEvents = harness.channelEvents.filter(event =>
                event.kind === 'tool-start' || event.kind === 'tool-end'
            )
            expect(toolEvents).toEqual([
                {kind: 'tool-start', targeting: 'broadcast',
                    payload: {conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', input: {text: 'hi'}}},
                {kind: 'tool-end', targeting: 'broadcast',
                    payload: {conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', ok: true, data: {echoed: 'hi'}, error: undefined}}
            ])
        })

        it('passes the tool invocation context (conversationId + subscription + GUI context) to the tool', () => {
            const seen = []
            const harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{toolCalls: [toolCall]}, {text: 'done'}],
                tools: [{...echoSchema, invoke$: (_input, context) => {
                    seen.push(context)
                    return of({})
                }}]
            })
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'context', ...SUB, guiContext: {section: 'process'}}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'echo it', ...SUB}))

            expect(seen).toEqual([{
                conversationId: 'conv-1',
                clientId: 'c1',
                subscriptionId: 's1',
                guiContext: {section: 'process'}
            }])
        })
    })

    describe('turn boundaries', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{text: 'Hi!'}]
            })
            run(harness.handle$({type: 'create-conversation'}))
        })

        it('broadcasts a status event at the start of the turn', () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB}))

            const statuses = eventsOfKind(harness.channelEvents, 'status')
            expect(statuses).toEqual([
                {kind: 'status', targeting: 'broadcast', payload: {conversationId: 'conv-1'}}
            ])
        })

        it('broadcasts the user message to sibling tabs (broadcastExcept) at the start of the turn', () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB}))

            const userMessages = eventsOfKind(harness.channelEvents, 'user-message')
            expect(userMessages).toEqual([
                {kind: 'user-message', targeting: 'broadcastExcept',
                    payload: {conversationId: 'conv-1', text: 'hello'}}
            ])
        })

        it('broadcasts a chat-response complete at the end of the turn', () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB}))

            const lastChatResponse = harness.channelEvents
                .filter(event => event.kind === 'chat-response').at(-1)
            expect(lastChatResponse).toEqual({
                kind: 'chat-response', targeting: 'broadcast',
                payload: {conversationId: 'conv-1', complete: true}
            })
        })

        it('records the conversation in the store before the turn runs (persists or touches up front)', async () => {
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB}))

            const persisted = await firstValue(harness.conversationsStore.list$())
            expect(persisted).toContainEqual(expect.objectContaining({id: 'conv-1'}))
        })
    })

    describe('event routing', () => {
        const toolCall = {id: 't1', name: 'echo', input: {}}

        it('translates textDelta into a chat-response channel event', () => {
            const harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{text: 'one'}]
            })
            run(harness.handle$({type: 'create-conversation'}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi', ...SUB}))

            expect(harness.channelEvents).toContainEqual({
                kind: 'chat-response', targeting: 'broadcast',
                payload: {conversationId: 'conv-1', text: 'one'}
            })
        })

        it('translates toolStart and toolEnd into tool-start and tool-end channel events', () => {
            const harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{toolCalls: [toolCall]}, {text: 'done'}],
                tools: [{...echoSchema, invoke$: () => of({})}]
            })
            run(harness.handle$({type: 'create-conversation'}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi', ...SUB}))

            const toolEvents = harness.channelEvents.filter(event =>
                event.kind === 'tool-start' || event.kind === 'tool-end'
            )
            expect(toolEvents.map(event => event.kind)).toEqual(['tool-start', 'tool-end'])
        })

        it('unwraps a channel emission from the conversation stream and forwards the bare event', () => {
            const bareEvent = guiAction({requestId: 'req-1', action: 'echo', params: {}})
            const harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{toolCalls: [toolCall]}, {text: 'done'}],
                tools: [{...echoSchema, invoke$: () => of(emitChannel(bareEvent))}]
            })
            run(harness.handle$({type: 'create-conversation'}))

            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi', ...SUB}))

            expect(harness.channelEvents).toContainEqual(bareEvent)
        })
    })

    describe('unrecognised command', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({conversationIds: ['conv-1']})
        })

        it('emits no channel event', () => {
            run(harness.handle$({type: 'no-such-command', ...SUB}))

            expect(harness.channelEvents).toEqual([])
        })

        it('publishes a warning naming the command type', () => {
            run(harness.handle$({type: 'no-such-command', ...SUB}))

            expect(harness.bus.events).toContainEqual(
                expect.objectContaining({
                    type: 'userChat.unknownCommand',
                    level: 'warn',
                    commandType: 'no-such-command'
                })
            )
        })
    })
})
