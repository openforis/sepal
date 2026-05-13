const {createEventBus} = require('#mcp/eventBus')

describe('Event bus', () => {

    it('delivers published events to subscribers', () => {
        const bus = createEventBus()
        const received = []
        bus.events$.subscribe(event => received.push(event))

        bus.publish({type: 'something', payload: 42})

        expect(received).toEqual([{type: 'something', payload: 42}])
    })
})
