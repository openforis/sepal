import {Observable} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {ObservationRegistry} from './observationRegistry'

// What the observation registry shares and keeps, by identity alone: which requests go to Earth Engine, which answers
// are reused, and for how long. Whether evidence is current is a fact the test sets; the clock moves when it says so.

describe('requests with the same identity', () => {
    it('share one request while it is in flight', () => {
        const earthEngine = registryOver()
        const [first, second] = [earthEngine.observe(KEY), earthEngine.observe(KEY)]

        earthEngine.answer(BANDS)

        expect(earthEngine.requests).toHaveLength(1)
        expect([first.bands(), second.bands()]).toEqual([BANDS, BANDS])
    })

    it('keep the request running for one when the other leaves, and cancel it once nobody waits', () => {
        const earthEngine = registryOver()
        const [first, second] = [earthEngine.observe(KEY), earthEngine.observe(KEY)]

        first.leave()
        expect(earthEngine.requests[0].cancelled).toBe(false)
        second.leave()

        expect(earthEngine.requests[0].cancelled).toBe(true)
    })

    it('are answered from a kept answer, asking nothing', () => {
        const earthEngine = registryOver()
        earthEngine.observe(KEY)
        earthEngine.answer(BANDS)

        const later = earthEngine.observe(KEY)

        expect(earthEngine.requests).toHaveLength(1)
        expect(later.bands()).toEqual(BANDS)
    })
})

describe('requests with different identities', () => {
    it('never share', () => {
        const earthEngine = registryOver()

        earthEngine.observe(KEY)
        earthEngine.observe({...KEY, dependencies: [{id: 'mosaic-1', revision: 8, listed: true, agreement: 'AGREED'}]})

        expect(earthEngine.requests).toHaveLength(2)
    })
})

describe('an answer', () => {
    it('is not kept over incomplete evidence', () => {
        const earthEngine = registryOver()
        earthEngine.observe(KEY, {complete: false})
        earthEngine.answer(BANDS)

        earthEngine.observe(KEY, {complete: false})

        expect(earthEngine.requests).toHaveLength(2)
    })

    it('reaches who waits but is not kept once its evidence was superseded while it was asked for', () => {
        const earthEngine = registryOver()
        const waiting = earthEngine.observe(KEY)
        earthEngine.supersede()

        earthEngine.answer(BANDS)
        earthEngine.observe(KEY)

        expect(waiting.bands()).toEqual(BANDS)
        expect(earthEngine.requests).toHaveLength(2)
    })

    it('is never kept when it failed', () => {
        const earthEngine = registryOver()
        const waiting = earthEngine.observe(KEY)
        earthEngine.fail(new Error('unreachable'))

        earthEngine.observe(KEY)

        expect(waiting.error().message).toBe('unreachable')
        expect(earthEngine.requests).toHaveLength(2)
    })

    it('in flight when everything kept is cleared still reaches who waits, and is not kept', () => {
        const earthEngine = registryOver()
        const waiting = earthEngine.observe(KEY)
        earthEngine.registry.clear()

        earthEngine.answer(BANDS)
        earthEngine.observe(KEY)

        expect(waiting.bands()).toEqual(BANDS)
        expect(earthEngine.requests).toHaveLength(2)
    })
})

describe('reuse', () => {
    it('ends a minute after the answer was last used', () => {
        const earthEngine = registryOver()
        earthEngine.observe(KEY)
        earthEngine.answer(BANDS)
        earthEngine.advance(59000)
        earthEngine.observe(KEY)

        earthEngine.advance(60000)
        earthEngine.observe(KEY)

        expect(earthEngine.requests).toHaveLength(2)
    })

    // Cleanup is late or lost; reuse is decided when asked.
    it('ends a minute after last use even before its cleanup has run', () => {
        const earthEngine = registryOver()
        earthEngine.observe(KEY)
        earthEngine.answer(BANDS)

        earthEngine.advanceWithoutTimers(60000)
        earthEngine.observe(KEY)

        expect(earthEngine.requests).toHaveLength(2)
    })

    it('ends once what it was observed from is superseded', () => {
        const earthEngine = registryOver()
        earthEngine.observe(KEY)
        earthEngine.answer(BANDS)

        earthEngine.supersede()
        earthEngine.observe(KEY)

        expect(earthEngine.requests).toHaveLength(2)
    })

    it('ends five minutes after the answer was observed, however often it is used', () => {
        const earthEngine = registryOver()
        earthEngine.observe(KEY)
        earthEngine.answer(BANDS)
        for (let used = 1; used < 6; used++) {
            earthEngine.advance(50000)
            earthEngine.observe(KEY)
        }
        expect(earthEngine.requests).toHaveLength(1)

        earthEngine.advance(50000)
        earthEngine.observe(KEY)

        expect(earthEngine.requests).toHaveLength(2)
    })

    it('keeps at most the configured number of answers, dropping the least recently used', () => {
        const earthEngine = registryOver({maxUnclaimed: 2})
        const keys = ['a', 'b', 'c'].map(id => ({...KEY, reference: {type: 'RECIPE_REF', id}}))
        keys.forEach(key => {
            earthEngine.observe(key)
            earthEngine.answer(BANDS)
            earthEngine.advance(1)
        })

        earthEngine.observe(keys[1])
        earthEngine.observe(keys[0])

        expect(earthEngine.requests.map(({request}) => request.id)).toEqual(['a', 'b', 'c', 'a'])
    })
})

const KEY = {
    observes: null,
    reference: {type: 'RECIPE_REF', id: 'band-math-1'},
    submitted: {id: 'band-math-1', type: 'BAND_MATH', model: {}},
    dependencies: [{id: 'mosaic-1', revision: 7, listed: true, agreement: 'AGREED'}],
    assets: [],
    credentials: 1
}

const BANDS = [{name: 'elevation', arrayDimensions: 0}]

// A registry over a fake Earth Engine that answers the latest request when told to.
const registryOver = ({maxUnclaimed = 64} = {}) => {
    let now = 0
    let timers = []
    let current = true
    const requests = []
    const registry = new ObservationRegistry({
        observeBands$: request => new Observable(subscriber => {
            const entry = {request, subscriber, answered: false, cancelled: false}
            requests.push(entry)
            return () => {
                entry.cancelled = !entry.answered
            }
        }),
        isCurrent: () => current,
        retention: {graceMs: 60000, maxUnclaimed, maxAgeMs: 300000},
        clock: {
            now: () => now,
            setTimeout: (callback, ms) => {
                const timer = {at: now + ms, callback}
                timers.push(timer)
                return timer
            },
            clearTimeout: timer => timers = timers.filter(other => other !== timer)
        }
    })
    return {
        registry,
        requests,
        observe: (key, {complete = true} = {}) => {
            let bands = null
            let error = null
            const subscription = registry.observe$(key.reference, {key, complete}).subscribe({
                next: answer => bands = answer,
                error: failure => error = failure
            })
            return {bands: () => bands, error: () => error, leave: () => subscription.unsubscribe()}
        },
        answer: bands => {
            const entry = requests.at(-1)
            entry.answered = true
            entry.subscriber.next(bands)
            entry.subscriber.complete()
        },
        fail: error => requests.at(-1).subscriber.error(error),
        supersede: () => current = false,
        advanceWithoutTimers: ms => now += ms,
        advance: ms => {
            now += ms
            const due = timers.filter(({at}) => at <= now)
            timers = timers.filter(timer => !due.includes(timer))
            due.forEach(({callback}) => callback())
        }
    }
}
