const {of, throwError} = require('rxjs')
const {createTracer} = require('#mcp/tracer')

describe('Tracer', () => {

    it('publishes a started event at debug level when the span begins', async () => {
        const events = []
        const tracer = createTracer({
            bus: {publish: event => events.push(event)},
            clock: {now: () => 100},
            createId: () => 'span-1'
        })

        await tracer.span('test.op', {key: 'value'}, () => {})

        expect(events[0]).toEqual({
            type: 'test.op.started',
            name: 'test.op',
            correlationId: 'span-1',
            level: 'debug',
            message: 'test.op started key=value (span-1)',
            at: 100,
            key: 'value'
        })
    })

    it('publishes a completed event with durationMs and a level + message', async () => {
        const events = []
        const tracer = createTracer({
            bus: {publish: event => events.push(event)},
            clock: advancingClock([100, 250]),
            createId: () => 'span-1'
        })

        await tracer.span('test.op', {key: 'value'}, () => {})

        expect(events[1]).toEqual({
            type: 'test.op.completed',
            name: 'test.op',
            correlationId: 'span-1',
            level: 'info',
            message: 'test.op completed key=value (span-1) in 150ms',
            at: 250,
            durationMs: 150,
            key: 'value'
        })
    })

    it('publishes a failed event at error level with the error in the message', async () => {
        const events = []
        const tracer = createTracer({
            bus: {publish: event => events.push(event)},
            clock: advancingClock([100, 250]),
            createId: () => 'span-1'
        })

        await expect(
            tracer.span('test.op', {key: 'value'}, () => { throw new Error('boom') })
        ).rejects.toThrow('boom')

        expect(events[1]).toEqual({
            type: 'test.op.failed',
            name: 'test.op',
            correlationId: 'span-1',
            level: 'error',
            message: 'test.op failed key=value (span-1) in 150ms: boom',
            at: 250,
            durationMs: 150,
            error: 'boom',
            key: 'value'
        })
    })

    it('returns the value produced by work', async () => {
        const tracer = createTracer({
            bus: {publish: () => {}},
            clock: {now: () => 0},
            createId: () => 'span-1'
        })

        const result = await tracer.span('test.op', {}, () => 'hello')

        expect(result).toBe('hello')
    })

    it('formats messages without attrs cleanly when none are provided', async () => {
        const events = []
        const tracer = createTracer({
            bus: {publish: event => events.push(event)},
            clock: advancingClock([100, 250]),
            createId: () => 'span-1'
        })

        await tracer.span('test.op', {}, () => {})

        expect(events[0].message).toBe('test.op started (span-1)')
        expect(events[1].message).toBe('test.op completed (span-1) in 150ms')
    })

    describe('span$ wrapping an observable', () => {

        it('publishes a started event at debug on subscribe', () => {
            const events = []
            const tracer = createTracer({
                bus: {publish: event => events.push(event)},
                clock: {now: () => 100},
                createId: () => 'span-1'
            })

            tracer.span$('test.op', {key: 'value'}, of('result')).subscribe()

            expect(events[0]).toMatchObject({
                type: 'test.op.started',
                level: 'debug',
                message: 'test.op started key=value (span-1)'
            })
        })

        it('publishes a completed event when the observable completes', () => {
            const events = []
            const tracer = createTracer({
                bus: {publish: event => events.push(event)},
                clock: advancingClock([100, 250]),
                createId: () => 'span-1'
            })

            tracer.span$('test.op', {key: 'value'}, of('result')).subscribe()

            expect(events[1]).toMatchObject({
                type: 'test.op.completed',
                level: 'info',
                message: 'test.op completed key=value (span-1) in 150ms',
                durationMs: 150
            })
        })

        it('publishes a failed event when the observable errors, and re-emits the error', () => {
            const events = []
            const errors = []
            const tracer = createTracer({
                bus: {publish: event => events.push(event)},
                clock: advancingClock([100, 250]),
                createId: () => 'span-1'
            })

            tracer.span$('test.op', {key: 'value'}, throwError(() => new Error('boom')))
                .subscribe({error: e => errors.push(e)})

            expect(events[1]).toMatchObject({
                type: 'test.op.failed',
                level: 'error',
                message: 'test.op failed key=value (span-1) in 150ms: boom',
                error: 'boom'
            })
            expect(errors[0].message).toBe('boom')
        })

        it('passes the wrapped values through to the subscriber', () => {
            const tracer = createTracer({
                bus: {publish: () => {}},
                clock: {now: () => 0},
                createId: () => 'span-1'
            })
            const values = []

            tracer.span$('test.op', {}, of('a', 'b')).subscribe(v => values.push(v))

            expect(values).toEqual(['a', 'b'])
        })
    })
})

function advancingClock(times) {
    let i = 0
    return {now: () => times[i++]}
}
