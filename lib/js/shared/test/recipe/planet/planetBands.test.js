import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {planetBandNames} from '#sepal/recipe/planet/planetBands'

// Band names are written as literals: these are what lib/js/ee/src/planet/daily.js and basemap.js rename to,
// and what lib/js/ee/src/histogramMatch.js returns, so a production rename must not make this pass.

const FOUR_BAND = ['B1', 'B2', 'B3', 'B4', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']
const EIGHT_BAND = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']

const daily = ({nativeBands, histogramMatching} = {}) =>
    planetBandNames({source: 'DAILY', nativeBands, histogramMatching})

describe('the bands a Planet collection carries', () => {
    for (const source of ['NICFI', 'BASEMAPS', undefined]) {
        it(`renames a ${source} basemap to four`, () => {
            assert.deepEqual(
                planetBandNames({source, nativeBands: EIGHT_BAND}),
                ['blue', 'green', 'red', 'nir']
            )
        })
    }

    it('renames four-band Daily imagery to four', () => {
        assert.deepEqual(daily({nativeBands: FOUR_BAND}), ['blue', 'green', 'red', 'nir'])
    })

    // Merging the eight-band branch into a four-band collection cannot give four-band imagery bands it does
    // not carry, so the extra names belong to eight-band imagery alone.
    it('carries no eight-band measure for four-band Daily imagery', () => {
        assert.ok(!daily({nativeBands: FOUR_BAND}).includes('redEdge'))
        assert.ok(!daily({nativeBands: FOUR_BAND}).includes('yellow'))
    })

    it('renames eight-band Daily imagery to eight', () => {
        assert.deepEqual(
            daily({nativeBands: EIGHT_BAND}),
            ['aerosol', 'blue', 'green1', 'green', 'yellow', 'red', 'redEdge', 'nir']
        )
    })

    // histogramMatch returns the four bands it matches, whatever it was given.
    it('reduces histogram-matched Daily imagery to the four bands matching produces', () => {
        assert.deepEqual(
            daily({nativeBands: EIGHT_BAND, histogramMatching: 'ENABLED'}),
            ['blue', 'green', 'red', 'nir']
        )
    })

    it('leaves Daily imagery alone when matching is disabled', () => {
        assert.ok(
            daily({nativeBands: EIGHT_BAND, histogramMatching: 'DISABLED'}).includes('redEdge')
        )
    })

    // Without the imagery's own schema, only what every Daily image carries can be stated.
    for (const [scenario, nativeBands] of [
        ['nothing is known of the imagery', undefined],
        ['the imagery carries only some of the eight', ['B1', 'B2', 'B3', 'B4', 'B5']]
    ]) {
        it(`states the four every Daily image carries when ${scenario}`, () => {
            assert.deepEqual(daily({nativeBands}), ['blue', 'green', 'red', 'nir'])
        })
    }

    // An empty list is the answer of a caller that looked: no imagery contributes, so the collection carries
    // nothing. That is not the same as not knowing what the imagery carries.
    it('carries nothing when no imagery contributes', () => {
        assert.deepEqual(daily({nativeBands: []}), [])
    })

    it('carries nothing when no imagery contributes, whatever the processing', () => {
        assert.deepEqual(daily({nativeBands: [], histogramMatching: 'ENABLED'}), [])
    })
})
