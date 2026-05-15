const {aControllableLlm, run} = require('../builders')
const {aUserChatFixture} = require('./userChatHarness')

describe('UserChat turn queue', () => {

    it('serializes turns for one conversation and gives the second turn the completed first-turn history', () => {
        const llm = aControllableLlm()
        const {channel, userChat} = aUserChatFixture({llm})
        run(userChat.createConversation$({channel}))

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'first'}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'second'}))
        expect(llm.calls).toHaveLength(1)

        llm.calls[0].subject.next({textDelta: 'reply one'})
        llm.calls[0].subject.complete()

        expect(llm.calls).toHaveLength(2)
        expect(llm.calls[1].messages).toEqual([
            {role: 'user', content: 'first'},
            {role: 'assistant', content: 'reply one'},
            {role: 'user', content: 'second'}
        ])
    })

    it('runs turns for different conversations independently', () => {
        const llm = aControllableLlm()
        const {channel, userChat} = aUserChatFixture({llm})
        run(userChat.createConversation$({channel}))
        run(userChat.createConversation$({channel}))

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'to one'}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-2', text: 'to two'}))

        expect(llm.calls).toHaveLength(2)
    })
})
