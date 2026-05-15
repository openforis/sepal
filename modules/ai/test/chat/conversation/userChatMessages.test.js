const {aControllableTitleGenerator, aFakeTitleGenerator, run} = require('../builders')
const {aUserChatFixture} = require('./userChatHarness')

describe('UserChat message turns', () => {

    it('locks the conversation, broadcasts the user message, streams the reply, and completes', () => {
        const {channel, userChat} = aUserChatFixture()
        run(userChat.createConversation$({channel}))

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

        expect(channel.statuses).toEqual(['conv-1'])
        expect(channel.userMessages).toEqual([{conversationId: 'conv-1', text: 'hello'}])
        expect(channel.sent).toEqual([
            {conversationId: 'conv-1', textDelta: 'Hi!'},
            {conversationId: 'conv-1', complete: true}
        ])
    })

    it('runs title generation after a known conversation turn only', () => {
        const titleGenerator = aFakeTitleGenerator()
        const {channel, userChat} = aUserChatFixture({titleGenerator})
        run(userChat.createConversation$({channel}))

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))
        run(userChat.sendUserMessage$({channel, conversationId: 'nope', text: 'ignored'}))

        expect(titleGenerator.afterTurns).toHaveLength(1)
        expect(titleGenerator.afterTurns[0]).toMatchObject({
            conversationId: 'conv-1',
            userText: 'hello'
        })
    })

    it('does not hold the next turn behind title generation', () => {
        const llm = require('../builders').aControllableLlm()
        const titleGenerator = aControllableTitleGenerator()
        const {channel, userChat} = aUserChatFixture({llm, titleGenerator})
        run(userChat.createConversation$({channel}))

        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'first'}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'second'}))
        llm.calls[0].subject.next({textDelta: 'reply one'})
        llm.calls[0].subject.complete()

        expect(titleGenerator.calls).toHaveLength(1)
        expect(llm.calls).toHaveLength(2)
    })
})
