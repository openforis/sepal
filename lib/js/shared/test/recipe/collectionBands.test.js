import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {collectionIndexes} from '#sepal/recipe/collectionBands'
import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// A band of the images that CCDC's Sources break on, or Phenology's analyse, must be one the configured collection
// carries, as its data sets, optical corrections and Planet histogram matching settle it. Where only the Planet Daily
// imagery contributing could settle it, a band eight-band imagery carries is not refused. Codes, paths and band names
// are literals.

const TYPES = [
    {type: 'CCDC', field: 'breakpointBands', operations: ['IMAGE_OUTPUT', 'PIXEL_SEGMENTS', 'COUNT'], chosen: bands => bands},
    {type: 'PHENOLOGY', field: 'band', operations: ['IMAGE_OUTPUT'], chosen: ([band]) => band}
]

// The tables below are built as the suites are declared.
const LANDSAT_8 = {dataSets: {LANDSAT: ['LANDSAT_8']}}
const SENTINEL_2 = {dataSets: {SENTINEL_2: ['SENTINEL_2']}}
const SENTINEL_1 = {dataSets: {SENTINEL_1: ['SENTINEL_1']}}
const SR = {corrections: ['SR']}
const TOA = {corrections: []}
const DATES = {startDate: '2020-01-01', endDate: '2021-01-01', fromYear: 2020, toYear: 2021}

for (const {type, field, operations, chosen} of TYPES) {
    describe(`a ${type} choosing a band of the images its collection does not carry`, () => {
        for (const operation of operations) {
            it(`cannot run ${operation}, refused at ${field}, which names the band`, () => {
                const recipe = recipeOf({type, field, chosen: chosen(['thermal2'])})

                const readiness = readinessOf(recipe, operation)

                assert.equal(readiness.status, 'NOT_READY')
                assert.deepEqual(readiness.findings.map(({code, path, unsupported, recipePath}) => ({code, path, unsupported, recipePath})), [
                    {code: 'UNSUPPORTED_COLLECTION_BANDS', path: ['model', 'sources', field], unsupported: ['thermal2'], recipePath: [recipe.id]}
                ])
            })
        }

        for (const [collection, sources, options, band, unsupported] of [
            ['Landsat 8 surface reflectance', LANDSAT_8, SR, 'thermal2', ['thermal2']],
            ['Landsat 8 top of atmosphere', LANDSAT_8, TOA, 'thermal2', []],
            ['Landsat 8 without corrections saved', LANDSAT_8, {}, 'thermal2', []],
            ['Sentinel-2', SENTINEL_2, SR, 'thermal', ['thermal']],
            ['Sentinel-2', SENTINEL_2, SR, 'ndvi', []],
            ['Sentinel-1', SENTINEL_1, {}, 'ndvi', ['ndvi']],
            ['Sentinel-1', SENTINEL_1, {}, 'ratio_VV_VH', []],
            ['a Planet basemap', planet('BASEMAPS'), {}, 'green1', ['green1']],
            ['NICFI', planet('NICFI'), {}, 'green1', ['green1']],
            ['histogram-matched Planet Daily', planet('DAILY'), {histogramMatching: 'ENABLED'}, 'green1', ['green1']],
            ['unmatched Planet Daily, whose eight-band imagery would carry it', planet('DAILY'), {histogramMatching: 'DISABLED'}, 'green1', []],
            ['unmatched Planet Daily, whose imagery never carries it', planet('DAILY'), {histogramMatching: 'DISABLED'}, 'swir1', ['swir1']],
            ['unmatched Planet Daily', planet('DAILY'), {}, 'ndvi', []],
            ['Landsat 8 surface reflectance, holding the tasseled cap\'s inputs', LANDSAT_8, SR, 'brightness', []],
            ['Sentinel-2, holding the tasseled cap\'s inputs', SENTINEL_2, SR, 'brightness', []],
            ['a Planet basemap, lacking the tasseled cap\'s SWIR inputs', planet('BASEMAPS'), {}, 'brightness', ['brightness']],
            ['NICFI, lacking the tasseled cap\'s SWIR inputs', planet('NICFI'), {}, 'brightness', ['brightness']],
            ['histogram-matched Planet Daily, lacking the tasseled cap\'s SWIR inputs', planet('DAILY'), {histogramMatching: 'ENABLED'}, 'brightness', ['brightness']],
            ['unmatched Planet Daily, whose imagery never holds the tasseled cap\'s SWIR inputs', planet('DAILY'), {histogramMatching: 'DISABLED'}, 'brightness', ['brightness']]
        ]) {
            it(`over ${collection}, choosing ${band}, refuses ${JSON.stringify(unsupported)}`, () => {
                const recipe = recipeOf({type, field, sources, options, chosen: chosen([band])})

                assert.deepEqual(unsupportedOf(recipe), unsupported.length ? [unsupported] : [])
            })
        }

        it('judges nothing while no data set is selected', () => {
            const recipe = recipeOf({type, field, sources: {dataSets: {}}, chosen: chosen(['thermal2'])})

            assert.deepEqual(unsupportedOf(recipe), [])
        })

        it('leaves a classified output to the rule for classified outputs', () => {
            const recipe = recipeOf({type, field, chosen: chosen(['probability_1'])})

            assert.ok(codesOf(readinessOf(recipe, 'IMAGE_OUTPUT')).includes('UNSUPPORTED_CLASSIFIED_OUTPUT'))
            assert.deepEqual(unsupportedOf(recipe), [])
        })

        it('is judged alike whatever the dates and cloud threshold', () => {
            const unsupported = overrides => unsupportedOf(recipeOf({type, field, chosen: chosen(['thermal2']), ...overrides}))

            assert.deepEqual(unsupported({sources: {...LANDSAT_8, cloudPercentageThreshold: 10}}), [['thermal2']])
            assert.deepEqual(unsupported({sources: {...LANDSAT_8, cloudPercentageThreshold: 100}}), [['thermal2']])
            assert.deepEqual(unsupported({dates: {startDate: '1990-01-01', endDate: '1991-01-01', fromYear: 1990, toYear: 1991}}), [['thermal2']])
        })
    })
}

