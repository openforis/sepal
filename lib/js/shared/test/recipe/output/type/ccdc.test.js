import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

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
        assert.ok(
            new Set(['red', 'nir', 'ndvi', 'nbr', 'greenness']).isSubsetOf(new Set(measures(landsat())))
        )
    })

    it('follows the data sets, so a band no contributing data set carries is not offered', () => {
        assert.ok(measures(landsat()).includes('thermal'))
        assert.ok(
            !measures(model({dataSets: {SENTINEL_2: ['SENTINEL_2']}})).includes('thermal')
        )
    })

    it('reads reflectance from the collection options, as the collection is built', () => {
        assert.ok(measures(landsat({corrections: []})).includes('pan'))
        assert.ok(!measures(landsat({corrections: ['SR']})).includes('pan'))
    })

    // lib/js/ee/src/timeSeries/collection.js derives the ratio for a radar collection whenever it is asked
    // for, so it is a measure CCDC can break on - as the sources panel has always offered.
    it('offers the derived ratio of a radar collection', () => {
        assert.deepEqual(
            measures(model({dataSets: {SENTINEL_1: ['SENTINEL_1']}, breakpointBands: ['VV']})),
            ['VV', 'VH', 'ratio_VV_VH', 'orbit']
        )
    })

    it('offers the bands a basemap collection carries, with the indexes they support', () => {
        const basemap = measures(planet({source: 'NICFI'}), [], EIGHT_BAND_DAILY)

        assert.deepEqual(basemap.slice(0, 4), ['blue', 'green', 'red', 'nir'])
        assert.ok(basemap.includes('ndvi'))
        assert.ok(basemap.includes('evi'))
        assert.ok(!basemap.includes('redEdge'))
    })

    it('offers the additional measures of eight-band Planet Daily imagery', () => {
        const daily = measures(planet({source: 'DAILY'}), [], EIGHT_BAND_DAILY)

        assert.ok(
            new Set(['redEdge', 'yellow', 'aerosol', 'green1', 'ndvi']).isSubsetOf(new Set(daily))
        )
    })

    it('offers only four measures for four-band Planet Daily imagery', () => {
        const daily = measures(planet({source: 'DAILY'}), [], ['B1', 'B2', 'B3', 'B4', 'udm1'])

        assert.deepEqual(daily.slice(0, 4), ['blue', 'green', 'red', 'nir'])
        assert.ok(!daily.includes('redEdge'))
    })

    it('offers only the matched measures when Planet Daily imagery is histogram-matched', () => {
        const matched = measures(planet({source: 'DAILY', histogramMatching: 'ENABLED'}), [], EIGHT_BAND_DAILY)

        assert.deepEqual(matched.slice(0, 4), ['blue', 'green', 'red', 'nir'])
        assert.ok(!matched.includes('redEdge'))
    })

    // Only the bands addClassificationBands actually adds: `class` and `class_probability` are neither
    // selected nor scaled there, so CCDC never receives them.
    it('adds the regression and per-class probabilities a classification contributes, and nothing else', () => {
        const withClassification = measures(landsat(), ['class', 'regression', 'class_probability', 'probability_1'])

        assert.ok(withClassification.includes('regression'))
        assert.ok(withClassification.includes('probability_1'))
        assert.ok(!withClassification.includes('class'))
        assert.ok(!withClassification.includes('class_probability'))
    })

    // The date bands survive compositing but not segmentation: getCollection$ is asked for measures to fit. A
    // MEDOID composite keeps all three, so its collection is where they would appear.
    it('never offers the date bands, whatever the composite would keep', () => {
        const composed = measures(landsat({compose: 'MEDOID'}))

        assert.ok(!composed.includes('unixTimeDays'))
        assert.ok(!composed.includes('dayOfYear'))
        assert.ok(!composed.includes('daysFromTarget'))
        assert.ok(new Set(['red', 'nir', 'ndvi', 'nbr']).isSubsetOf(new Set(composed)))
    })

    it('never catalogues the bands fitting a date band would produce, and keeps the segment bands', () => {
        const catalogue = ccdcOutputBands(measures(landsat({compose: 'MEDOID'})))

        assert.deepEqual(
            catalogue.filter(band => /^(unixTimeDays|dayOfYear|daysFromTarget)_/.test(band)),
            []
        )
        assert.deepEqual(
            catalogue.slice(0, 5),
            ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']
        )
        assert.ok(
            new Set(['red_coefs', 'red_rmse', 'red_magnitude', 'ndvi_coefs']).isSubsetOf(new Set(catalogue))
        )
    })

    // A saved breakpoint band is intent, not evidence: a collection that no longer carries it cannot be
    // asked to produce it, so advertising it as available would offer an export that cannot run. The stale
    // configuration itself is left exactly as the user saved it.
    it('does not offer a configured breakpoint measure its data sets no longer carry', () => {
        const stale = model({dataSets: {SENTINEL_2: ['SENTINEL_2']}, breakpointBands: ['thermal']})

        assert.ok(!measures(stale).includes('thermal'))
        assert.deepEqual(stale.sources.breakpointBands, ['thermal'])
    })

    it('offers each measure once', () => {
        const offered = measures(landsat({breakpointBands: ['ndvi', 'ndvi', 'red']}))

        assert.equal(offered.filter(measure => measure === 'ndvi').length, 1)
        assert.equal(offered.filter(measure => measure === 'red').length, 1)
    })
})

