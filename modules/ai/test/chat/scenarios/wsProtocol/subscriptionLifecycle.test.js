import {aWsHandlerHarness} from '../../harness.js'
import {alice} from './fixtures.js'

describe('subscription lifecycle', () => {

    it('drops chat messages that arrive before subscriptionUp', () => {
        const harness = aWsHandlerHarness()

        harness.feed({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

        expect(harness.sent.filter(frame => frame.data?.type === 'chat-response')).toEqual([])
    })

    it('drops chat messages that arrive after subscriptionDown', () => {
        const harness = aWsHandlerHarness()

        harness.feed({event: 'subscriptionUp', ...alice})
        harness.feed({data: {type: 'create-conversation'}, ...alice})
        harness.feed({event: 'subscriptionDown', ...alice})
        harness.feed({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

        expect(harness.sent.filter(frame => frame.data?.type === 'chat-response')).toEqual([])
    })

    it('recovers a missing subscription and routes a data message when the conversation persists', () => {
        const conversationsStore = aWsHandlerHarness().conversationsStore
        const first = aWsHandlerHarness({conversationsStore, replies: [{text: 'First reply'}]})
        first.feed({event: 'subscriptionUp', ...alice})
        first.feed({data: {type: 'create-conversation'}, ...alice})
        first.feed({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

        const recovered = aWsHandlerHarness({conversationsStore, replies: [{text: 'Recovered reply'}]})
        recovered.feed({data: {type: 'message', conversationId: 'conv-1', text: 'Again'}, ...alice})

        expect(recovered.sent.filter(frame => frame.data?.type === 'chat-response')).toEqual([
            {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', text: 'Recovered reply'}},
            {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', complete: true}}
        ])
        expect(recovered.bus.events.filter(event => event.type === 'wsSubscriptionRecovered')).toHaveLength(1)
    })
})
