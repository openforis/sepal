const {Subject} = require('rxjs')
const {aFakeLlm, run} = require('../builders')
const {
    ISO_T1, ISO_T2, T1, T2,
    aUserChat, aUserChatFixture, anAdvancingClock, createInMemoryConversationsStore
} = require('./userChatHarness')

describe('UserChat lifecycle', () => {

    it('creates a pending conversation and claims it for the active tab', () => {
        const {channel, userChat} = aUserChatFixture()

        run(userChat.createConversation$({channel}))

        const expected = {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
        expect(channel.created).toEqual([expected])
        expect(channel.claimed).toEqual([expected])
    })

    it('persists a conversation only after the user sends its first message', () => {
        const {channel, userChat} = aUserChatFixture()

        run(userChat.createConversation$({channel}))
        run(userChat.createConversation$({channel}))
        run(userChat.listConversations$({channel}))
        expect(channel.lists).toEqual([[]])

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hi'}))
        run(userChat.listConversations$({channel}))

        expect(channel.lists.at(-1)).toEqual([
            {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
        ])
    })

    it('touches updatedAt when a persisted conversation receives a new message', () => {
        const {channel, userChat} = aUserChatFixture({clock: anAdvancingClock([T1, T2])})

        run(userChat.createConversation$({channel}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))
        run(userChat.listConversations$({channel}))

        expect(channel.lists[0][0]).toEqual({
            id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T2
        })
    })

    it('lists persisted conversations from the store', () => {
        const {channel, userChat} = aUserChatFixture()
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

    it('loads a conversation with its messages and signals status only when streaming', () => {
        const replies$ = new Subject()
        const llm = {respondTo$: () => replies$, receivedMessages: []}
        const {channel, userChat} = aUserChatFixture({llm})
        run(userChat.createConversation$({channel}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

        run(userChat.selectConversation$({channel, conversationId: 'conv-1'}))
        replies$.next({textDelta: 'Hi!'})
        replies$.complete()
        run(userChat.selectConversation$({channel, conversationId: 'conv-1'}))

        expect(channel.loaded).toEqual([
            {conversationId: 'conv-1', messages: [{role: 'user', content: 'hello'}]},
            {conversationId: 'conv-1', messages: [
                {role: 'user', content: 'hello'},
                {role: 'assistant', content: 'Hi!'}
            ]}
        ])
        expect(channel.statuses).toEqual(['conv-1', 'conv-1'])
    })

    it('rebuilds a persisted conversation before sending to it or loading it', () => {
        const persisted = {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
        const initialMessagesById = {'conv-1': [
            {role: 'user', content: 'first'},
            {role: 'assistant', content: 'reply'}
        ]}
        const llm = aFakeLlm({replies: [{text: 'Again!'}]})
        const {channel, userChat} = aUserChatFixture({
            llm,
            conversationsStore: createInMemoryConversationsStore([persisted]),
            initialMessagesById
        })

        run(userChat.selectConversation$({channel, conversationId: 'conv-1'}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'again'}))

        expect(channel.loaded).toEqual([{
            conversationId: 'conv-1',
            messages: initialMessagesById['conv-1']
        }])
        expect(llm.receivedMessages[0]).toEqual([
            ...initialMessagesById['conv-1'],
            {role: 'user', content: 'again'}
        ])
    })

    it('ignores unknown conversation ids for load, send, and delete', () => {
        const {channel, userChat} = aUserChatFixture()

        run(userChat.selectConversation$({channel, conversationId: 'nope'}))
        run(userChat.sendUserMessage$({channel, conversationId: 'nope', text: 'hello'}))
        run(userChat.deleteConversation$({channel, conversationId: 'nope'}))

        expect(channel.loaded).toEqual([])
        expect(channel.sent).toEqual([])
        expect(channel.statuses).toEqual([])
        expect(channel.userMessages).toEqual([])
        expect(channel.deleted).toEqual([])
    })

    it('deletes one conversation or all conversations and reflects that in the store', () => {
        const {channel, userChat} = aUserChatFixture()
        run(userChat.createConversation$({channel}))
        run(userChat.createConversation$({channel}))

        run(userChat.deleteConversation$({channel, conversationId: 'conv-1'}))
        run(userChat.listConversations$({channel}))
        run(userChat.deleteAllConversations$({channel}))
        run(userChat.listConversations$({channel}))

        expect(channel.deleted).toEqual(['conv-1', 'conv-2'])
        expect(channel.lists).toEqual([[], []])
    })

    it('does not notify deletes when delete-all has no conversations', () => {
        const {channel, userChat} = aUserChatFixture()

        run(userChat.deleteAllConversations$({channel}))

        expect(channel.deleted).toEqual([])
    })

    it('removes persisted conversations from the store on delete-all and notifies the channel for each', () => {
        const {channel, userChat} = aUserChatFixture()
        run(userChat.createConversation$({channel}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hi'}))
        run(userChat.createConversation$({channel}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-2', text: 'hi'}))

        run(userChat.deleteAllConversations$({channel}))
        run(userChat.listConversations$({channel}))

        expect(channel.deleted).toEqual(['conv-1', 'conv-2'])
        expect(channel.lists.at(-1)).toEqual([])
    })

    it('stops an in-flight stream when its conversation is deleted', () => {
        const replies$ = new Subject()
        const llm = {respondTo$: () => replies$, receivedMessages: []}
        const {channel, userChat} = aUserChatFixture({llm})
        run(userChat.createConversation$({channel}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

        run(userChat.deleteConversation$({channel, conversationId: 'conv-1'}))
        replies$.next({textDelta: 'too late'})

        expect(channel.sent.filter(p => p.textDelta)).toEqual([])
    })

    it('can still build directly for tests that need a custom composition root', () => {
        const userChat = aUserChat()

        expect(userChat).toEqual(expect.objectContaining({
            createConversation$: expect.any(Function),
            sendUserMessage$: expect.any(Function)
        }))
    })
})