describe('the physical bands CCDC measures produce', () => {
    it('carries the timing bands first, then every measure\'s coefficients, rmse and magnitude', () => {
        assert.deepEqual(ccdcOutputBands(['ndvi', 'red']), [
            'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
            'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude',
            'red_coefs', 'red_rmse', 'red_magnitude'
        ])
    })

    // Coefficients are one array per segment of one coefficient per term; everything else is one value per
    // segment. Neither can be pyramided by averaging, which is why CCDC exports with `sample` throughout.
    it('states two array dimensions for coefficients, one for every other band, and sample throughout', () => {
        assert.deepEqual(ccdcPhysicalBands(['tStart', 'ndvi_coefs', 'ndvi_rmse']), [
            {name: 'tStart', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'},
            {name: 'ndvi_coefs', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'},
            {name: 'ndvi_rmse', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'}
        ])
    })

    it('names the measures the requested physical bands are built from', () => {
        assert.deepEqual(
            measuresFor(['red_coefs', 'tStart', 'red_rmse', 'ndvi_magnitude']),
            ['red', 'ndvi']
        )
    })

    it('refuses a physical band no measure produces', () => {
        assert.throws(() => measuresFor(['ndvi']), /Not a CCDC output band: ndvi/)
    })
})

describe('the registered CCDC output provider', () => {
    // Its measures depend on a classification it cannot read, so it asks what it makes available rather than
    // what an unrequested image happens to hold - which is only the breakpoint measures.
    it('asks for its available bands rather than the bands of its running image', () => {
        assert.equal(declaration().observes, AVAILABLE_BANDS)
    })

    it('describes nothing when its available bands cannot be established', () => {
        assert.equal(declaration().describe({observation: () => null}), null)
    })

    it('gives every available band its physical facts and CCDC\'s export policy', () => {
        assert.deepEqual(
            declaration().describe({observation: () => ({bands: [{name: 'tStart'}, {name: 'red_coefs'}]})}),
            {
                bands: [
                    {name: 'tStart', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'},
                    {name: 'red_coefs', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'}
                ],
                evidence: []
            }
        )
    })

    it('does not modify the observation it was given', () => {
        const observation = {bands: [{name: 'tStart'}, {name: 'ndvi_coefs'}]}
        const before = JSON.stringify(observation)

        const derived = declaration().describe({observation: () => observation})

        assert.deepEqual(JSON.stringify(observation), before)
        assert.notEqual(derived.bands, observation.bands)
    })

    it('describes an empty catalogue as an empty band list', () => {
        assert.deepEqual(
            declaration().describe({observation: () => ({bands: []})}),
            {bands: [], evidence: []}
        )
    })
})
