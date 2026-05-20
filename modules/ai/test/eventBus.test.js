const {of, throwError} = require('rxjs')
const {createEventBus} = require('#mcp/eventBus')

describe('Event bus', () => {

    it('delivers published events to subscribers', () => {
        const bus = createEventBus()
        const received = []
        bus.events$.subscribe(event => received.push(event))

        bus.publish({type: 'something', payload: 42})

        expect(received).toEqual([{type: 'something', payload: 42}])
    })

    describe('track — Promise-shaped work', () => {

        function aBus({times = [100, 250], id = 'span-1'} = {}) {
            return createEventBus({clock: advancingClock(times), createId: () => id})
        }

        it('publishes a started event at debug level when the span begins', async () => {
            const events = []
            const bus = aBus({times: [100]})
            bus.events$.subscribe(e => events.push(e))

            await bus.track('test.op', {key: 'value'}, () => {})

            expect(events[0]).toMatchObject({
                type: 'test.op.started',
                name: 'test.op',
                correlationId: 'span-1',
                level: 'debug',
                at: 100,
                key: 'value',
                message: expect.stringMatching(/test\.op.*started.*key=value.*span-1/)
            })
        })

        it('publishes a completed event with durationMs', async () => {
            const events = []
            const bus = aBus()
            bus.events$.subscribe(e => events.push(e))

            await bus.track('test.op', {key: 'value'}, () => {})

            expect(events[1]).toMatchObject({
                type: 'test.op.completed',
                name: 'test.op',
                correlationId: 'span-1',
                level: 'info',
                at: 250,
                durationMs: 150,
                key: 'value',
                message: expect.stringMatching(/test\.op.*completed.*key=value.*span-1.*150ms/)
            })
        })

        it('publishes a failed event when work throws and re-throws the error', async () => {
            const events = []
            const bus = aBus()
            bus.events$.subscribe(e => events.push(e))

            await expect(
                bus.track('test.op', {key: 'value'}, () => { throw new Error('boom') })
            ).rejects.toThrow('boom')

            expect(events[1]).toMatchObject({
                type: 'test.op.failed',
                level: 'error',
                durationMs: 150,
                error: 'boom',
                message: expect.stringMatching(/test\.op.*failed.*span-1.*150ms.*boom/)
            })
        })

        it('returns the value produced by work', async () => {
            const bus = aBus({times: [0, 0]})

            const result = await bus.track('test.op', {}, () => 'hello')

            expect(result).toBe('hello')
        })

        it('formats messages without attrs cleanly when none are provided', async () => {
            const events = []
            const bus = aBus()
            bus.events$.subscribe(e => events.push(e))

            await bus.track('test.op', {}, () => {})

            expect(events[0].message).toMatch(/test\.op started \(span-1\)/)
            expect(events[0].message).not.toMatch(/ {2}|=/)
            expect(events[1].message).toMatch(/test\.op completed \(span-1\) in 150ms/)
            expect(events[1].message).not.toMatch(/ {2}|=/)
        })
    })

    describe('track$ — observable-shaped work', () => {

        function aBus({times = [100, 250], id = 'span-1'} = {}) {
            return createEventBus({clock: advancingClock(times), createId: () => id})
        }

        it('publishes a started event at debug on subscribe', () => {
            const bus = aBus({times: [100]})
            const events = []
            bus.events$.subscribe(e => events.push(e))

            bus.track$('test.op', {key: 'value'}, of('result')).subscribe()

            expect(events[0]).toMatchObject({
                type: 'test.op.started',
                level: 'debug',
                message: expect.stringMatching(/test\.op.*started.*key=value.*span-1/)
            })
        })

        it('publishes a completed event when the observable completes', () => {
            const bus = aBus()
            const events = []
            bus.events$.subscribe(e => events.push(e))

            bus.track$('test.op', {key: 'value'}, of('result')).subscribe()

            expect(events[1]).toMatchObject({
                type: 'test.op.completed',
                level: 'info',
                durationMs: 150,
                message: expect.stringMatching(/test\.op.*completed.*key=value.*span-1.*150ms/)
            })
        })

        it('publishes a failed event when the observable errors, and re-emits the error', () => {
            const bus = aBus()
            const events = []
            const errors = []
            bus.events$.subscribe(e => events.push(e))

            bus.track$('test.op', {key: 'value'}, throwError(() => new Error('boom')))
                .subscribe({error: e => errors.push(e)})

            expect(events[1]).toMatchObject({
                type: 'test.op.failed',
                level: 'error',
                durationMs: 150,
                error: 'boom',
                message: expect.stringMatching(/test\.op.*failed.*span-1.*150ms.*boom/)
            })
            expect(errors[0].message).toBe('boom')
        })

        it('passes the wrapped values through to the subscriber', () => {
            const bus = aBus({times: [0, 0]})
            const values = []

            bus.track$('test.op', {}, of('a', 'b')).subscribe(v => values.push(v))

            expect(values).toEqual(['a', 'b'])
        })
    })
})

function advancingClock(times) {
    let i = 0
    return {now: () => times[i++]}
}
