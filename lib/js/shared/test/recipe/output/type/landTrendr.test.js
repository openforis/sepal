import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {REQUIRED_BANDS_BY_INDEX} from '#sepal/recipe/optical/opticalBands'
import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {annualMosaicRecipe} from '#sepal/recipe/type/landTrendr'
import {assertMatches} from '#sepal/testSupport/assert'

// LandTrendr's annual mosaic, resolved through the registered declarations and the real resolver.

describe('the annual mosaic a LandTrendr layer shows', () => {
    it('is described as the optical mosaic of the same data sets and options, without observing anything', () => {
        const recipe = landTrendr()

        const {description, diagnostics, observed} = resolve(recipe, {year: 2018})

        assert.deepEqual(diagnostics, [])
        assert.deepEqual(observed, [])
        assert.deepEqual(
            description.output.bands,
            resolve(opticalMosaicOf(recipe)).description.output.bands
        )
        assert.ok(!bandNames(description).includes('yod'))
    })

    it('is described under the LandTrendr recipe, identified by its product and year', () => {
        const recipe = landTrendr()

        const {description} = resolve(recipe, {year: 2018})

        assert.deepEqual(description.executionReference, {type: 'RECIPE_REF', id: recipe.id})
        assert.deepEqual(
            description.output.product,
            {name: 'ANNUAL_MOSAIC', parameters: {year: 2018}}
        )
    })

    // The recipe's options may ask for a medoid; the annual mosaic is a median, so the date bands only a medoid keeps
    // are not offered.
    it('is a median composite whatever the options ask for', () => {
        const {description} = resolve(landTrendr({options: {corrections: ['SR'], compose: 'MEDOID'}}), {year: 2018})

        assert.ok(!bandNames(description).includes('unixTimeDays'))
    })

    for (const [scenario, parameters] of [
        ['omitted', {}],
        ['undefined', {year: undefined}],
        ['null', {year: null}]
    ]) {
        it(`shows the last fitted year when its year is ${scenario}`, () => {
            const {description} = resolve(landTrendr({dates: {startYear: 2014, endYear: 2021}}), parameters)

            assert.deepEqual(description.output.product.parameters, {year: 2021})
        })
    }

    // The picker offers the fitted range; execution takes any year.
    for (const year of [1990, 2030]) {
        it(`shows year ${year}, outside the fitted range`, () => {
            const {description} = resolve(landTrendr({dates: {startYear: 2014, endYear: 2021}}), {year})

            assert.deepEqual(description.output.product.parameters, {year})
        })
    }

    for (const [scenario, year] of [
        ['a numeric string', '2020'],
        ['a fraction', 2020.5],
        ['infinity', Infinity],
        ['not a number', NaN],
        ['a boolean', true]
    ]) {
        it(`is refused for a year that is ${scenario}`, () => {
            assertMatches(resolve(landTrendr(), {year}), {
                description: null,
                diagnostics: [{code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'year'], recipePath: ['landtrendr-1'], product: 'ANNUAL_MOSAIC'}]
            })
        })
    }

    it('is refused for a parameter it does not take', () => {
        assertMatches(
            resolve(landTrendr(), {year: 2020, month: 6}).diagnostics,
            [{code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'month']}]
        )
    })

    it('is refused when it would show a last fitted year that is not an integer', () => {
        assertMatches(
            resolve(landTrendr({dates: {startYear: 2014, endYear: '2021'}}), {}).diagnostics,
            [{code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'year']}]
        )
    })

    it('leaves the change output as it is declared', () => {
        assert.deepEqual(
            bandNames(resolve(landTrendr()).description),
            ['yod', 'mag', 'dur', 'preval', 'postval', 'rmse', 'sig']
        )
    })
})

// Built once, for description and execution alike.
describe('the mosaic built for a year', () => {
    it('covers that calendar year alone, centred mid-year', () => {
        assert.deepEqual(annualMosaicRecipe(landTrendr(), 2018).model.dates, {
            targetDate: '2018-07-01',
            seasonStart: '2018-01-01',
            seasonEnd: '2019-01-01',
            yearsBefore: 0,
            yearsAfter: 0
        })
    })

    it('composites every scene of the series\' AOI and sources, with its options, as a median', () => {
        const recipe = landTrendr({options: {corrections: ['SR'], compose: 'MEDOID', cloudBuffer: 0}})

        assertMatches(annualMosaicRecipe(recipe, 2018), {
            type: 'MOSAIC',
            model: {
                aoi: recipe.model.aoi,
                sources: recipe.model.sources,
                sceneSelectionOptions: {type: 'ALL'},
                compositeOptions: {corrections: ['SR'], compose: 'MEDIAN', cloudBuffer: 0}
            }
        })
    })
})

