const {Subject} = require('rxjs')
const {createGuiRequests} = require('#mcp/chat/guiRequests')
const {emitChannel, guiAction} = require('#mcp/chat/channelEvents')

describe('GUI request bridge — request lifecycle', () => {

    const fromC1S1 = {clientId: 'c1', subscriptionId: 's1'}
    const guiActionEmission = emitChannel(guiAction({requestId: 'req-1', action: 'echo', params: {text: 'hi'}}))

    function aControlledClock() {
        const timeout$ = new Subject()
        return {clock: {delay$: () => timeout$}, fireTimeout: () => timeout$.next(0)}
    }

    function aFakeBus() {
        const events = []
        return {publish: event => events.push(event), events}
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

    let fireTimeout, guiRequests

    beforeEach(() => {
        const controlled = aControlledClock()
        fireTimeout = controlled.fireTimeout
        guiRequests = createGuiRequests({
            clock: controlled.clock,
            createId: sequentialIds(['req-1', 'req-2']),
            timeoutMs: 30000,
            bus: aFakeBus()
        })
    })

    function request(overrides = {}) {
        return guiRequests.request$({
            ...fromC1S1, action: 'echo', params: {text: 'hi'}, ...overrides
        })
    }

    function respond(overrides = {}) {
        guiRequests.respond({...fromC1S1, requestId: 'req-1', ...overrides})
    }

    it('emits a targeted gui-action channel event as the first emission', () => {
        const result = capture(request())

        expect(result.events).toEqual([guiActionEmission])
    })

    it('emits the response data after the gui-action event when the matching gui-response arrives', () => {
        const result = capture(request())

        respond({success: true, data: {echoed: 'hi'}})

        expect(result.events).toEqual([guiActionEmission, {echoed: 'hi'}])
        expect(result.completed).toBe(true)
    })

    it('errors the request when the GUI responds with a failure', () => {
        const result = capture(request())

        respond({success: false, error: {message: 'panel not found'}})

        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toMatch(/panel not found/i)
    })

    it('preserves a plain-string error message from the GUI (not just object-shaped errors)', () => {
        const result = capture(request())

        respond({success: false, error: 'Recipe not found: r1'})

        expect(result.error.message).toBe('Recipe not found: r1')
    })

    it('preserves a structured error code from the GUI so callers can map to specific tool-result envelopes', () => {
        const result = capture(request())

        respond({success: false, error: {code: 'RECIPE_NOT_FOUND', message: 'Recipe not found: r1'}})

        expect(result.error.message).toBe('Recipe not found: r1')
        expect(result.error.code).toBe('RECIPE_NOT_FOUND')
    })

    it('ignores a response with an unknown requestId', () => {
        const result = capture(request())

        respond({requestId: 'other', success: true, data: {}})

        expect(result.events).toEqual([guiActionEmission])
        expect(result.completed).toBe(false)
    })

    it('ignores a response from a different subscriptionId than the one the request was sent to', () => {
        const result = capture(request())

        respond({subscriptionId: 's2', success: true, data: {echoed: 'hi'}})

        expect(result.events).toEqual([guiActionEmission])
        expect(result.completed).toBe(false)
    })

    it('ignores a response from a different clientId than the one the request was sent to', () => {
        const result = capture(request())

        respond({clientId: 'c2', success: true, data: {echoed: 'hi'}})

        expect(result.events).toEqual([guiActionEmission])
        expect(result.completed).toBe(false)
    })

    it('ignores a response that arrives after the request already resolved', () => {
        const result = capture(request())

        respond({success: true, data: {first: true}})
        respond({success: true, data: {second: true}})

        expect(result.events).toEqual([guiActionEmission, {first: true}])
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
