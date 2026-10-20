import {Observable, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))

const {allowsApply, GeoIdCheck, readBufferMeters} = await import('./geoIdCheck')

const GEOID = '40df4325-744f-8fae-8e46-049080be5554'
const OTHER_GEOID = '0b9e6c0a-1d2f-8a3b-9c4d-5e6f7a8b9c0d'
const BOUNDS = [[147.38, -33.51], [147.39, -33.50]]
const DELAY = 300

let lookups, states, check

beforeEach(() => {
    vi.useFakeTimers()
    lookups = []
    states = []
    check = new GeoIdCheck({lookup$, onChange: state => states.push(state), delay: DELAY})
})

afterEach(() => {
    check.dispose()
    vi.useRealTimers()
})

describe('checking a GeoID', () => {
    it('is pending at once, and looked up after a short pause', () => {
        check.update({geoId: GEOID})

        expect(latest()).toEqual({status: 'PENDING', geoId: GEOID, geometryType: undefined})
        expect(allowsApply(latest())).toBe(false)
        expect(lookups).toEqual([])

        vi.advanceTimersByTime(DELAY)

        expect(lookups.map(({input}) => input)).toEqual([{geoId: GEOID, bufferMeters: undefined}])
    })

    // An empty buffer is no buffer of its own: the service applies the geometry's default, so a polygon is
    // never buffered by a point's 250 m before its geometry is known.
    it('leaves an empty buffer to the geometry\'s default, and fills it in once the geometry is known', () => {
        check.update({geoId: GEOID})

        answer({geometryType: 'Polygon', bounds: BOUNDS})

        expect(lookups[0].input.bufferMeters).toBeUndefined()
        expect(latest()).toEqual({
            status: 'CHECKED', geoId: GEOID, geometryType: 'Polygon', bounds: BOUNDS, bufferMeters: null, setBufferMeters: 0
        })
        expect(allowsApply(latest())).toBe(true)
    })

    it('fills an empty buffer of a point with 250 m', () => {
        check.update({geoId: GEOID})

        answer({geometryType: 'MultiPoint', bounds: BOUNDS})

        expect(latest()).toMatchObject({status: 'CHECKED', setBufferMeters: 250})
    })

    it('checks the area a given buffer gives, keeping that buffer', () => {
        check.update({geoId: GEOID, bufferText: '1000'})

        answer({geometryType: 'Polygon', bounds: BOUNDS})

        expect(lookups[0].input).toEqual({geoId: GEOID, bufferMeters: 1000})
        expect(latest()).toMatchObject({status: 'CHECKED', bufferMeters: 1000})
        expect(latest()).not.toHaveProperty('setBufferMeters')
    })

    it('checks an explicit zero buffer as zero', () => {
        check.update({geoId: GEOID, bufferText: '0'})

        answer({geometryType: 'Polygon', bounds: BOUNDS})

        expect(lookups[0].input).toEqual({geoId: GEOID, bufferMeters: 0})
    })

    it('checks nothing without a GeoID', () => {
        check.update({geoId: null})
        vi.advanceTimersByTime(DELAY)

        expect(latest()).toEqual({status: 'NONE'})
        expect(allowsApply(latest())).toBe(false)
        expect(lookups).toEqual([])
    })
})

describe('a GeoID that cannot be used', () => {
    it.each([
        ['not registered', 'GEOID_NOT_FOUND', 'NOT_FOUND'],
        ['with an unusable geometry', 'GEOID_INVALID_GEOMETRY', 'INVALID_GEOMETRY']
    ])('blocks Apply when %s, with the service\'s message', (_case, errorCode, status) => {
        check.update({geoId: GEOID})

        fail({errorCode, messageKey: `gee.geoId.error.${errorCode}`})

        expect(latest()).toEqual({status, geoId: GEOID, geometryType: undefined, error: `gee.geoId.error.${errorCode}`})
        expect(allowsApply(latest())).toBe(false)
    })

    // A buffer given before the geometry is known may be one only a polygon accepts.
    it('blocks Apply for a buffer the geometry does not accept, learning the geometry from the refusal', () => {
        check.update({geoId: GEOID, bufferText: '5'})

        fail({errorCode: 'GEOID_INVALID_BUFFER', messageKey: 'gee.geoId.error.invalidBuffer', messageArgs: {geometryType: 'Point'}})

        expect(latest()).toMatchObject({status: 'INVALID_BUFFER', geometryType: 'Point'})
        expect(allowsApply(latest())).toBe(false)
    })
})