// What its change map needs of its Sources: data sets, at least one of which may hold imagery in its years, and an index
// the collection they configure can carry. Codes are literals.
describe('a LandTrendr\'s change map', () => {
    it('can run with an index its data sets carry, over years they cover', () => {
        assert.equal(readinessOf(landTrendr()).status, 'READY')
    })

    it('cannot run an index its data sets cannot carry, refused at the index with the inputs they lack', () => {
        const recipe = landTrendr({sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, index: 'ebbi'}})

        assert.deepEqual(findingsOf(recipe), [{
            code: 'UNSUPPORTED_COLLECTION_BANDS',
            path: ['model', 'sources', 'index'],
            unsupported: ['ebbi'],
            missingInputs: [{index: 'ebbi', bands: ['thermal'], dataSets: ['SENTINEL_2']}]
        }])
    })

    it('can be repaired by removing the data sets lacking the index\'s inputs, where the rest could run', () => {
        const recipe = landTrendr({sources: {dataSets: {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}, index: 'ebbi'}})

        assertMatches(findingsOf(recipe), [{
            code: 'UNSUPPORTED_COLLECTION_BANDS',
            missingInputs: [{index: 'ebbi', bands: ['thermal'], dataSets: ['SENTINEL_2']}],
            removable: ['SENTINEL_2']
        }])
    })

    // Data-set readers flatten each group, so a group saved as a single identifier reads as that one data set.
    it('names the missing inputs, and the removal repairing them, where a data-set group is a single identifier', () => {
        const recipe = landTrendr({sources: {dataSets: {LANDSAT: ['LANDSAT_8'], SENTINEL_2: 'SENTINEL_2'}, index: 'ebbi'}})

        assertMatches(findingsOf(recipe), [{
            code: 'UNSUPPORTED_COLLECTION_BANDS',
            missingInputs: [{index: 'ebbi', bands: ['thermal'], dataSets: ['SENTINEL_2']}],
            removable: ['SENTINEL_2']
        }])
    })

    for (const [_case, dates, dataSets] of [
        ['none would be left', undefined, {SENTINEL_2: ['SENTINEL_2']}],
        ['none left may cover the years', {startYear: 2016, endYear: 2020}, {LANDSAT: ['LANDSAT_TM'], SENTINEL_2: ['SENTINEL_2']}]
    ]) {
        it(`is not repaired by removing them where ${_case}`, () => {
            const [finding] = findingsOf(landTrendr({dates, sources: {dataSets, index: 'ebbi'}}))

            assert.deepEqual(finding.missingInputs, [{index: 'ebbi', bands: ['thermal'], dataSets: ['SENTINEL_2']}])
            assert.equal(finding.removable, undefined)
        })
    }

    // An index the table does not list today, declared for this test alone: the inputs named are those its declaration
    // lists and a data set lacks, whatever the index.
    it('names the inputs the index table declares for an index, those a data set lacks', () => {
        REQUIRED_BANDS_BY_INDEX.redEdgeProbe = ['nir', 'redEdge1', 'redEdge2']
        try {
            const recipe = landTrendr({sources: {dataSets: {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}, index: 'redEdgeProbe'}})

            assertMatches(findingsOf(recipe), [{
                code: 'UNSUPPORTED_COLLECTION_BANDS',
                missingInputs: [{index: 'redEdgeProbe', bands: ['redEdge1', 'redEdge2'], dataSets: ['LANDSAT_8']}],
                removable: ['LANDSAT_8']
            }])
        } finally {
            delete REQUIRED_BANDS_BY_INDEX.redEdgeProbe
        }
    })

    // Execution reads a native band by name as it reads an index.
    it('can run a native band saved as its index, where the data sets carry it', () => {
        assert.equal(readinessOf(landTrendr({sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'swir1'}})).status, 'READY')
    })

    it('refuses a native band its data sets cannot carry without inputs to name', () => {
        const recipe = landTrendr({sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, index: 'thermal'}})

        assert.deepEqual(findingsOf(recipe), [{code: 'UNSUPPORTED_COLLECTION_BANDS', path: ['model', 'sources', 'index'], unsupported: ['thermal']}])
    })

    // Execution intersects the bands of every data set chosen before it filters scenes by date.
    it('judges the index over every data set chosen, one the dates exclude included', () => {
        const dates = {startYear: 1985, endYear: 1995}
        const thematicMapper = landTrendr({dates, sources: {dataSets: {LANDSAT: ['LANDSAT_TM']}, index: 'ebbi'}})
        const withSentinel = landTrendr({dates, sources: {dataSets: {LANDSAT: ['LANDSAT_TM'], SENTINEL_2: ['SENTINEL_2']}, index: 'ebbi'}})

        assert.equal(readinessOf(thematicMapper).status, 'READY')
        assert.deepEqual(findingsOf(withSentinel).map(({code}) => code), ['UNSUPPORTED_COLLECTION_BANDS'])
    })

    // A blank index is a missing one, not one the collection cannot compute.
    for (const [_case, index] of [['absent', undefined], ['null', null], ['blank', '']]) {
        it(`cannot run without an index, ${_case}, refused at the index for that alone`, () => {
            const recipe = landTrendr({sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, index}})

            assert.deepEqual(findingsOf(recipe), [{code: 'MISSING_INDEX', path: ['model', 'sources', 'index']}])
        })
    }

    for (const [_case, dataSets] of [['an empty object', {}], ['empty lists', {LANDSAT: [], SENTINEL_2: []}], ['none at all', undefined], ['null', null]]) {
        it(`cannot run without a data set, ${_case}, refused at the data sets alone`, () => {
            const recipe = landTrendr({sources: {dataSets, index: 'nbr'}})

            assert.deepEqual(findingsOf(recipe), [{code: 'MISSING_DATA_SETS', path: ['model', 'sources', 'dataSets']}])
        })
    }

    it('cannot run years no data set chosen may hold imagery for, refused at the data sets', () => {
        const recipe = landTrendr({dates: {startYear: 2000, endYear: 2010}, sources: {dataSets: {LANDSAT: ['LANDSAT_9']}, index: 'nbr'}})

        assert.deepEqual(findingsOf(recipe), [
            {code: 'NO_PERIOD_OVERLAP', path: ['model', 'sources', 'dataSets'], startYear: 2000, endYear: 2010}
        ])
    })

    for (const [_case, dataSets, dates] of [
        ['one data set covering part of them', {LANDSAT: ['LANDSAT_9', 'LANDSAT_7']}, {startYear: 2000, endYear: 2010}],
        ['their last year the first of a data set', {LANDSAT: ['LANDSAT_9']}, {startYear: 2015, endYear: 2021}],
        ['their first year the last of a data set', {LANDSAT: ['LANDSAT_TM']}, {startYear: 2012, endYear: 2020}]
    ]) {
        it(`can run years overlapping ${_case}`, () => {
            assert.equal(readinessOf(landTrendr({dates, sources: {dataSets, index: 'nbr'}})).status, 'READY')
        })
    }

    // Landsat 4 imagery begins in August 1982, in Tier 1 and Tier 2 alike.
    for (const dataSet of ['LANDSAT_TM', 'LANDSAT_TM_T2']) {
        it(`can run the first years ${dataSet} covers, not the year before`, () => {
            const recipeOver = dates => landTrendr({dates, sources: {dataSets: {LANDSAT: [dataSet]}, index: 'nbr'}})

            assert.equal(readinessOf(recipeOver({startYear: 1982, endYear: 1983})).status, 'READY')
            assert.deepEqual(findingsOf(recipeOver({startYear: 1981, endYear: 1981})).map(({code}) => code), ['NO_PERIOD_OVERLAP'])
        })
    }

    it('cannot run years after a data set that has ended', () => {
        const recipe = landTrendr({dates: {startYear: 2013, endYear: 2020}, sources: {dataSets: {LANDSAT: ['LANDSAT_TM']}, index: 'nbr'}})

        assert.deepEqual(findingsOf(recipe).map(({code}) => code), ['NO_PERIOD_OVERLAP'])
    })

    // The annual mosaic reads no index and is asked for a year of its own.
    it('holds no annual mosaic for what it finds', () => {
        const recipe = landTrendr({dates: {startYear: 2000, endYear: 2010}, sources: {dataSets: {LANDSAT: ['LANDSAT_9']}, index: undefined}})

        assert.equal(readinessOf(recipe, 'ANNUAL_MOSAIC').status, 'READY')
    })
})

