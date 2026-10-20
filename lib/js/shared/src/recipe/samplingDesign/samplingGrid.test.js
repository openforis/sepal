import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {
    gridPixelSize,
    isValidMinDistanceForGrid,
    requiredMinDistance,
    resolveMinDistance} from './samplingGrid.js'

describe('gridPixelSize', () => {
    it('uses the scale for a scale-defined grid', () => {
        assert.equal(gridPixelSize({scale: 10}), 10)
        assert.equal(gridPixelSize({scale: '30'}), 30)
        assert.equal(gridPixelSize({scale: 9.9763}), 9.9763)
    })

    it('is not a number for an indeterminate grid', () => {
        assert.equal(Number.isFinite(gridPixelSize({})), false)
        assert.equal(Number.isFinite(gridPixelSize({scale: 'wide'})), false)
    })
})

describe('requiredMinDistance', () => {
    it('is two grid pixels', () => {
        assert.equal(requiredMinDistance({scale: 10}), 20)
        assert.equal(requiredMinDistance({scale: 0.5}), 1)
    })

    it('is null when the grid is indeterminate, so the grid-definition error reports it instead', () => {
        assert.equal(requiredMinDistance({}), null)
        assert.equal(requiredMinDistance({scale: 0}), null)
        assert.equal(requiredMinDistance({scale: -5}), null)
    })
})

// The candidate generator internally clamps spacing to two grid pixels, so a smaller configured distance would
// be silently overridden. Callers validate against this instead of quietly rewriting the user's value.
describe('isValidMinDistanceForGrid', () => {
    it('rejects below the floor and accepts at or above it (10 m scale grid)', () => {
        assert.equal(isValidMinDistanceForGrid({minDistance: 19, scale: 10}), false)
        assert.equal(isValidMinDistanceForGrid({minDistance: 20, scale: 10}), true)
        assert.equal(isValidMinDistanceForGrid({minDistance: 21, scale: 10}), true)
    })

    it('handles decimals around the boundary', () => {
        assert.equal(isValidMinDistanceForGrid({minDistance: 19.999, scale: 10}), false)
        assert.equal(isValidMinDistanceForGrid({minDistance: 20.001, scale: 10}), true)
        assert.equal(isValidMinDistanceForGrid({minDistance: 1, scale: 0.5}), true)
        assert.equal(isValidMinDistanceForGrid({minDistance: 0.999, scale: 0.5}), false)
    })

    // Unset is the default: it means "closest spacing the grid allows", resolved at export rather than stored.
    it('accepts an unset distance, which resolves to the floor', () => {
        assert.equal(isValidMinDistanceForGrid({scale: 10}), true)
        assert.equal(isValidMinDistanceForGrid({minDistance: null, scale: 10}), true)
        assert.equal(isValidMinDistanceForGrid({minDistance: '', scale: 10}), true)
    })

    it('rejects a non-numeric entered distance', () => {
        assert.equal(isValidMinDistanceForGrid({minDistance: 'abc', scale: 10}), false)
    })

    it('a distance valid for a fine grid becomes invalid when the grid coarsens', () => {
        assert.equal(isValidMinDistanceForGrid({minDistance: 20, scale: 10}), true)
        assert.equal(isValidMinDistanceForGrid({minDistance: 20, scale: 30}), false)
    })

    it('defers to the grid-definition error when the grid is indeterminate', () => {
        assert.equal(isValidMinDistanceForGrid({minDistance: 1, scale: 0}), true)
        assert.equal(isValidMinDistanceForGrid({minDistance: 1}), true)
    })
})

describe('resolveMinDistance', () => {
    it('resolves an unset distance to the grid floor, tracking the grid', () => {
        assert.equal(resolveMinDistance({scale: 10}), 20)
        assert.equal(resolveMinDistance({minDistance: '', scale: 30}), 60)
    })

    it('returns an explicit distance unchanged', () => {
        assert.equal(resolveMinDistance({minDistance: 60, scale: 10}), 60)
        assert.equal(resolveMinDistance({minDistance: 20, scale: 10}), 20)
    })

    // Silently clamping would turn an invalid design into a valid-looking one; validation must still see the 1.
    it('does NOT clamp an explicit value below the floor', () => {
        assert.equal(resolveMinDistance({minDistance: 1, scale: 10}), 1)
    })

    it('is null for an unset distance on an indeterminate grid', () => {
        assert.equal(resolveMinDistance({}), null)
        assert.equal(resolveMinDistance({scale: 0}), null)
    })
})
