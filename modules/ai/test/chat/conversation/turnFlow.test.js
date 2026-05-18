const {from, of} = require('rxjs')
const {createTurnFlow} = require('#mcp/chat/conversation/turnFlow')
const {aFakeChannel, aFakeTitleGenerator, run} = require('../builders')

describe('TurnFlow', () => {

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

    function aFakeTabContexts(selectionByKey = {}) {
        return {
            get: (clientId, subscriptionId) => selectionByKey[`${clientId}:${subscriptionId}`]
        }
    }

    function aFixedClock(iso = '2024-01-01T00:00:00.000Z') {
        return {nowIso: () => iso}
    }

    function aTurnFlow({conversations, tabContexts, titleGenerator, clock} = {}) {
        return createTurnFlow({
            conversations: conversations ?? aFakeConversations(),
            tabContexts: tabContexts ?? aFakeTabContexts(),
            titleGenerator: titleGenerator ?? aFakeTitleGenerator(),
            clock: clock ?? aFixedClock()
        })
    }

    const aliceId = 'c1'
    const aliceSub = 's1'

    describe('selection', () => {
        it('uses the message-supplied selection when present', () => {
            const conv = aFakeConversation()
            const turnFlow = aTurnFlow({conversations: aFakeConversations({conversation: conv})})

            run(turnFlow.send$({
                channel: aFakeChannel(), conversationId: 'conv-1', text: 'hi',
                clientId: aliceId, subscriptionId: aliceSub,
                selection: {section: 'inline'}
            }))

            expect(conv.sends[0].options.selection).toEqual({section: 'inline'})
        })

        it('falls back to the tab context selection when the message has none', () => {
            const conv = aFakeConversation()
            const turnFlow = aTurnFlow({
                conversations: aFakeConversations({conversation: conv}),
                tabContexts: aFakeTabContexts({[`${aliceId}:${aliceSub}`]: {section: 'stored'}})
            })

            run(turnFlow.send$({
                channel: aFakeChannel(), conversationId: 'conv-1', text: 'hi',
                clientId: aliceId, subscriptionId: aliceSub
            }))

            expect(conv.sends[0].options.selection).toEqual({section: 'stored'})
        })
    })

    describe('turn-boundary notifications', () => {
        it('emits status + userMessage at the start and chatResponse(complete) at the end', () => {
            const channel = aFakeChannel()
            const turnFlow = aTurnFlow()

            run(turnFlow.send$({
                channel, conversationId: 'conv-1', text: 'hello',
                clientId: aliceId, subscriptionId: aliceSub
            }))

            expect(channel.statuses).toEqual(['conv-1'])
            expect(channel.userMessages).toEqual([{conversationId: 'conv-1', text: 'hello'}])
            expect(channel.sent).toContainEqual({conversationId: 'conv-1', complete: true})
        })
    })

    describe('event routing', () => {
        it('routes textDelta, toolStart, toolEnd, and notice events to channel methods', () => {
            const channel = aFakeChannel()
            const conv = aFakeConversation({
                events: [
                    {textDelta: 'one'},
                    {toolStart: {toolCallId: 't1', toolName: 'recipe_list', input: {}}},
                    {toolEnd: {toolCallId: 't1', toolName: 'recipe_list', ok: true, data: []}},
                    {notice: {content: 'note', display: {key: 'k'}}}
                ]
            })
            const turnFlow = aTurnFlow({conversations: aFakeConversations({conversation: conv})})

            run(turnFlow.send$({
                channel, conversationId: 'conv-1', text: 'hi',
                clientId: aliceId, subscriptionId: aliceSub
            }))

            expect(channel.sent).toContainEqual({conversationId: 'conv-1', textDelta: 'one'})
            expect(channel.toolStarts).toEqual([{conversationId: 'conv-1', toolCallId: 't1', toolName: 'recipe_list', input: {}}])
            expect(channel.toolEnds).toEqual([{conversationId: 'conv-1', toolCallId: 't1', toolName: 'recipe_list', ok: true, data: []}])
            expect(channel.notices).toEqual([{conversationId: 'conv-1', content: 'note', display: {key: 'k'}}])
        })
    })

    describe('lifecycle ordering', () => {
        it('persists (or touches) before kicking off the turn, then runs the title generator after', () => {
            const persistOrTouchCalls = []
            const titleGenerator = aFakeTitleGenerator()
            const turnFlow = aTurnFlow({
                conversations: aFakeConversations({persistOrTouchCalls}),
                titleGenerator,
                clock: aFixedClock('2024-05-01T00:00:00.000Z')
            })
            const channel = aFakeChannel()

            run(turnFlow.send$({
                channel, conversationId: 'conv-1', text: 'hi',
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