const readinessOf = (recipe, operation = 'IMAGE_OUTPUT') => readReadiness({
    graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
    operation,
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type)
}).readiness

const findingsOf = recipe => readinessOf(recipe).findings.map(({recipePath: _recipePath, ...finding}) => finding)

const landTrendr = ({
    dates = {startYear: 2014, endYear: 2021},
    options = {corrections: ['SR'], compose: 'MEDIAN'},
    sources = {dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']}, index: 'nbr'}
} = {}) => ({
    id: 'landtrendr-1',
    type: 'LANDTRENDR',
    model: {
        aoi: {type: 'POLYGON', path: [[-60.1, -3.1], [-60, -3.1], [-60, -3], [-60.1, -3.1]]},
        dates,
        sources: {cloudPercentageThreshold: 75, ...sources},
        options,
        landTrendrOptions: {}
    }
})

// An Optical Mosaic recipe a user could have saved with the same data sets and options.
const opticalMosaicOf = ({model: {aoi, sources: {dataSets}, options}}) => ({
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {aoi, sources: {dataSets, cloudPercentageThreshold: 100}, compositeOptions: {...options, compose: 'MEDIAN'}}
})

const resolve = (recipe, parameters) => {
    const observed = []
    const result = resolveImageOutput({
        graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: reference => {
            observed.push(reference)
            return undefined
        },
        product: parameters && {name: 'ANNUAL_MOSAIC', parameters},
        productFor: (recipe, name) => recipeType(recipe.type)?.mapProducts?.[name]
    })
    return {...result, observed}
}

const bandNames = description => description.output.bands.map(({name}) => name)
