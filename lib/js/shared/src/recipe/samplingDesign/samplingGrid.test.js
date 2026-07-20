import {
    gridPixelSize,
    isValidMinDistanceForGrid,
    parseCrsTransform,
    requiredMinDistance
} from './samplingGrid.js'

describe('gridPixelSize', () => {
    it('uses the scale for a scale-defined grid', () => {
        expect(gridPixelSize({scale: 10})).toBe(10)
        expect(gridPixelSize({scale: '30'})).toBe(30)
    })

    it('uses the transform pixel width for a transform-defined grid, ignoring any scale', () => {
        expect(gridPixelSize({crsTransform: '[10,0,0,0,-10,0]'})).toBe(10)
        expect(gridPixelSize({scale: 999, crsTransform: '[10,0,0,0,-10,0]'})).toBe(10)
        expect(gridPixelSize({crsTransform: [30, 0, 15, 0, -30, 15]})).toBe(30)
    })

    it('is not a number for an indeterminate grid', () => {
        expect(Number.isFinite(gridPixelSize({}))).toBe(false)
        expect(Number.isFinite(gridPixelSize({crsTransform: 'nonsense'}))).toBe(false)
    })
})

describe('requiredMinDistance', () => {
    it('is two grid pixels for scale and transform grids alike', () => {
        expect(requiredMinDistance({scale: 10})).toBe(20)
        expect(requiredMinDistance({scale: 0.5})).toBe(1)
        expect(requiredMinDistance({crsTransform: '[10,0,0,0,-10,0]'})).toBe(20)
    })

    it('is null when the grid is indeterminate, so the grid-definition error reports it instead', () => {
        expect(requiredMinDistance({})).toBeNull()
        expect(requiredMinDistance({scale: 0})).toBeNull()
        expect(requiredMinDistance({scale: -5})).toBeNull()
    })
})

// The candidate generator internally clamps spacing to two grid pixels, so a smaller configured distance would
// be silently overridden. Callers validate against this instead of quietly rewriting the user's value.
describe('isValidMinDistanceForGrid', () => {
    it('rejects below the floor and accepts at or above it (10 m scale grid)', () => {
        expect(isValidMinDistanceForGrid({minDistance: 19, scale: 10})).toBe(false)
        expect(isValidMinDistanceForGrid({minDistance: 20, scale: 10})).toBe(true)
        expect(isValidMinDistanceForGrid({minDistance: 21, scale: 10})).toBe(true)
    })

    it('applies the same floor to an equivalent transform grid', () => {
        expect(isValidMinDistanceForGrid({minDistance: 19, crsTransform: '[10,0,0,0,-10,0]'})).toBe(false)
        expect(isValidMinDistanceForGrid({minDistance: 20, crsTransform: '[10,0,0,0,-10,0]'})).toBe(true)
    })

    it('handles decimals around the boundary', () => {
        expect(isValidMinDistanceForGrid({minDistance: 19.999, scale: 10})).toBe(false)
        expect(isValidMinDistanceForGrid({minDistance: 20.001, scale: 10})).toBe(true)
        expect(isValidMinDistanceForGrid({minDistance: 1, scale: 0.5})).toBe(true)
        expect(isValidMinDistanceForGrid({minDistance: 0.999, scale: 0.5})).toBe(false)
    })

    it('rejects a missing or non-numeric distance against a valid grid', () => {
        expect(isValidMinDistanceForGrid({scale: 10})).toBe(false)
        expect(isValidMinDistanceForGrid({minDistance: 'abc', scale: 10})).toBe(false)
    })

    it('a distance valid for a fine grid becomes invalid when the grid coarsens', () => {
        expect(isValidMinDistanceForGrid({minDistance: 20, scale: 10})).toBe(true)
        expect(isValidMinDistanceForGrid({minDistance: 20, scale: 30})).toBe(false)
    })

    it('defers to the grid-definition error when the grid is indeterminate', () => {
        expect(isValidMinDistanceForGrid({minDistance: 1, scale: 0})).toBe(true)
        expect(isValidMinDistanceForGrid({minDistance: 1})).toBe(true)
    })
})

describe('parseCrsTransform', () => {
    it('parses bracketed and bare six-number strings, and arrays', () => {
        expect(parseCrsTransform('[10,0,0,0,-10,0]')).toEqual([10, 0, 0, 0, -10, 0])
        expect(parseCrsTransform('10, 0, 0, 0, -10, 0')).toEqual([10, 0, 0, 0, -10, 0])
        expect(parseCrsTransform([10, 0, 0, 0, -10, 0])).toEqual([10, 0, 0, 0, -10, 0])
    })

    it('is null for absent, short or non-numeric values', () => {
        for (const value of [undefined, null, '', '10,0,0', '[10,0,0,0,-10,x]']) {
            expect(parseCrsTransform(value)).toBeNull()
        }
    })
})
