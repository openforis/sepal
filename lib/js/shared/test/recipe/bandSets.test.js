import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {bandSetFindings} from '#sepal/recipe/bandSets'

// What a source with given bands establishes is wrong with an input's band sets, as execution builds them: image bands
// it has or indexes derived from them, indexes derivable from them, and band combinations of at least two of its bands.
// Codes are literals.

describe('band sets judged against the bands of their source', () => {
    it('find an image band the source does not have, and accept an index under Image bands it can derive', () => {
        const findings = bandSetFindings([imageBands('red', 'ndvi', 'swir1')], ['red', 'nir'])

        assert.deepEqual(findings, [{code: 'MISSING_INPUT_BAND', path: [0, 'included', 2]}])
    })

    it('find an index the source cannot derive', () => {
        const findings = bandSetFindings([indexes('ndvi', 'ndwi')], ['red', 'nir'])

        assert.deepEqual(findings, [{code: 'UNDERIVABLE_INPUT_INDEX', path: [0, 'included', 1]}])
    })

    it('find a band combination left with fewer than two bands, and each band it lacks', () => {
        const findings = bandSetFindings([ratio('red', 'nir')], ['nir'])

        assert.deepEqual(findings, [
            {code: 'MISSING_INPUT_BAND', path: [0, 'included', 0]},
            {code: 'INSUFFICIENT_INPUT_BANDS', path: [0]}
        ])
    })

    it('find a band combination given only one band, though the source has it', () => {
        assert.deepEqual(bandSetFindings([ratio('nir')], ['red', 'nir']), [{code: 'INSUFFICIENT_INPUT_BANDS', path: [0]}])
    })

    it('find nothing in a band combination not yet given a band, nor in sets the source provides', () => {
        assert.deepEqual(bandSetFindings([imageBands('red'), ratio(), indexes('ndvi'), ratio('red', 'nir')], ['red', 'nir']), [])
    })
})

const imageBands = (...included) => ({id: 'image-bands', type: 'IMAGE_BANDS', included})
const indexes = (...included) => ({id: 'indexes', type: 'INDEXES', included})
const ratio = (...included) => ({id: 'ratio', type: 'PAIR_WISE_EXPRESSION', operation: 'RATIO', included})
