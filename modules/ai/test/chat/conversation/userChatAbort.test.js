const {Subject} = require('rxjs')
const {run} = require('../builders')
const {aUserChatFixture} = require('./userChatHarness')

describe('UserChat abort', () => {

    it('completes the channel and drops later LLM events for an in-flight stream', () => {
        const replies$ = new Subject()
        const llm = {respondTo$: () => replies$, receivedMessages: []}
        const {channel, userChat} = aUserChatFixture({llm})
        run(userChat.createConversation$({channel}))
        run(userChat.sendUserMessage$({channel, conversationId: 'conv-1', text: 'hello'}))

        run(userChat.abort$({conversationId: 'conv-1'}))
        replies$.next({textDelta: 'too late'})

        expect(channel.sent).toContainEqual({conversationId: 'conv-1', complete: true})
        expect(channel.sent.filter(p => p.textDelta)).toEqual([])
    })

    it('is a no-op when there is no in-flight stream', () => {
        const {channel, userChat} = aUserChatFixture()
        run(userChat.createConversation$({channel}))

        run(userChat.abort$({conversationId: 'conv-1'}))

        expect(channel.sent).toEqual([])
    })
})
