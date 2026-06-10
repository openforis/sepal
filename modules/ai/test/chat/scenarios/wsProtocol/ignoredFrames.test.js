import {aWsHandlerHarness} from '../../harness.js'
import {alice} from './fixtures.js'

describe('ignored frames', () => {
    let harness
    beforeEach(() => {
        harness = aWsHandlerHarness()
    })

    it('ignores a heartbeat frame: no dispatch, recorded as heartbeat', () => {
        harness.feed({hb: 1, ...alice})

        expect(harness.sent.filter(frame => frame.data)).toEqual([])
        expect(harness.bus.events).toContainEqual(
            expect.objectContaining({type: 'wsIn', kind: 'ignored', reason: 'heartbeat'})
        )
    })

    it('ignores a foreign gateway event: no dispatch, recorded as gatewayEvent', () => {
        harness.feed({event: 'subscriptionError', ...alice})

        expect(harness.sent.filter(frame => frame.data)).toEqual([])
        expect(harness.bus.events).toContainEqual(
            expect.objectContaining({type: 'wsIn', kind: 'ignored', reason: 'gatewayEvent', event: 'subscriptionError'})
        )
    })

    it('ignores an empty data frame: no dispatch, recorded as empty', () => {
        harness.feed({data: {}, ...alice})

        expect(harness.sent.filter(frame => frame.data)).toEqual([])
        expect(harness.bus.events).toContainEqual(
            expect.objectContaining({type: 'wsIn', kind: 'ignored', reason: 'empty'})
        )
    })
})
