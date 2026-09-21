import {planetBandNames} from '#sepal/recipe/planet/planetBands'

// Band names are written as literals: these are what lib/js/ee/src/planet/daily.js and basemap.js rename to,
// and what lib/js/ee/src/histogramMatch.js returns, so a production rename must not make this pass.

const FOUR_BAND = ['B1', 'B2', 'B3', 'B4', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']
const EIGHT_BAND = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']

const daily = ({nativeBands, histogramMatching} = {}) =>
    planetBandNames({source: 'DAILY', nativeBands, histogramMatching})

describe('the bands a Planet collection carries', () => {
    it.each(['NICFI', 'BASEMAPS', undefined])('renames a %s basemap to four', source => {
        expect(planetBandNames({source, nativeBands: EIGHT_BAND})).toEqual(['blue', 'green', 'red', 'nir'])
    })

    it('renames four-band Daily imagery to four', () => {
        expect(daily({nativeBands: FOUR_BAND})).toEqual(['blue', 'green', 'red', 'nir'])
    })

    // Merging the eight-band branch into a four-band collection cannot give four-band imagery bands it does
    // not carry, so the extra names belong to eight-band imagery alone.
    it('carries no eight-band measure for four-band Daily imagery', () => {
        expect(daily({nativeBands: FOUR_BAND})).not.toContain('redEdge')
        expect(daily({nativeBands: FOUR_BAND})).not.toContain('yellow')
    })

    it('renames eight-band Daily imagery to eight', () => {
        expect(daily({nativeBands: EIGHT_BAND}))
            .toEqual(['aerosol', 'blue', 'green1', 'green', 'yellow', 'red', 'redEdge', 'nir'])
    })

    // histogramMatch returns the four bands it matches, whatever it was given.
    it('reduces histogram-matched Daily imagery to the four bands matching produces', () => {
        expect(daily({nativeBands: EIGHT_BAND, histogramMatching: 'ENABLED'}))
            .toEqual(['blue', 'green', 'red', 'nir'])
    })

    it('leaves Daily imagery alone when matching is disabled', () => {
        expect(daily({nativeBands: EIGHT_BAND, histogramMatching: 'DISABLED'})).toContain('redEdge')
    })

    // Without the imagery's own schema, only what every Daily image carries can be stated.
    it.each([
        ['nothing is known of the imagery', undefined],
        ['the imagery carries only some of the eight', ['B1', 'B2', 'B3', 'B4', 'B5']]
    ])('states the four every Daily image carries when %s', (_case, nativeBands) => {
        expect(daily({nativeBands})).toEqual(['blue', 'green', 'red', 'nir'])
    })

    // An empty list is the answer of a caller that looked: no imagery contributes, so the collection carries
    // nothing. That is not the same as not knowing what the imagery carries.
    it('carries nothing when no imagery contributes', () => {
        expect(daily({nativeBands: []})).toEqual([])
    })

    it('carries nothing when no imagery contributes, whatever the processing', () => {
        expect(daily({nativeBands: [], histogramMatching: 'ENABLED'})).toEqual([])
    })
})
