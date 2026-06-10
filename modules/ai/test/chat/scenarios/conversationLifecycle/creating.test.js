import {aUserChatHarness, eventsOfKind, firstValue, run} from '../../harness.js'
import {ISO_T1} from './fixtures.js'

describe('when creating a conversation', () => {
    let harness
    beforeEach(() => {
        harness = aUserChatHarness({conversationIds: ['conv-1']})
    })

    it('emits a targeted conversation-created event with the pending metadata', () => {
        run(harness.handle$({type: 'create-conversation'}))

        expect(eventsOfKind(harness.channelEvents, 'conversation-created')).toEqual([{
            kind: 'conversation-created',
            targeting: 'targeted',
            payload: {conversationId: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
        }])
    })

    it('claims the new conversation for sibling tabs via a broadcast-except event', () => {
        run(harness.handle$({type: 'create-conversation'}))

        expect(eventsOfKind(harness.channelEvents, 'conversation-claimed')).toEqual([{
            kind: 'conversation-claimed',
            targeting: 'broadcastExcept',
            payload: {conversationId: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
        }])
    })

    it('does not persist the conversation until the user sends its first message', async () => {
        run(harness.handle$({type: 'create-conversation'}))

        const persisted = await firstValue(harness.conversationsStore.list$())
        expect(persisted).toEqual([])
    })
})
