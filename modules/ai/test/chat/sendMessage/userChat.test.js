const {Subject} = require('rxjs')
const {createConversation} = require('#mcp/chat/sendMessage/conversation')
const {createUserChat} = require('#mcp/chat/sendMessage/userChat')
const {createInMemoryConversationsStore} = require('#mcp/chat/io/conversationsStore')
const {aFakeChannel, aFakeHistory, aFakeLlm, aFakeTools, aFakeTracer} = require('./builders')

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
            createHistory: aFakeHistory,
            clock: aFixedClock(T1),
            ...overrides
        }
        return createUserChat({
            conversationsStore: createInMemoryConversationsStore(),
            clock: opts.clock,
            newConversation: () => createConversation({
                llm: opts.llm,
                tracer: opts.tracer,
                tools: opts.tools,
                history: opts.createHistory(),
                systemPrompt: opts.systemPrompt,
                id: opts.createId()
            })
        })
    }

    function sequentialIds(ids) {
        let i = 0
        return () => ids[Math.min(i++, ids.length - 1)]
    }

    function aFixedClock(t) {
        return {now: () => t}
    }

    function anAdvancingClock(times) {
        let i = 0
        return {now: () => times[Math.min(i++, times.length - 1)]}
    }

    describe('createConversation', () => {

        it('notifies the channel of created with the full meta record (and claims for cross-tab)', () => {
            userChat.createConversation(channel)

            const expected = {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            expect(channel.created).toEqual([expected])
            expect(channel.claimed).toEqual([expected])
        })

        it('returns the new conversation id so the caller can track it as active', () => {
            const id = userChat.createConversation(channel)

            expect(id).toBe('conv-1')
        })

        it('persists the meta in the ConversationsStore', () => {
            userChat.createConversation(channel)
            userChat.createConversation(channel)
            userChat.listConversations(channel)

            expect(channel.lists).toEqual([[
                {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1},
                {id: 'conv-2', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            ]])
        })
    })

    describe('sendUserMessage', () => {

        it('bumps updatedAt on the conversation', () => {
            userChat = aUserChat({clock: anAdvancingClock([T1, T2])})
            userChat.createConversation(channel)
            userChat.sendUserMessage(channel, 'conv-1', 'hello')
            userChat.listConversations(channel)

            expect(channel.lists[0][0]).toEqual({
                id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T2
            })
        })

        it('emits status before processing so other tabs lock immediately', () => {
            userChat.createConversation(channel)

            userChat.sendUserMessage(channel, 'conv-1', 'hello')

            expect(channel.statuses).toEqual(['conv-1'])
        })

        it('emits the user message for other tabs to render', () => {
            userChat.createConversation(channel)

            userChat.sendUserMessage(channel, 'conv-1', 'hello')

            expect(channel.userMessages).toEqual([{conversationId: 'conv-1', text: 'hello'}])
        })

        it('streams the assistant reply via the channel', () => {
            userChat.createConversation(channel)

            userChat.sendUserMessage(channel, 'conv-1', 'hello')

            expect(channel.sent).toEqual([
                {conversationId: 'conv-1', textDelta: 'Hi!'},
                {conversationId: 'conv-1', complete: true}
            ])
        })

        it('is a no-op for an unknown conversation id', () => {
            userChat.sendUserMessage(channel, 'nope', 'hello')

            expect(channel.sent).toEqual([])
            expect(channel.statuses).toEqual([])
            expect(channel.userMessages).toEqual([])
        })
    })

    describe('selectConversation', () => {

        it('sends the conversation\'s messages on the channel', () => {
            userChat.createConversation(channel)
            userChat.sendUserMessage(channel, 'conv-1', 'hello')

            userChat.selectConversation(channel, 'conv-1')

            expect(channel.loaded).toEqual([{
                conversationId: 'conv-1',
                messages: [
                    {role: 'user', content: 'hello'},
                    {role: 'assistant', content: 'Hi!'}
                ]
            }])
        })

        it('returns the id when found, undefined when not', () => {
            userChat.createConversation(channel)

            expect(userChat.selectConversation(channel, 'conv-1')).toBe('conv-1')
            expect(userChat.selectConversation(channel, 'nope')).toBeUndefined()
        })

        it('does not notify the channel for an unknown id', () => {
            userChat.selectConversation(channel, 'nope')

            expect(channel.loaded).toEqual([])
        })
    })

    describe('deleteConversation', () => {

        it('notifies the channel and removes from the store', () => {
            userChat.createConversation(channel)
            userChat.deleteConversation(channel, 'conv-1')
            userChat.listConversations(channel)

            expect(channel.deleted).toEqual(['conv-1'])
            expect(channel.lists).toEqual([[]])
        })

        it('is a no-op for an unknown id', () => {
            userChat.deleteConversation(channel, 'nope')

            expect(channel.deleted).toEqual([])
        })

        it('unsubscribes any in-flight stream so deleted conversations stop emitting', () => {
            const replies$ = new Subject()
            const llm = {respondTo$: () => replies$, receivedMessages: []}
            userChat = aUserChat({llm})
            userChat.createConversation(channel)
            userChat.sendUserMessage(channel, 'conv-1', 'hello')

            userChat.deleteConversation(channel, 'conv-1')
            replies$.next({textDelta: 'too late'})

            expect(channel.sent.filter(p => p.textDelta)).toEqual([])
        })
    })

    describe('deleteAllConversations', () => {

        it('notifies the channel for each conversation and removes all from the store', () => {
            userChat.createConversation(channel)
            userChat.createConversation(channel)

            userChat.deleteAllConversations(channel)
            userChat.listConversations(channel)

            expect(channel.deleted).toEqual(['conv-1', 'conv-2'])
            expect(channel.lists).toEqual([[]])
        })

        it('is a no-op when there are no conversations', () => {
            userChat.deleteAllConversations(channel)

            expect(channel.deleted).toEqual([])
        })
    })

    describe('listConversations', () => {

        it('reads meta records from the store and notifies the channel', () => {
            userChat.createConversation(channel)
            userChat.createConversation(channel)

            userChat.listConversations(channel)

            expect(channel.lists).toEqual([[
                {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1},
                {id: 'conv-2', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            ]])
        })
    })

    describe('abort', () => {

        function aPendingLlm() {
            return {respondTo$: () => new Subject(), receivedMessages: []}
        }

        it('emits a complete on the channel to unlock all tabs', () => {
            userChat = aUserChat({llm: aPendingLlm()})
            userChat.createConversation(channel)
            userChat.sendUserMessage(channel, 'conv-1', 'hello')

            userChat.abort(channel, 'conv-1')

            expect(channel.sent).toContainEqual({conversationId: 'conv-1', complete: true})
        })

        it('unsubscribes the in-flight stream so subsequent events are dropped', () => {
            const replies$ = new Subject()
            const llm = {respondTo$: () => replies$, receivedMessages: []}
            userChat = aUserChat({llm})
            userChat.createConversation(channel)
            userChat.sendUserMessage(channel, 'conv-1', 'hello')

            userChat.abort(channel, 'conv-1')
            replies$.next({textDelta: 'too late'})

            expect(channel.sent.filter(p => p.textDelta)).toEqual([])
        })

        it('is a no-op when there is no in-flight stream', () => {
            userChat.createConversation(channel)

            userChat.abort(channel, 'conv-1')

            expect(channel.sent).toEqual([])
        })
    })
})
