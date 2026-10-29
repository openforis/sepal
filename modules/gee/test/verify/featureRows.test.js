import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {sameRows} from '../../verify/featureRows.mjs'

// Whether a verification's samples hold the expected feature vectors, each sample's values compared together.

describe('samples compared row by row', () => {
    it('agree when they hold the expected rows in another order', () => {
        assert.equal(sameRows([[1, 1], [0, 0]], [[0, 0], [1, 1]], 0), true)
    })

    it('do not agree when each column holds the expected values but the rows pair them differently', () => {
        assert.equal(sameRows([[0, 1], [1, 0]], [[0, 0], [1, 1]], 0), false)
    })

    it('agree within the tolerance, and not beyond it', () => {
        assert.equal(sameRows([[0.5, 1]], [[0.5 + 1e-6, 1]], 1e-5), true)
        assert.equal(sameRows([[0.5, 1]], [[0.5 + 1e-4, 1]], 1e-5), false)
    })

    // 0.0000075 is within tolerance of both 0 and 0.000015; the expected 0 only of the actual 0.
    for (const [actual, expected] of [
        [[[0], [0.000015]], [[0.0000075], [0]]],
        [[[0.000015], [0]], [[0.0000075], [0]]],
        [[[0], [0.000015]], [[0], [0.0000075]]],
        [[[0.000015], [0]], [[0], [0.0000075]]]
    ]) {
        it(`agree where tolerances overlap, whatever order the rows come in: ${JSON.stringify({actual, expected})}`, () => {
            assert.equal(sameRows(actual, expected, 0.00001), true)
        })
    }

    it('do not agree when a row is repeated in place of another', () => {
        assert.equal(sameRows([[0, 0], [0, 0]], [[0, 0], [1, 1]], 0), false)
    })

    it('do not agree when there are none, when their counts differ, or when a value is not a number', () => {
        assert.equal(sameRows([], [], 0), false)
        assert.equal(sameRows([[0, 0]], [[0, 0], [1, 1]], 0), false)
        assert.equal(sameRows([[0, null]], [[0, null]], 0), false)
    })
})
