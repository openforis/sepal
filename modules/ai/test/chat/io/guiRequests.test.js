const {Subject} = require('rxjs')
const {createGuiRequests} = require('#mcp/chat/io/guiRequests')

describe('GUI request bridge', () => {

    const fromC1S1 = {clientId: 'c1', subscriptionId: 's1'}

    function aControlledClock() {
        const timeout$ = new Subject()
        return {clock: {delay$: () => timeout$}, fireTimeout: () => timeout$.next(0)}
    }

    function aFakeChannel() {
        const guiActions = []
        return {guiAction: message => guiActions.push(message), guiActions}
    }

    function sequentialIds(ids) {
        let i = 0
        return () => ids[Math.min(i++, ids.length - 1)]
    }

    function capture(observable) {
        const events = []
        let completed = false
        let error = null
        observable.subscribe({
            next: value => events.push(value),
            complete: () => { completed = true },
            error: e => { error = e }
        })
        return {events, get completed() { return completed }, get error() { return error }}
    }

    let channel, clock, fireTimeout, guiRequests

    beforeEach(() => {
        channel = aFakeChannel()
        const controlled = aControlledClock()
        clock = controlled.clock
        fireTimeout = controlled.fireTimeout
        guiRequests = createGuiRequests({clock, createId: sequentialIds(['req-1', 'req-2']), timeoutMs: 30000})
    })

    function request(overrides = {}) {
        return guiRequests.request$({
            channel, ...fromC1S1, action: 'echo', params: {text: 'hi'}, ...overrides
        })
    }

    function respond(overrides = {}) {
        guiRequests.respond({...fromC1S1, requestId: 'req-1', ...overrides})
    }

    it('sends a targeted gui-action with a generated requestId', () => {
        capture(request())

        expect(channel.guiActions).toEqual([{requestId: 'req-1', action: 'echo', params: {text: 'hi'}}])
    })

    it('resolves the request with the data from the matching gui-response', () => {
        const result = capture(request())

        respond({success: true, data: {echoed: 'hi'}})

        expect(result.events).toEqual([{echoed: 'hi'}])
        expect(result.completed).toBe(true)
    })

    it('errors the request when the GUI responds with a failure', () => {
        const result = capture(request())

        respond({success: false, error: {message: 'panel not found'}})

        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toMatch(/panel not found/i)
    })

    it('ignores a response with an unknown requestId', () => {
        const result = capture(request())

        respond({requestId: 'other', success: true, data: {}})

        expect(result.events).toEqual([])
        expect(result.completed).toBe(false)
    })

    it('ignores a response from a different subscriptionId than the one the request was sent to', () => {
        const result = capture(request())

        respond({subscriptionId: 's2', success: true, data: {echoed: 'hi'}})

        expect(result.events).toEqual([])
        expect(result.completed).toBe(false)
    })

    it('ignores a response from a different clientId than the one the request was sent to', () => {
        const result = capture(request())

        respond({clientId: 'c2', success: true, data: {echoed: 'hi'}})

        expect(result.events).toEqual([])
        expect(result.completed).toBe(false)
    })

    it('ignores a response that arrives after the request already resolved', () => {
        const result = capture(request())

        respond({success: true, data: {first: true}})
        respond({success: true, data: {second: true}})

        expect(result.events).toEqual([{first: true}])
    })

    it('errors the request when it times out', () => {
        const result = capture(request())

        fireTimeout()

        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toMatch(/timed out/i)
    })

    it('errors pending requests for a subscription when that subscription is cancelled', () => {
        const result = capture(request())

        guiRequests.cancelForSubscription(fromC1S1)

        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toMatch(/cancel/i)
    })

    it('does not cancel requests belonging to a different subscription', () => {
        const result = capture(request())

        guiRequests.cancelForSubscription({clientId: 'c1', subscriptionId: 's2'})

        expect(result.error).toBeNull()
        expect(result.completed).toBe(false)
    })
})