for (const {type, field, chosen} of TYPES) {
    describe(`a ${type} choosing an index its collection cannot compute`, () => {
        it('names the inputs the index table declares that its optical data sets lack, and those data sets', () => {
            const recipe = recipeOf({type, field, sources: {dataSets: {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}}, chosen: chosen(['ebbi'])})

            assert.deepEqual(missingInputsOf(recipe), [[{index: 'ebbi', bands: ['thermal'], dataSets: ['SENTINEL_2']}]])
        })

        for (const [collection, sources, options, band] of [
            ['Landsat 8 surface reflectance, lacking a native band', LANDSAT_8, SR, 'thermal2'],
            ['Sentinel-1', SENTINEL_1, {}, 'ndvi'],
            ['a Planet basemap', planet('BASEMAPS'), {}, 'ebbi']
        ]) {
            it(`names no inputs over ${collection}, choosing ${band}`, () => {
                const recipe = recipeOf({type, field, sources, options, chosen: chosen([band])})

                assert.deepEqual(missingInputsOf(recipe), [undefined])
            })
        }
    })
}

describe('a CCDC choosing several breakpoint bands its collection does not carry', () => {
    it('names each, in the order chosen', () => {
        const recipe = recipeOf({type: 'CCDC', field: 'breakpointBands', chosen: ['pan', 'ndvi', 'thermal2']})

        assert.deepEqual(unsupportedOf(recipe), [['pan', 'thermal2']])
    })

    it('can still chart a pixel\'s observations, which fit no breakpoint band', () => {
        const recipe = recipeOf({type: 'CCDC', field: 'breakpointBands', chosen: ['thermal2']})

        assert.equal(readinessOf(recipe, 'PIXEL_OBSERVATIONS').status, 'READY')
    })
})

function planet(source) {
    return {dataSets: {PLANET: [source]}}
}

// Selecting no Classification, over Landsat 8 surface reflectance unless `sources` and `options` say otherwise.
function recipeOf({type, field, sources = LANDSAT_8, options = SR, dates = DATES, chosen}) {
    return {
        id: `${type.toLowerCase()}-1`,
        type,
        model: {
            aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
            dates,
            sources: {classification: null, ...sources, [field]: chosen},
            options,
            ...(type === 'CCDC' && {ccdcOptions: {dateFormat: 1, minObservations: 6}})
        }
    }
}

const readinessOf = (recipe, operation) => readReadiness({
    graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
    operation,
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type)
}).readiness

const codesOf = readiness => (readiness.findings || []).map(({code}) => code)

const collectionBandFindings = recipe => (readinessOf(recipe, 'IMAGE_OUTPUT').findings || [])
    .filter(({code}) => code === 'UNSUPPORTED_COLLECTION_BANDS')

const unsupportedOf = recipe => collectionBandFindings(recipe).map(({unsupported}) => unsupported)

const missingInputsOf = recipe => collectionBandFindings(recipe).map(({missingInputs}) => missingInputs)

// What a recipe analysing one index offers: the indexes among the measures, never a native or tasseled-cap band, in the
// order the index table lists them.
describe('the indexes a collection carries', () => {
    it('are its measures that are indexes, in their order', () => {
        assert.deepEqual(collectionIndexes({sources: {dataSets: {LANDSAT: ['LANDSAT_TM']}}, options: {corrections: ['SR']}}), INDEXES)
    })

    it('leave out an index one data set chosen cannot compute', () => {
        const model = {sources: {dataSets: {LANDSAT: ['LANDSAT_TM'], SENTINEL_2: ['SENTINEL_2']}}, options: {corrections: ['SR']}}

        assert.deepEqual(collectionIndexes(model), INDEXES.filter(index => index !== 'ebbi'))
    })

    it('are none without a data set', () => {
        assert.deepEqual(collectionIndexes({sources: {dataSets: {}}, options: {corrections: ['SR']}}), [])
    })
})

const INDEXES = ['ndvi', 'ndmi', 'ndwi', 'mndwi', 'ndfi', 'evi', 'evi2', 'savi', 'nbr', 'mvi', 'ui', 'ndbi', 'ibi', 'nbi', 'ebbi', 'bui', 'kndvi']
