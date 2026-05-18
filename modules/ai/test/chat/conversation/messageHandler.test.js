const {from, of} = require('rxjs')
const {createMessageHandler} = require('#mcp/chat/conversation/messageHandler')
const {emitChannel, guiAction} = require('#mcp/chat/channelEvents')
const {aFakeTitleGenerator, run} = require('../builders')

describe('MessageHandler', () => {

    function aFakeConversation({events = [{textDelta: 'hi'}]} = {}) {
        const sends = []
        return {
            isStreaming: false,
            messagesSnapshot: () => [],
            sendUserMessage$: (text, options) => {
                sends.push({text, options})
                return from(events)
            },
            abort: () => {},
            sends
        }
    }

    function aFakeConversations({conversation, persistOrTouchCalls = []} = {}) {
        const conv = conversation ?? aFakeConversation()
        return {
            get$: () => of(conv),
            persistOrTouch$: (id, now) => {
                persistOrTouchCalls.push({id, now})
                return of(undefined)
            },
            persistOrTouchCalls,
            conversation: conv
        }
    }

    function aFakeGuiContexts(contextByKey = {}) {
        return {
            get: (clientId, subscriptionId) => contextByKey[`${clientId}:${subscriptionId}`]
        }
    }

    function aFixedClock(iso = '2024-01-01T00:00:00.000Z') {
        return {nowIso: () => iso}
    }

    function aMessageHandler({conversations, guiContexts, titleGenerator, clock} = {}) {
        return createMessageHandler({
            conversations: conversations ?? aFakeConversations(),
            guiContexts: guiContexts ?? aFakeGuiContexts(),
            titleGenerator: titleGenerator ?? aFakeTitleGenerator(),
            clock: clock ?? aFixedClock()
        })
    }

    const aliceId = 'c1'
    const aliceSub = 's1'

    describe('GUI context resolution', () => {
        it('uses the message-supplied GUI context when present', () => {
            const conv = aFakeConversation()
            const messageHandler = aMessageHandler({conversations: aFakeConversations({conversation: conv})})

            run(messageHandler.handle$({
                conversationId: 'conv-1', text: 'hi',
                clientId: aliceId, subscriptionId: aliceSub,
                guiContext: {section: 'inline'}
            }))

            expect(conv.sends[0].options.guiContext).toEqual({section: 'inline'})
        })

        it('falls back to the cached GUI context when the message has none', () => {
            const conv = aFakeConversation()
            const messageHandler = aMessageHandler({
                conversations: aFakeConversations({conversation: conv}),
                guiContexts: aFakeGuiContexts({[`${aliceId}:${aliceSub}`]: {section: 'stored'}})
            })

            run(messageHandler.handle$({
                conversationId: 'conv-1', text: 'hi',
                clientId: aliceId, subscriptionId: aliceSub
            }))

            expect(conv.sends[0].options.guiContext).toEqual({section: 'stored'})
        })
    })

    describe('turn-boundary notifications', () => {
        it('emits status + user-message at the start and chat-response complete at the end', () => {
            const messageHandler = aMessageHandler()

            const {events} = run(messageHandler.handle$({
                conversationId: 'conv-1', text: 'hello',
                clientId: aliceId, subscriptionId: aliceSub
            }))

            expect(events[0]).toEqual({kind: 'status', targeting: 'broadcast', payload: {conversationId: 'conv-1'}})
            expect(events[1]).toEqual({kind: 'user-message', targeting: 'broadcastExcept', payload: {conversationId: 'conv-1', text: 'hello'}})
            expect(events.at(-1)).toEqual({kind: 'chat-response', targeting: 'broadcast', payload: {conversationId: 'conv-1', complete: true}})
        })
    })

    describe('event routing', () => {
        it('translates textDelta, toolStart, toolEnd, and notice events into channel events', () => {
            const conv = aFakeConversation({
                events: [
                    {textDelta: 'one'},
                    {toolStart: {toolCallId: 't1', toolName: 'recipe_list', input: {}}},
                    {toolEnd: {toolCallId: 't1', toolName: 'recipe_list', ok: true, data: []}},
                    {notice: {content: 'note', display: {key: 'k'}}}
                ]
            })
            const messageHandler = aMessageHandler({conversations: aFakeConversations({conversation: conv})})

            const {events} = run(messageHandler.handle$({
                conversationId: 'conv-1', text: 'hi',
                clientId: aliceId, subscriptionId: aliceSub
            }))

            expect(events).toContainEqual({kind: 'chat-response', targeting: 'broadcast', payload: {conversationId: 'conv-1', text: 'one'}})
            expect(events).toContainEqual({kind: 'tool-start', targeting: 'broadcast', payload: {conversationId: 'conv-1', toolCallId: 't1', toolName: 'recipe_list', input: {}}})
            expect(events).toContainEqual({kind: 'tool-end', targeting: 'broadcast', payload: {conversationId: 'conv-1', toolCallId: 't1', toolName: 'recipe_list', ok: true, data: []}})
            expect(events).toContainEqual({kind: 'assistant-notice', targeting: 'broadcast', payload: {conversationId: 'conv-1', content: 'note', display: {key: 'k'}}})
        })

        it('unwraps channel emissions from the conversation stream and forwards the bare event', () => {
            const bareEvent = guiAction({requestId: 'req-1', action: 'echo', params: {}})
            const conv = aFakeConversation({events: [emitChannel(bareEvent)]})
            const messageHandler = aMessageHandler({conversations: aFakeConversations({conversation: conv})})

            const {events} = run(messageHandler.handle$({
                conversationId: 'conv-1', text: 'hi',
                clientId: aliceId, subscriptionId: aliceSub
            }))

            expect(events).toContainEqual(bareEvent)
        })
    })

    describe('lifecycle ordering', () => {
        it('persists (or touches) before kicking off the turn, then runs the title generator after', () => {
            const persistOrTouchCalls = []
            const titleGenerator = aFakeTitleGenerator()
            const messageHandler = aMessageHandler({
                conversations: aFakeConversations({persistOrTouchCalls}),
                titleGenerator,
                clock: aFixedClock('2024-05-01T00:00:00.000Z')
            })

            run(messageHandler.handle$({
                conversationId: 'conv-1', text: 'hi',
                clientId: aliceId, subscriptionId: aliceSub
            }))

            expect(persistOrTouchCalls).toEqual([{id: 'conv-1', now: '2024-05-01T00:00:00.000Z'}])
            expect(titleGenerator.afterTurns).toHaveLength(1)
            expect(titleGenerator.afterTurns[0]).toMatchObject({
                conversationId: 'conv-1',
                userText: 'hi'
            })
        })
    })
})
