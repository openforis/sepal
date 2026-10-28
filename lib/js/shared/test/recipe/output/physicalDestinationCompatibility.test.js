import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {
    EMPTY_SELECTION,
    INVALID_SELECTION,
    physicalDestinationCompatibility,
    VALID_SELECTION
} from '#sepal/recipe/output/physicalDestinationCompatibility'
import {assertMatches} from '#sepal/testSupport/assert'

const band = (name, arrayDimensions) => ({name, dataType: {arrayDimensions}})
const compatibility = ({bands, selectedBandNames = [], useAllBands}) =>
    physicalDestinationCompatibility({bands, selectedBandNames, useAllBands})

describe('physicalDestinationCompatibility', () => {
    const mixed = [band('array', 1), band('scalar', 0)]

    test('uses the explicit manual selection', () => {
        assertMatches(
            compatibility({bands: mixed, selectedBandNames: ['scalar'], useAllBands: false}),
            {
                selectionStatus: VALID_SELECTION,
                selectedBands: [mixed[1]],
                destinations: {GEE: true, DRIVE: true, SEPAL: true}
            }
        )
        assertMatches(
            compatibility({bands: mixed, selectedBandNames: ['array'], useAllBands: false}),
            {
                selectionStatus: VALID_SELECTION,
                selectedBands: [mixed[0]],
                destinations: {GEE: true, DRIVE: false, SEPAL: false}
            }
        )
    })

    test('ignores a stale manual selection when all bands are explicit', () => {
        assert.partialDeepStrictEqual(
            compatibility({bands: mixed, selectedBandNames: ['scalar'], useAllBands: true}),
            {
                selectionStatus: VALID_SELECTION,
                selectedBands: mixed,
                destinations: {GEE: true, DRIVE: false, SEPAL: false}
            }
        )
    })

    test('retains legacy empty-means-all selection when useAllBands is absent', () => {
        assert.partialDeepStrictEqual(compatibility({bands: mixed, selectedBandNames: []}), {
            selectionStatus: VALID_SELECTION,
            selectedBands: mixed,
            destinations: {GEE: true, DRIVE: false, SEPAL: false}
        })
    })

    test('keeps direct destinations available for an empty manual choice when a scalar exists', () => {
        assertMatches(
            compatibility({bands: mixed, selectedBandNames: [], useAllBands: false}),
            {
                selectionStatus: EMPTY_SELECTION,
                selectedBands: [],
                destinations: {GEE: true, DRIVE: true, SEPAL: true}
            }
        )
    })

    test('disables direct destinations for an empty manual choice when every band is an array', () => {
        assert.partialDeepStrictEqual(compatibility({
            bands: [band('first', 1), band('second', 2)],
            selectedBandNames: [],
            useAllBands: false
        }), {
            selectionStatus: EMPTY_SELECTION,
            destinations: {GEE: true, DRIVE: false, SEPAL: false}
        })
    })

    for (const [scenario, bands, selectedBandNames] of [
        ['an absent selected band', mixed, ['missing']],
        ['unknown dimensionality', [{name: 'unknown'}], ['unknown']],
        ['invalid dimensionality', [band('invalid', -1)], ['invalid']]
    ]) {
        test(`fails closed for ${scenario}`, () => {
            const result = compatibility({bands, selectedBandNames, useAllBands: false})
            assertMatches(result, {
                selectionStatus: INVALID_SELECTION,
                selectedBands: [],
                destinations: {GEE: false, DRIVE: false, SEPAL: false}
            })
            assert.deepEqual(
                result.missingBandNames,
                selectedBandNames[0] === 'missing' ? ['missing'] : []
            )
        })
    }
})
