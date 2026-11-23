import {isWithinBounds, rankCoordinateCandidates} from './coordinateCandidates'

const first = {lat: 10, lng: 20}
const second = {lat: 20, lng: 10}

describe('isWithinBounds', () => {
    test('returns null when bounds are unavailable', () => {
        expect(isWithinBounds(first)).toBeNull()
    })

    test('includes coordinates on the bounds edges', () => {
        expect(isWithinBounds(first, [[20, 10], [30, 20]])).toBe(true)
    })

    test('supports bounds crossing the antimeridian', () => {
        const bounds = [[170, -20], [-170, 20]]
        expect(isWithinBounds({lat: 0, lng: 175}, bounds)).toBe(true)
        expect(isWithinBounds({lat: 0, lng: -175}, bounds)).toBe(true)
        expect(isWithinBounds({lat: 0, lng: 0}, bounds)).toBe(false)
    })
})

describe('rankCoordinateCandidates', () => {
    test('preselects a single unambiguous candidate', () => {
        expect(rankCoordinateCandidates({candidates: [first]})).toEqual({
            candidates: [{candidate: first, withinBounds: null}],
            autoHighlight: true
        })
    })

    test('puts the only candidate within bounds first and preselects it', () => {
        expect(rankCoordinateCandidates({
            candidates: [first, second],
            bounds: [[5, 15], [15, 25]]
        })).toEqual({
            candidates: [
                {candidate: second, withinBounds: true},
                {candidate: first, withinBounds: false}
            ],
            autoHighlight: true
        })
    })

    test.each([
        ['both are within bounds', [[0, 0], [30, 30]], true],
        ['both are outside bounds', [[40, 40], [50, 50]], false]
    ])('preserves parser order and preselects neither when %s', (_name, bounds, withinBounds) => {
        expect(rankCoordinateCandidates({candidates: [first, second], bounds})).toEqual({
            candidates: [
                {candidate: first, withinBounds},
                {candidate: second, withinBounds}
            ],
            autoHighlight: false
        })
    })

    test('preserves parser order and preselects neither when bounds are unavailable', () => {
        expect(rankCoordinateCandidates({candidates: [first, second]})).toEqual({
            candidates: [
                {candidate: first, withinBounds: null},
                {candidate: second, withinBounds: null}
            ],
            autoHighlight: false
        })
    })
})
