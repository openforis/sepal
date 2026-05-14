const {Subject, of} = require('rxjs')
const {createConversation} = require('#mcp/chat/sendMessage/conversation')
const {createUserChat} = require('#mcp/chat/sendMessage/userChat')
const {createInMemoryConversationsStore} = require('../io/inMemoryConversationsStore')
const {aFakeChannel, aFakeHistory, aFakeLlm, aFakeTools, aFakeTitleGenerator, aFakeTracer, run} = require('./builders')

describe('UserChat', () => {

    const T1 = 1700000000000           // 2023-11-14T22:13:20.000Z
    const T2 = T1 + 60000              // one minute later
    const ISO_T1 = new Date(T1).toISOString()
    const ISO_T2 = new Date(T2).toISOString()

    let channel, llm, userChat

    beforeEach(() => {
        channel = aFakeChannel()
        llm = aFakeLlm({replies: [{text: 'Hi!'}]})
        userChat = aUserChat()
    })

    function aUserChat(overrides = {}) {
        const opts = {
            llm,
            tracer: aFakeTracer(),
            tools: aFakeTools(),
            createId: sequentialIds(['conv-1', 'conv-2', 'conv-3']),
            systemPrompt: null,
            conversationsStore: createInMemoryConversationsStore(),
            initialMessagesById: {},
            createHistory: aFakeHistory,
            clock: aFixedClock(T1),
            titleGenerator: aFakeTitleGenerator(),
            ...overrides
        }
        return createUserChat({
            conversationsStore: opts.conversationsStore,
            clock: opts.clock,
            createId: opts.createId,
            titleGenerator: opts.titleGenerator,
            conversationFor$: id => of(createConversation({
                llm: opts.llm,
                tracer: opts.tracer,
                tools: opts.tools,
                history: opts.createHistory(id),
                systemPrompt: opts.systemPrompt,
                initialMessages: opts.initialMessagesById[id] || [],
                id
            }))
        })
    }

    function sequentialIds(ids) {
        let i = 0
        return () => ids[Math.min(i++, ids.length - 1)]
    }

    function aFixedClock(t) {
        return {
            now: () => t,
            nowIso: () => new Date(t).toISOString()
        }
    }

    function anAdvancingClock(times) {
        let i = 0
        const advance = () => times[Math.min(i++, times.length - 1)]
        return {
            now: advance,
            nowIso: () => new Date(advance()).toISOString()
        }
    }

    describe('createConversation$', () => {

        it('notifies the channel of created with the full meta record (and claims for cross-tab)', () => {
            run(userChat.createConversation$({channel}))

            const expected = {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            expect(channel.created).toEqual([expected])
            expect(channel.claimed).toEqual([expected])
        })

        it('does not persist a conversation until the user sends a message', () => {
            run(userChat.createConversation$({channel}))
            run(userChat.createConversation$({channel}))
            run(userChat.listConversations$({channel}))

            expect(channel.lists).toEqual([[]])
        })

        it('persists the meta to the ConversationsStore on the first user message', () => {
            run(userChat.createConversation$({channel}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hi'}))
            run(userChat.listConversations$({channel}))

            expect(channel.lists).toEqual([[
                {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            ]])
        })
    })

    describe('sendUserMessage$', () => {

        it('bumps updatedAt on the conversation', () => {
            userChat = aUserChat({clock: anAdvancingClock([T1, T2])})
            run(userChat.createConversation$({channel}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))
            run(userChat.listConversations$({channel}))

            expect(channel.lists[0][0]).toEqual({
                id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T2
            })
        })

        it('emits status before processing so other tabs lock immediately', () => {
            run(userChat.createConversation$({channel}))

            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

            expect(channel.statuses).toEqual(['conv-1'])
        })

        it('emits the user message for other tabs to render', () => {
            run(userChat.createConversation$({channel}))

            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

            expect(channel.userMessages).toEqual([{conversationId: 'conv-1', text: 'hello'}])
        })

        it('streams the assistant reply via the channel', () => {
            run(userChat.createConversation$({channel}))

            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

            expect(channel.sent).toEqual([
                {conversationId: 'conv-1', textDelta: 'Hi!'},
                {conversationId: 'conv-1', complete: true}
            ])
        })

        it('is a no-op for an unknown conversation id', () => {
            run(userChat.sendUserMessage$({channel, conversationId: 'nope', text: 'hello'}))

            expect(channel.sent).toEqual([])
            expect(channel.statuses).toEqual([])
            expect(channel.userMessages).toEqual([])
        })

        it('invokes the titleGenerator after the turn with the user text', () => {
            const titleGenerator = aFakeTitleGenerator()
            userChat = aUserChat({titleGenerator})
            run(userChat.createConversation$({channel}))

            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

            expect(titleGenerator.afterTurns).toHaveLength(1)
            expect(titleGenerator.afterTurns[0]).toMatchObject({
                conversationId: 'conv-1',
                userText: 'hello'
            })
        })

        it('does not invoke the titleGenerator when the conversation is unknown', () => {
            const titleGenerator = aFakeTitleGenerator()
            userChat = aUserChat({titleGenerator})

            run(userChat.sendUserMessage$({channel, conversationId: 'nope', text: 'hello'}))

            expect(titleGenerator.afterTurns).toEqual([])
        })

        it('rebuilds a persisted conversation before sending to it', () => {
            const persisted = {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            llm = aFakeLlm({replies: [{text: 'Again!'}]})
            userChat = aUserChat({
                llm,
                conversationsStore: createInMemoryConversationsStore([persisted]),
                initialMessagesById: {
                    'conv-1': [
                        {role: 'user', content: 'first'},
                        {role: 'assistant', content: 'reply'}
                    ]
                }
            })

            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'again'}))

            expect(llm.receivedMessages[0]).toEqual([
                {role: 'user', content: 'first'},
                {role: 'assistant', content: 'reply'},
                {role: 'user', content: 'again'}
            ])
            expect(channel.sent).toEqual([
                {conversationId: 'conv-1', textDelta: 'Again!'},
                {conversationId: 'conv-1', complete: true}
            ])
        })
    })

    describe('GUI context', () => {
        const sub = {clientId: 'c1', subscriptionId: 's1'}

        it('attaches a subscription\'s stored context to a message from that same subscription', () => {
            run(userChat.createConversation$({channel}))
            run(userChat.updateContext$({...sub, selection: {section: 'process'}}))

            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello', ...sub}))

            expect(llm.receivedMessages[0]).toContainEqual({
                role: 'system', content: expect.stringContaining('"section":"process"')
            })
        })

        it('does not attach one subscription\'s context to another subscription\'s message', () => {
            run(userChat.createConversation$({channel}))
            run(userChat.updateContext$({clientId: 'c1', subscriptionId: 's1', selection: {section: 'process'}}))

            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello', clientId: 'c1', subscriptionId: 's2'}))

            expect(llm.receivedMessages[0]).toEqual([{role: 'user', content: 'hello'}])
        })

        it('uses the sending tab context when multiple tabs share the same conversation', () => {
            const tabA = {clientId: 'c1', subscriptionId: 's1'}
            const tabB = {clientId: 'c2', subscriptionId: 's1'}
            run(userChat.createConversation$({channel}))
            run(userChat.updateContext$({
                ...tabA,
                selection: {selectedRecipe: {recipeId: 'r-mosaic', recipeName: 'Mosaic'}}
            }))
            run(userChat.updateContext$({
                ...tabB,
                selection: {selectedRecipe: {recipeId: 'r-classification', recipeName: 'Classification'}}
            }))

            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'change this', ...tabA}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'change this too', ...tabB}))

            expect(runtimeContextContent(llm.receivedMessages[0])).toContain('"recipeName":"Mosaic"')
            expect(runtimeContextContent(llm.receivedMessages[0])).not.toContain('Classification')
            expect(runtimeContextContent(llm.receivedMessages[1])).toContain('"recipeName":"Classification"')
            expect(runtimeContextContent(llm.receivedMessages[1])).not.toContain('Mosaic')
        })

        it('drops a subscription\'s context when it is cleared', () => {
            run(userChat.createConversation$({channel}))
            run(userChat.updateContext$({...sub, selection: {section: 'process'}}))
            run(userChat.clearContext$({...sub}))

            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello', ...sub}))

            expect(llm.receivedMessages[0]).toEqual([{role: 'user', content: 'hello'}])
        })
    })

    function runtimeContextContent(messages) {
        return messages.find(message => message.content?.includes('<runtime-context>'))?.content
    }

    describe('tool turns', () => {
        const echoCall = {id: 't1', name: 'echo', input: {}}

        it('passes a toolContext identifying channel, conversation and subscription to tools', () => {
            const seen = []
            const llm = aFakeLlm({replies: [{toolCalls: [echoCall]}, {text: 'done'}]})
            const tools = aFakeTools({echo: (_input, context) => {
                seen.push(context)
                return of({})
            }})
            userChat = aUserChat({llm, tools})
            run(userChat.createConversation$({channel}))

            run(userChat.sendUserMessage$({
                channel, conversationId: 'conv-1', text: 'echo it', clientId: 'c1', subscriptionId: 's1'
            }))

            expect(seen).toEqual([{channel, conversationId: 'conv-1', clientId: 'c1', subscriptionId: 's1'}])
        })

        it('routes tool-start and tool-end events to the channel', () => {
            const llm = aFakeLlm({replies: [{toolCalls: [echoCall]}, {text: 'done'}]})
            const tools = aFakeTools({echo: () => of({})})
            userChat = aUserChat({llm, tools})
            run(userChat.createConversation$({channel}))

            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'echo it'}))

            expect(channel.toolStarts).toEqual([{conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo'}])
            expect(channel.toolEnds).toEqual([{conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', ok: true}])
        })
    })

    describe('selectConversation$', () => {

        it('sends the conversation\'s messages on the channel', () => {
            run(userChat.createConversation$({channel}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

            run(userChat.selectConversation$({channel, conversationId: 'conv-1'}))

            expect(channel.loaded).toEqual([{
                conversationId: 'conv-1',
                messages: [
                    {role: 'user', content: 'hello'},
                    {role: 'assistant', content: 'Hi!'}
                ]
            }])
        })

        it('does not notify the channel for an unknown id', () => {
            run(userChat.selectConversation$({channel, conversationId: 'nope'}))

            expect(channel.loaded).toEqual([])
        })

        it('signals status when re-entering a conversation whose stream is still in flight', () => {
            const replies$ = new Subject()
            const llm = {respondTo$: () => replies$, receivedMessages: []}
            userChat = aUserChat({llm})
            run(userChat.createConversation$({channel}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

            run(userChat.selectConversation$({channel, conversationId: 'conv-1'}))

            expect(channel.statuses).toEqual(['conv-1', 'conv-1'])
        })

        it('does not signal status when re-entering a conversation whose stream has completed', () => {
            run(userChat.createConversation$({channel}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

            run(userChat.selectConversation$({channel, conversationId: 'conv-1'}))

            expect(channel.statuses).toEqual(['conv-1'])
        })

        it('rebuilds a persisted conversation before loading it', () => {
            const persisted = {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            userChat = aUserChat({
                conversationsStore: createInMemoryConversationsStore([persisted]),
                initialMessagesById: {
                    'conv-1': [
                        {role: 'user', content: 'first'},
                        {role: 'assistant', content: 'reply'}
                    ]
                }
            })

            run(userChat.selectConversation$({channel, conversationId: 'conv-1'}))

            expect(channel.loaded).toEqual([{
                conversationId: 'conv-1',
                messages: [
                    {role: 'user', content: 'first'},
                    {role: 'assistant', content: 'reply'}
                ]
            }])
        })
    })

    describe('deleteConversation$', () => {

        it('notifies the channel and removes from the store', () => {
            run(userChat.createConversation$({channel}))
            run(userChat.deleteConversation$({channel, conversationId: 'conv-1'}))
            run(userChat.listConversations$({channel}))

            expect(channel.deleted).toEqual(['conv-1'])
            expect(channel.lists).toEqual([[]])
        })

        it('is a no-op for an unknown id', () => {
            run(userChat.deleteConversation$({channel, conversationId: 'nope'}))

            expect(channel.deleted).toEqual([])
        })

        it('aborts any in-flight stream so deleted conversations stop emitting', () => {
            const replies$ = new Subject()
            const llm = {respondTo$: () => replies$, receivedMessages: []}
            userChat = aUserChat({llm})
            run(userChat.createConversation$({channel}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

            run(userChat.deleteConversation$({channel, conversationId: 'conv-1'}))
            replies$.next({textDelta: 'too late'})

            expect(channel.sent.filter(p => p.textDelta)).toEqual([])
        })
    })

    describe('deleteAllConversations$', () => {

        it('notifies the channel for each conversation and removes all from the store', () => {
            run(userChat.createConversation$({channel}))
            run(userChat.createConversation$({channel}))

            run(userChat.deleteAllConversations$({channel}))
            run(userChat.listConversations$({channel}))

            expect(channel.deleted).toEqual(['conv-1', 'conv-2'])
            expect(channel.lists).toEqual([[]])
        })

        it('is a no-op when there are no conversations', () => {
            run(userChat.deleteAllConversations$({channel}))

            expect(channel.deleted).toEqual([])
        })
    })

    describe('listConversations$', () => {

        it('reads persisted meta records from the store and notifies the channel', () => {
            run(userChat.createConversation$({channel}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hi'}))
            run(userChat.createConversation$({channel}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-2', text: 'hi'}))

            run(userChat.listConversations$({channel}))

            expect(channel.lists).toEqual([[
                {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1},
                {id: 'conv-2', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            ]])
        })

    })

    describe('abort$', () => {

        function aPendingLlm() {
            return {respondTo$: () => new Subject(), receivedMessages: []}
        }

        it('emits a complete on the channel to unlock all tabs', () => {
            userChat = aUserChat({llm: aPendingLlm()})
            run(userChat.createConversation$({channel}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

            run(userChat.abort$({conversationId: 'conv-1'}))

            expect(channel.sent).toContainEqual({conversationId: 'conv-1', complete: true})
        })

        it('tears down the in-flight stream so subsequent events are dropped', () => {
            const replies$ = new Subject()
            const llm = {respondTo$: () => replies$, receivedMessages: []}
            userChat = aUserChat({llm})
            run(userChat.createConversation$({channel}))
            run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

            run(userChat.abort$({conversationId: 'conv-1'}))
            replies$.next({textDelta: 'too late'})

            expect(channel.sent.filter(p => p.textDelta)).toEqual([])
        })

        it('is a no-op when there is no in-flight stream', () => {
            run(userChat.createConversation$({channel}))

            run(userChat.abort$({conversationId: 'conv-1'}))

            expect(channel.sent).toEqual([])
        })
    })
})
