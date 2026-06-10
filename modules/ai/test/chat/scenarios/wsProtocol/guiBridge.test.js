import {aWsHandlerHarness} from '../../harness.js'
import {alice} from './fixtures.js'

describe('GUI bridge', () => {

    it('routes a gui-response to guiRequests.respond scoped to the responding subscription', () => {
        const harness = aWsHandlerHarness()

        harness.feed({event: 'subscriptionUp', ...alice})
        harness.feed({
            data: {type: 'gui-response', requestId: 'req-1', success: true, data: {echoed: 'hi'}},
            ...alice
        })

        expect(harness.guiRequests.respondCalls).toEqual([{
            clientId: 'c1', subscriptionId: 's1',
            requestId: 'req-1', success: true, data: {echoed: 'hi'}
        }])
    })

    it('cancels pending GUI requests for a subscription on subscriptionDown without creating a subscription', () => {
        const harness = aWsHandlerHarness()

        harness.feed({event: 'subscriptionDown', ...alice})

        expect(harness.guiRequests.cancelCalls).toEqual([{clientId: 'c1', subscriptionId: 's1'}])
        expect(harness.sent.filter(frame => frame.data?.type === 'conversations')).toEqual([])
    })
})
