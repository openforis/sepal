const {EMPTY} = require('rxjs')
const {aWsHandlerHarness} = require('../../harness')
const {alice} = require('./fixtures')

describe('context routing', () => {
    let handled, harness

    beforeEach(() => {
        handled = []
        harness = aWsHandlerHarness({
            userChatFor: () => ({handle$: args => { handled.push(args); return EMPTY }})
        })
    })

    it('forwards a context message to userChat with subscription identity', () => {
        harness.feed({event: 'subscriptionUp', ...alice})
        harness.feed({data: {type: 'context', guiContext: {section: 'process'}}, ...alice})

        expect(handled).toContainEqual(expect.objectContaining({
            type: 'context',
            clientId: 'c1',
            subscriptionId: 's1',
            guiContext: {section: 'process'}
        }))
    })

    it('routes clear-context to userChat on subscriptionDown', () => {
        harness.feed({event: 'subscriptionUp', ...alice})
        harness.feed({event: 'subscriptionDown', ...alice})

        expect(handled).toContainEqual(expect.objectContaining({
            type: 'clear-context',
            clientId: 'c1',
            subscriptionId: 's1'
        }))
    })
})
