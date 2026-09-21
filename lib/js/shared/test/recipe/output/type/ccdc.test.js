import {AVAILABLE_BANDS} from '#sepal/recipe/output/provider'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {ccdcMeasures, ccdcOutputBands, ccdcPhysicalBands, measuresFor} from '#sepal/recipe/type/ccdc'

// The persisted type and the policy are written as literals: a production rename must not make this pass.
const declaration = () => recipeType('CCDC').imageOutput

const model = ({dataSets, corrections, breakpointBands = ['ndvi'], compose}) => ({
    sources: {dataSets, breakpointBands},
    options: {...(corrections === undefined ? {} : {corrections}), ...(compose === undefined ? {} : {compose})}
})

const landsat = overrides => model({dataSets: {LANDSAT: ['LANDSAT_8']}, ...overrides})

const measures = (recipeModel, classificationBands, nativeBands) =>
    ccdcMeasures({model: recipeModel, classificationBands, nativeBands})

const EIGHT_BAND_DAILY = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']

const planet = ({source, histogramMatching}) => ({
    sources: {dataSets: {PLANET: [source]}, breakpointBands: ['ndvi']},
    options: {...(histogramMatching === undefined ? {} : {histogramMatching})}
})

describe('the measures a CCDC recipe can fit', () => {
    it('offers every band its optical collection computes, not only the breakpoint measures', () => {
        expect(measures(landsat())).toEqual(expect.arrayContaining(['red', 'nir', 'ndvi', 'nbr', 'greenness']))
    })

    it('follows the data sets, so a band no contributing data set carries is not offered', () => {
        expect(measures(landsat())).toContain('thermal')
        expect(measures(model({dataSets: {SENTINEL_2: ['SENTINEL_2']}}))).not.toContain('thermal')
    })

    it('reads reflectance from the collection options, as the collection is built', () => {
        expect(measures(landsat({corrections: []}))).toContain('pan')
        expect(measures(landsat({corrections: ['SR']}))).not.toContain('pan')
    })

    // lib/js/ee/src/timeSeries/collection.js derives the ratio for a radar collection whenever it is asked
    // for, so it is a measure CCDC can break on - as the sources panel has always offered.
    it('offers the derived ratio of a radar collection', () => {
        expect(measures(model({dataSets: {SENTINEL_1: ['SENTINEL_1']}, breakpointBands: ['VV']})))
            .toEqual(['VV', 'VH', 'ratio_VV_VH', 'orbit'])
    })

    it('offers the bands a basemap collection carries, with the indexes they support', () => {
        const basemap = measures(planet({source: 'NICFI'}), [], EIGHT_BAND_DAILY)

        expect(basemap.slice(0, 4)).toEqual(['blue', 'green', 'red', 'nir'])
        expect(basemap).toContain('ndvi')
        expect(basemap).toContain('evi')
        expect(basemap).not.toContain('redEdge')
    })

    it('offers the additional measures of eight-band Planet Daily imagery', () => {
        const daily = measures(planet({source: 'DAILY'}), [], EIGHT_BAND_DAILY)

        expect(daily).toEqual(expect.arrayContaining(['redEdge', 'yellow', 'aerosol', 'green1', 'ndvi']))
    })

    it('offers only four measures for four-band Planet Daily imagery', () => {
        const daily = measures(planet({source: 'DAILY'}), [], ['B1', 'B2', 'B3', 'B4', 'udm1'])

        expect(daily.slice(0, 4)).toEqual(['blue', 'green', 'red', 'nir'])
        expect(daily).not.toContain('redEdge')
    })

    it('offers only the matched measures when Planet Daily imagery is histogram-matched', () => {
        const matched = measures(planet({source: 'DAILY', histogramMatching: 'ENABLED'}), [], EIGHT_BAND_DAILY)

        expect(matched.slice(0, 4)).toEqual(['blue', 'green', 'red', 'nir'])
        expect(matched).not.toContain('redEdge')
    })

    // Only the bands addClassificationBands actually adds: `class` and `class_probability` are neither
    // selected nor scaled there, so CCDC never receives them.
    it('adds the regression and per-class probabilities a classification contributes, and nothing else', () => {
        const withClassification = measures(landsat(), ['class', 'regression', 'class_probability', 'probability_1'])

        expect(withClassification).toContain('regression')
        expect(withClassification).toContain('probability_1')
        expect(withClassification).not.toContain('class')
        expect(withClassification).not.toContain('class_probability')
    })

    // The date bands survive compositing but not segmentation: getCollection$ is asked for measures to fit.
    it('never offers the date bands, whatever the composite would keep', () => {
        const composed = measures(landsat({compose: 'MEDOID'}))

        expect(composed).not.toContain('dayOfYear')
        expect(composed).not.toContain('daysFromTarget')
    })

    // A saved breakpoint band is intent, not evidence: a collection that no longer carries it cannot be
    // asked to produce it, so advertising it as available would offer an export that cannot run. The stale
    // configuration itself is left exactly as the user saved it.
    it('does not offer a configured breakpoint measure its data sets no longer carry', () => {
        const stale = model({dataSets: {SENTINEL_2: ['SENTINEL_2']}, breakpointBands: ['thermal']})

        expect(measures(stale)).not.toContain('thermal')
        expect(stale.sources.breakpointBands).toEqual(['thermal'])
    })

    it('offers each measure once', () => {
        const offered = measures(landsat({breakpointBands: ['ndvi', 'ndvi', 'red']}))

        expect(offered.filter(measure => measure === 'ndvi')).toHaveLength(1)
        expect(offered.filter(measure => measure === 'red')).toHaveLength(1)
    })
})

