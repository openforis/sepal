const {alice, aHandler, captureSent} = require('./wsHandlerHarness')

describe('Chat WS handler — GUI request/response bridge', () => {

    it('routes a gui-response to the request bridge, scoped to the responding subscription', () => {
        const responses = []
        const guiRequests = {respond: response => responses.push(response), cancelForSubscription: () => {}}
        const {arg$} = captureSent(aHandler({guiRequests}))

        arg$.next({event: 'subscriptionUp', ...alice})
        arg$.next({data: {type: 'gui-response', requestId: 'req-1', success: true, data: {echoed: 'hi'}}, ...alice})

        expect(responses).toEqual([{
            clientId: 'c1', subscriptionId: 's1',
            requestId: 'req-1', success: true, data: {echoed: 'hi'}
        }])
    })

    it('cancels pending GUI requests for a subscription on subscriptionDown', () => {
        const cancels = []
        const guiRequests = {respond: () => {}, cancelForSubscription: subscription => cancels.push(subscription)}
        const {arg$} = captureSent(aHandler({guiRequests}))

        arg$.next({event: 'subscriptionUp', ...alice})
        arg$.next({event: 'subscriptionDown', ...alice})

        expect(cancels).toEqual([{clientId: 'c1', subscriptionId: 's1'}])
    })
})
