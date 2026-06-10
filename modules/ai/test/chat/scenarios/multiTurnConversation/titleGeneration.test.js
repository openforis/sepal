import {aControllableLlm, aStallingTitleGenerator, aUserChatHarness, eventsOfKind, firstValue, run} from '../../harness.js'

describe('title generation', () => {

    describe('after a known-conversation turn', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [
                    {text: 'Use the change-detection recipe.'},
                    {text: 'NDVI change Kenya'}
                ],
                titleGenerator: 'real'
            })
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({
                type: 'message', conversationId: 'conv-1',
                text: 'How do I detect NDVI change in Kenya?'
            }))
        })

        it('broadcasts a conversation-updated event with the generated title', () => {
            expect(eventsOfKind(harness.channelEvents, 'conversation-updated')).toEqual([
                {kind: 'conversation-updated', targeting: 'broadcast',
                    payload: {conversationId: 'conv-1', title: 'NDVI change Kenya'}}
            ])
        })

        it('persists the generated title on the conversation metadata', async () => {
            const stored = await firstValue(harness.conversationsStore.get$('conv-1'))
            expect(stored.title).toBe('NDVI change Kenya')
        })
    })

    describe('after an unknown-conversation message', () => {
        it('emits no conversation-updated event for the unknown id', () => {
            const harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{text: 'NDVI change Kenya'}],
                titleGenerator: 'real'
            })

            run(harness.handle$({type: 'message', conversationId: 'nope', text: 'ignored'}))

            expect(eventsOfKind(harness.channelEvents, 'conversation-updated')).toEqual([])
        })
    })

    describe('while a previous title is still generating', () => {
        it('does not hold the second turn behind it', () => {
            const llm = aControllableLlm()
            const harness = aUserChatHarness({
                conversationIds: ['conv-1'], llm,
                titleGenerator: aStallingTitleGenerator()
            })
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'first'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'second'}))

            llm.calls[0].subject.next({textDelta: 'reply one'})
            llm.calls[0].subject.complete()

            expect(llm.calls).toHaveLength(2)
        })
    })
})