describe('the physical bands CCDC measures produce', () => {
    it('carries the timing bands first, then every measure\'s coefficients, rmse and magnitude', () => {
        expect(ccdcOutputBands(['ndvi', 'red'])).toEqual([
            'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
            'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude',
            'red_coefs', 'red_rmse', 'red_magnitude'
        ])
    })

    // Coefficients are one array per segment of one coefficient per term; everything else is one value per
    // segment. Neither can be pyramided by averaging, which is why CCDC exports with `sample` throughout.
    it('states two array dimensions for coefficients, one for every other band, and sample throughout', () => {
        expect(ccdcPhysicalBands(['tStart', 'ndvi_coefs', 'ndvi_rmse'])).toEqual([
            {name: 'tStart', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'},
            {name: 'ndvi_coefs', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'},
            {name: 'ndvi_rmse', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'}
        ])
    })

    it('names the measures the requested physical bands are built from', () => {
        expect(measuresFor(['red_coefs', 'tStart', 'red_rmse', 'ndvi_magnitude'])).toEqual(['red', 'ndvi'])
    })

    it('refuses a physical band no measure produces', () => {
        expect(() => measuresFor(['ndvi'])).toThrow(/Not a CCDC output band: ndvi/)
    })
})

describe('the registered CCDC output provider', () => {
    // Its measures depend on a classification it cannot read, so it asks what it makes available rather than
    // what an unrequested image happens to hold - which is only the breakpoint measures.
    it('asks for its available bands rather than the bands of its running image', () => {
        expect(declaration().observes).toBe(AVAILABLE_BANDS)
    })

    it('describes nothing when its available bands cannot be established', () => {
        expect(declaration().describe({observation: () => null})).toBeNull()
    })

    it('gives every available band its physical facts and CCDC\'s export policy', () => {
        expect(declaration().describe({observation: () => ({bands: [{name: 'tStart'}, {name: 'red_coefs'}]})}))
            .toEqual({
                bands: [
                    {name: 'tStart', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'},
                    {name: 'red_coefs', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'}
                ],
                evidence: []
            })
    })

    it('does not modify the observation it was given', () => {
        const observation = {bands: [{name: 'tStart'}, {name: 'ndvi_coefs'}]}
        const before = JSON.stringify(observation)

        const derived = declaration().describe({observation: () => observation})

        expect(JSON.stringify(observation)).toEqual(before)
        expect(derived.bands).not.toBe(observation.bands)
    })

    it('describes an empty catalogue as an empty band list', () => {
        expect(declaration().describe({observation: () => ({bands: []})})).toEqual({bands: [], evidence: []})
    })
})
