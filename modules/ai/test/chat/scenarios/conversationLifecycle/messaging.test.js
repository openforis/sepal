import {anAdvancingClock, aUserChatHarness, eventsOfKind, firstValue, run} from '../../harness.js'
import {ISO_T1, ISO_T2, T1, T2} from './fixtures.js'

describe('conversation messaging and listing', () => {

    describe('when sending a first user message in a pending conversation', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{text: 'Hi!'}]
            })
        })

        it('persists the conversation metadata in the store', async () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi'}))

            const persisted = await firstValue(harness.conversationsStore.list$())
            expect(persisted).toEqual([
                {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
            ])
        })

        it('records the user message and assistant reply in the conversation history', async () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi'}))

            const stored = await firstValue(harness.historyFor('conv-1').load$())
            expect(stored).toEqual([
                {role: 'user', content: 'hi'},
                {role: 'assistant', content: 'Hi!'}
            ])
        })
    })

    describe('when a persisted conversation receives a subsequent message', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1'],
                replies: [{text: 'Hi!'}, {text: 'Hi again!'}],
                clock: anAdvancingClock([T1, T2])
            })
        })

        it('touches updatedAt on the persisted metadata', async () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi'}))

            const persisted = await firstValue(harness.conversationsStore.list$())
            expect(persisted).toEqual([
                {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T2}
            ])
        })
    })

    describe('when listing conversations after several persisted turns', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({
                conversationIds: ['conv-1', 'conv-2'],
                replies: [{text: 'Hi!'}]
            })
        })

        it('emits a targeted conversations event with every persisted conversation', () => {
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hi'}))
            run(harness.handle$({type: 'create-conversation'}))
            run(harness.handle$({type: 'message', conversationId: 'conv-2', text: 'hi'}))
            run(harness.handle$({type: 'list-conversations'}))

            expect(eventsOfKind(harness.channelEvents, 'conversations')).toEqual([{
                kind: 'conversations',
                targeting: 'targeted',
                payload: {conversations: [
                    {id: 'conv-1', title: '', createdAt: ISO_T1, updatedAt: ISO_T1},
                    {id: 'conv-2', title: '', createdAt: ISO_T1, updatedAt: ISO_T1}
                ]}
            }])
        })
    })

    describe('when commands target an unknown conversation id', () => {
        let harness
        beforeEach(() => {
            harness = aUserChatHarness({conversationIds: ['conv-1']})
        })

        it('emits no channel events for select / message / delete on an unknown id', () => {
            run(harness.handle$({type: 'select-conversation', conversationId: 'nope'}))
            run(harness.handle$({type: 'message', conversationId: 'nope', text: 'hello'}))
            run(harness.handle$({type: 'delete-conversation', conversationId: 'nope'}))

            expect(harness.channelEvents).toEqual([])
        })
    })
})
