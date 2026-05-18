const {Subject} = require('rxjs')
const {createGuiRequests} = require('#mcp/chat/guiRequests')

describe('GUI request bridge — routing diagnostics', () => {

    const fromC1S1 = {clientId: 'c1', subscriptionId: 's1'}

    function aFakeBus() {
        const events = []
        return {publish: event => events.push(event), events}
    }

    function sequentialIds(ids) {
        let i = 0
        return () => ids[Math.min(i++, ids.length - 1)]
    }

    let bus, guiRequests

    beforeEach(() => {
        bus = aFakeBus()
        guiRequests = createGuiRequests({
            clock: {delay$: () => new Subject()},
            createId: sequentialIds(['req-1']),
            timeoutMs: 30000,
            bus
        })
    })

    function request() {
        return guiRequests.request$({...fromC1S1, action: 'echo', params: {text: 'hi'}})
    }

    function respond(overrides = {}) {
        guiRequests.respond({...fromC1S1, requestId: 'req-1', ...overrides})
    }

    function send(observable) {
        observable.subscribe({next: () => {}, error: () => {}, complete: () => {}})
    }

    it('publishes a gui.request event when a request is sent', () => {
        send(request())

        expect(bus.events).toContainEqual(expect.objectContaining({
            type: 'gui.request', level: 'debug',
            requestId: 'req-1', action: 'echo', subscriptionKey: 'c1:s1'
        }))
    })

    it('publishes a gui.response event marking a matching response as found and matched', () => {
        send(request())

        respond({success: true, data: {}})

        expect(bus.events).toContainEqual(expect.objectContaining({
            type: 'gui.response', level: 'debug',
            requestId: 'req-1', action: 'echo',
            owningSubscriptionKey: 'c1:s1', incomingSubscriptionKey: 'c1:s1',
            pendingFound: true, matched: true
        }))
    })

    it('publishes a gui.response event marking a subscription mismatch as found-but-unmatched', () => {
        send(request())

        respond({subscriptionId: 's2', success: true, data: {}})

        expect(bus.events).toContainEqual(expect.objectContaining({
            type: 'gui.response',
            requestId: 'req-1',
            owningSubscriptionKey: 'c1:s1', incomingSubscriptionKey: 'c1:s2',
            pendingFound: true, matched: false
        }))
    })

    it('publishes a gui.response event marking an unknown requestId as not found', () => {
        send(request())

        respond({requestId: 'other', success: true, data: {}})

        expect(bus.events).toContainEqual(expect.objectContaining({
            type: 'gui.response',
            requestId: 'other',
            pendingFound: false, matched: false
        }))
    })
})
