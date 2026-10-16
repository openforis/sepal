import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {alertFilter} from '#sepal/ee/bayts/alertFilter'
import {withOutputBands} from '#sepal/ee/outputBands'

// Stating no filter is not stating an empty one. An export states none, and what it gets back is the whole
// alert product rather than whichever filter a partially stated one falls through to.
describe('which alerts a caller asked to see', () => {
    it('is the whole product for an export, which states only the bands it wants', () => {
        assert.deepEqual(
            alertFilter(withOutputBands({selection: ['flag', 'change_probability']})),
            {excludePreviouslyConfirmed: false, minConfidence: 'all'}
        )
    })

    it('is the filter a caller states', () => {
        assert.deepEqual(
            alertFilter({previouslyConfirmed: 'exclude', minConfidence: 'high'}),
            {excludePreviouslyConfirmed: true, minConfidence: 'high'}
        )
    })
})
