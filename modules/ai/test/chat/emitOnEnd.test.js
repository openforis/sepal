const {EMPTY, Subject, of, throwError, concat, takeUntil} = require('rxjs')
const {emitOnEnd} = require('#mcp/chat/emitOnEnd')

describe('emitOnEnd', () => {

    const SENTINEL = {kind: 'end'}

    function capture(observable) {
        const events = []
        let completed = false
        let error = null
        const sub = observable.subscribe({
            next: v => events.push(v),
            complete: () => { completed = true },
            error: e => { error = e }
        })
        return {events, sub, get completed() { return completed }, get error() { return error }}
    }

    it('emits the terminal value once on natural completion, after upstream values', () => {
        const result = capture(of(1, 2, 3).pipe(emitOnEnd(SENTINEL)))

        expect(result.events).toEqual([1, 2, 3, SENTINEL])
        expect(result.completed).toBe(true)
    })

    it('emits the terminal value before erroring', () => {
        const result = capture(throwError(() => new Error('boom')).pipe(emitOnEnd(SENTINEL)))

        expect(result.events).toEqual([SENTINEL])
        expect(result.error).toBeInstanceOf(Error)
        expect(result.error.message).toBe('boom')
    })

    it('emits upstream values, then the terminal value, then errors', () => {
        const source$ = concat(of(1, 2), throwError(() => new Error('boom')))

        const result = capture(source$.pipe(emitOnEnd(SENTINEL)))

        expect(result.events).toEqual([1, 2, SENTINEL])
        expect(result.error).toBeInstanceOf(Error)
    })

    it('emits the terminal value on completion from a takeUntil-induced cancellation', () => {
        const upstream$ = new Subject()
        const stop$ = new Subject()

        const result = capture(upstream$.pipe(takeUntil(stop$), emitOnEnd(SENTINEL)))
        upstream$.next('one')
        stop$.next()

        expect(result.events).toEqual(['one', SENTINEL])
        expect(result.completed).toBe(true)
    })

    it('emits the terminal value on empty completion', () => {
        const result = capture(EMPTY.pipe(emitOnEnd(SENTINEL)))

        expect(result.events).toEqual([SENTINEL])
        expect(result.completed).toBe(true)
    })

    it('does not emit the terminal value until the source ends', () => {
        const source$ = new Subject()
        const result = capture(source$.pipe(emitOnEnd(SENTINEL)))

        source$.next('one')

        expect(result.events).toEqual(['one'])
    })
})
