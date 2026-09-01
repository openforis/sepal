import {
    EMPTY_SELECTION,
    INVALID_SELECTION,
    physicalDestinationCompatibility,
    VALID_SELECTION
} from '#sepal/recipe/output/physicalDestinationCompatibility'

const band = (name, arrayDimensions) => ({name, dataType: {arrayDimensions}})
const compatibility = ({bands, selectedBandNames = [], useAllBands}) =>
    physicalDestinationCompatibility({bands, selectedBandNames, useAllBands})

describe('physicalDestinationCompatibility', () => {
    const mixed = [band('array', 1), band('scalar', 0)]

    test('uses the explicit manual selection', () => {
        expect(compatibility({bands: mixed, selectedBandNames: ['scalar'], useAllBands: false})).toMatchObject({
            selectionStatus: VALID_SELECTION,
            selectedBands: [mixed[1]],
            destinations: {GEE: true, DRIVE: true, SEPAL: true}
        })
        expect(compatibility({bands: mixed, selectedBandNames: ['array'], useAllBands: false})).toMatchObject({
            selectionStatus: VALID_SELECTION,
            selectedBands: [mixed[0]],
            destinations: {GEE: true, DRIVE: false, SEPAL: false}
        })
    })

    test('ignores a stale manual selection when all bands are explicit', () => {
        expect(compatibility({bands: mixed, selectedBandNames: ['scalar'], useAllBands: true})).toMatchObject({
            selectionStatus: VALID_SELECTION,
            selectedBands: mixed,
            destinations: {GEE: true, DRIVE: false, SEPAL: false}
        })
    })

    test('retains legacy empty-means-all selection when useAllBands is absent', () => {
        expect(compatibility({bands: mixed, selectedBandNames: []})).toMatchObject({
            selectionStatus: VALID_SELECTION,
            selectedBands: mixed,
            destinations: {GEE: true, DRIVE: false, SEPAL: false}
        })
    })

    test('keeps direct destinations available for an empty manual choice when a scalar exists', () => {
        expect(compatibility({bands: mixed, selectedBandNames: [], useAllBands: false})).toMatchObject({
            selectionStatus: EMPTY_SELECTION,
            selectedBands: [],
            destinations: {GEE: true, DRIVE: true, SEPAL: true}
        })
    })

    test('disables direct destinations for an empty manual choice when every band is an array', () => {
        expect(compatibility({
            bands: [band('first', 1), band('second', 2)],
            selectedBandNames: [],
            useAllBands: false
        })).toMatchObject({
            selectionStatus: EMPTY_SELECTION,
            destinations: {GEE: true, DRIVE: false, SEPAL: false}
        })
    })

    test.each([
        ['an absent selected band', mixed, ['missing']],
        ['unknown dimensionality', [{name: 'unknown'}], ['unknown']],
        ['invalid dimensionality', [band('invalid', -1)], ['invalid']]
    ])('fails closed for %s', (_name, bands, selectedBandNames) => {
        const result = compatibility({bands, selectedBandNames, useAllBands: false})
        expect(result).toMatchObject({
            selectionStatus: INVALID_SELECTION,
            selectedBands: [],
            destinations: {GEE: false, DRIVE: false, SEPAL: false}
        })
        expect(result.missingBandNames).toEqual(selectedBandNames[0] === 'missing' ? ['missing'] : [])
    })
})