describe('a GeoID that could not be checked', () => {
    it.each([
        ['the service is unreachable', {errorCode: 'GEOID_UNREACHABLE', messageKey: 'gee.geoId.error.unreachable'}],
        ['the service reported an error', {errorCode: 'GEOID_SERVICE_ERROR', messageKey: 'gee.geoId.error.serviceError'}],
        ['the request was refused', {errorCode: 'GEOID_REJECTED', messageKey: 'gee.geoId.error.rejected'}],
        ['SEPAL failed without saying why', undefined]
    ])('may still be applied when %s', (_case, response) => {
        check.update({geoId: GEOID})

        fail(response)

        expect(latest()).toMatchObject({status: 'NOT_CHECKED', geoId: GEOID, error: expect.any(String)})
        expect(allowsApply(latest())).toBe(true)
    })

    it('keeps the buffer of the same GeoID, including one edited since', () => {
        check.update({geoId: GEOID})
        answer({geometryType: 'Point', bounds: BOUNDS})
        check.update({geoId: GEOID, bufferText: '1000'})

        fail({errorCode: 'GEOID_UNREACHABLE'})

        expect(lookups[1].input).toEqual({geoId: GEOID, bufferMeters: 1000})
        expect(latest()).toMatchObject({status: 'NOT_CHECKED', geometryType: 'Point'})
        expect(latest()).not.toHaveProperty('setBufferMeters')
    })
})

describe('changing the GeoID', () => {
    it('supersedes a check in progress, whose late answer is ignored', () => {
        check.update({geoId: GEOID})
        vi.advanceTimersByTime(DELAY)
        const superseded = lookups[0]

        check.update({geoId: OTHER_GEOID})
        superseded.answer$.next({geometryType: 'Point', bounds: BOUNDS})

        expect(superseded.unsubscribed).toBe(true)
        expect(states.filter(({geoId}) => geoId === GEOID).map(({status}) => status)).toEqual(['PENDING'])
        expect(latest()).toMatchObject({status: 'PENDING', geoId: OTHER_GEOID})
    })

    it('clears the buffer and the geometry of the previous GeoID, then establishes the new default', () => {
        check.update({geoId: GEOID, bufferText: '1000'})
        answer({geometryType: 'Point', bounds: BOUNDS})

        check.update({geoId: OTHER_GEOID, bufferText: '1000'})
        expect(latest()).toEqual({status: 'PENDING', geoId: OTHER_GEOID, geometryType: undefined, setBufferMeters: null})

        answer({geometryType: 'Polygon', bounds: BOUNDS})
        expect(lookups[1].input).toEqual({geoId: OTHER_GEOID, bufferMeters: undefined})
        expect(latest()).toMatchObject({status: 'CHECKED', geometryType: 'Polygon', setBufferMeters: 0})
    })

    it('to none cancels the check in progress', () => {
        check.update({geoId: GEOID})
        vi.advanceTimersByTime(DELAY)

        check.update({geoId: null})

        expect(lookups[0].unsubscribed).toBe(true)
        expect(latest()).toEqual({status: 'NONE'})
    })
})

describe('changing the buffer', () => {
    it('rechecks, and the area follows the new buffer', () => {
        check.update({geoId: GEOID})
        answer({geometryType: 'Polygon', bounds: BOUNDS})
        const larger = [[147.37, -33.52], [147.40, -33.49]]

        check.update({geoId: GEOID, bufferText: '100'})
        expect(latest()).toEqual({status: 'PENDING', geoId: GEOID, geometryType: 'Polygon'})
        answer({geometryType: 'Polygon', bounds: larger})

        expect(lookups.map(({input}) => input.bufferMeters)).toEqual([undefined, 100])
        expect(latest()).toMatchObject({status: 'CHECKED', bounds: larger, bufferMeters: 100})
    })

    it('to the default the geometry already has checks nothing again', () => {
        check.update({geoId: GEOID})
        answer({geometryType: 'Point', bounds: BOUNDS})

        check.update({geoId: GEOID, bufferText: '250'})
        vi.advanceTimersByTime(DELAY)

        expect(lookups).toHaveLength(1)
    })
})

describe('an invalid buffer', () => {
    it('cancels the check in progress without starting another, and ignores its late answer', () => {
        check.update({geoId: GEOID})
        answer({geometryType: 'Point', bounds: BOUNDS})
        check.update({geoId: GEOID, bufferText: '1000'})
        vi.advanceTimersByTime(DELAY)
        const inFlight = lookups[1]

        check.update({geoId: GEOID, bufferText: '5'})
        inFlight.answer$.next({geometryType: 'Point', bounds: BOUNDS})
        vi.advanceTimersByTime(DELAY)

        expect(inFlight.unsubscribed).toBe(true)
        expect(lookups).toHaveLength(2)
        expect(latest()).toEqual({status: 'INVALID_INPUT', geoId: GEOID, geometryType: 'Point'})
        expect(allowsApply(latest())).toBe(false)
    })

    it('once corrected, is checked again', () => {
        check.update({geoId: GEOID})
        answer({geometryType: 'Point', bounds: BOUNDS})
        check.update({geoId: GEOID, bufferText: '5'})

        check.update({geoId: GEOID, bufferText: '50'})
        answer({geometryType: 'Point', bounds: BOUNDS})

        expect(lookups.map(({input}) => input.bufferMeters)).toEqual([undefined, 50])
        expect(latest()).toMatchObject({status: 'CHECKED', bufferMeters: 50})
    })
})

describe('reading the buffer field', () => {
    it('judges a buffer by the confirmed geometry, or by any geometry before it is known', () => {
        expect(readBufferMeters('', 'Point')).toEqual({})
        expect(readBufferMeters('0', 'Polygon')).toEqual({value: 0})
        expect(readBufferMeters('0', 'Point')).toEqual({invalid: true})
        expect(readBufferMeters('0')).toEqual({value: 0})
        expect(readBufferMeters('10001', 'Point')).toEqual({value: 10001})
        expect(readBufferMeters('2.5', 'Polygon')).toEqual({invalid: true})
        expect(readBufferMeters('Infinity', 'Polygon')).toEqual({invalid: true})
        expect(readBufferMeters('9007199254740992', 'Polygon')).toEqual({invalid: true})
        expect(readBufferMeters('-1')).toEqual({invalid: true})
    })
})

describe('disposing', () => {
    it('cancels the check in progress and reports nothing more', () => {
        check.update({geoId: GEOID})
        vi.advanceTimersByTime(DELAY)
        const reported = states.length

        check.dispose()
        lookups[0].answer$.next({geometryType: 'Point', bounds: BOUNDS})

        expect(lookups[0].unsubscribed).toBe(true)
        expect(states).toHaveLength(reported)
    })
})

const latest = () => states[states.length - 1]

const lookup$ = input => {
    const lookup = {input, answer$: new Subject(), unsubscribed: false}
    lookups.push(lookup)
    return new Observable(subscriber => {
        const subscription = lookup.answer$.subscribe(subscriber)
        return () => {
            lookup.unsubscribed = true
            subscription.unsubscribe()
        }
    })
}

// Settles the most recent lookup, once the pause before it has passed.
const answer = result => {
    vi.advanceTimersByTime(DELAY)
    const {answer$} = lookups[lookups.length - 1]
    answer$.next(result)
    answer$.complete()
}

const fail = response => {
    vi.advanceTimersByTime(DELAY)
    lookups[lookups.length - 1].answer$.error({status: 502, response})
}
