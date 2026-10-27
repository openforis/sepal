import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {readReadiness} from '#sepal/recipe/output/readImageOutput'
import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {assertMatches} from '#sepal/testSupport/assert'

// The collection mosaic a Change Alerts layer shows instead of its changes, resolved through the registered
// declarations and the real resolver. Codes and paths are literals.

describe('the collection mosaic a Change Alerts layer shows', () => {
    for (const [family, type] of [
        ['OPTICAL', 'MOSAIC'],
        ['RADAR', 'RADAR_MOSAIC'],
        ['PLANET', 'PLANET_MOSAIC']
    ]) {
        it(
            `over ${family} sources is described as the mosaic its own model builds, without observing anything`,
            () => {
                VIEWS.forEach(parameters => {
                    const recipe = changeAlerts({sources: SOURCES[family]})
                    const [delegated] = delegatedRecipes(recipe, parameters)

                    const {description, diagnostics, observed} = resolve(recipe, parameters)

                    assert.deepEqual(diagnostics, [])
                    assert.deepEqual(observed, [])
                    assert.equal(delegated.type, type)
                    assert.deepEqual(description.output.bands, canonicalBands(delegated))
                })
            }
        )
    }

    it('is described under the Change Alerts recipe, identified by its product, period and mosaic type', () => {
        const recipe = changeAlerts()

        const {description} = resolve(recipe, {period: 'calibration', mosaicType: 'median'})

        assert.deepEqual(description.executionReference, {type: 'RECIPE_REF', id: recipe.id})
        assert.deepEqual(
            description.output.product,
            {name: 'COLLECTION_MOSAIC', parameters: {period: 'calibration', mosaicType: 'median'}}
        )
    })

    it('differs between a latest and a median radar mosaic, a point in time against a scan of the period', () => {
        const recipe = changeAlerts({sources: RADAR})

        assert.deepEqual(
            bandNames(resolve(recipe, {period: 'monitoring', mosaicType: 'latest'})),
            ['VV', 'VH', 'ratio_VV_VH', 'orbit', 'dayOfYear', 'daysFromTarget']
        )
        assert.ok(
            bandNames(resolve(recipe, {period: 'monitoring', mosaicType: 'median'})).includes('VV_med')
        )
    })

    // What Change Alerts saved is what execution builds from; the CCDC it monitors only places it.
    it('follows the sources and options Change Alerts saved, whatever the CCDC it monitors is configured with', () => {
        const recipe = changeAlerts({reference: {type: 'RECIPE_REF', id: 'ccdc-1'}, sources: OPTICAL})
        const ccdc = {
            id: 'ccdc-1',
            type: 'CCDC',
            model: {sources: RADAR, options: {orbits: ['DESCENDING']}, dates: {}}
        }

        const {description, observed} = resolve(recipe, {period: 'monitoring', mosaicType: 'latest'}, [ccdc])
        const [delegated] = delegatedRecipes(recipe, {period: 'monitoring', mosaicType: 'latest'})

        assert.deepEqual(observed, [])
        assert.deepEqual(delegated.model.sources, OPTICAL)
        assertMatches(delegated.model.compositeOptions, OPTIONS)
        assert.ok(description.output.bands.map(({name}) => name).includes('red'))
    })

    it('is described while the CCDC it monitors is not even loaded', () => {
        const {description} = resolve(changeAlerts({reference: {type: 'RECIPE_REF', id: 'ccdc-1'}}), {period: 'monitoring', mosaicType: 'median'})

        assert.ok(description.output.bands.map(({name}) => name).includes('red'))
    })

    for (const [scenario, parameters, parameter] of [
        ['omits its period', {mosaicType: 'latest'}, 'period'],
        ['omits its mosaic type', {period: 'monitoring'}, 'mosaicType'],
        ['names the changes as its period', {period: 'changes', mosaicType: 'latest'}, 'period'],
        ['capitalizes its period', {period: 'MONITORING', mosaicType: 'latest'}, 'period'],
        ['names another mosaic type', {period: 'monitoring', mosaicType: 'mean'}, 'mosaicType'],
        ['gives its mosaic type as null', {period: 'calibration', mosaicType: null}, 'mosaicType'],
        ['takes a parameter it does not declare', {period: 'monitoring', mosaicType: 'latest', year: 2023}, 'year']
    ]) {
        it(`is refused when a layer ${scenario}`, () => {
            assertMatches(resolve(changeAlerts(), parameters), {
                description: null,
                diagnostics: [{code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', parameter], recipePath: ['alerts-1'], product: 'COLLECTION_MOSAIC'}]
            })
        })
    }
})

// The recipe each view is delegated as, read from what Radar, Optical or Planet Mosaic is asked to describe: the
// bands alone could not show a wrong date or a dropped setting. No area is stated; execution supplies the reference's.
describe('the mosaic a view is delegated as', () => {
    const DATES = {monitoringEnd: '2024-03-31', monitoringStart: '2024-02-29', calibrationStart: '2024-01-29'}
    const date = {
        monitoringEnd: '2024-03-31', monitoringDuration: 1, monitoringDurationUnit: 'months',
        calibrationDuration: 1, calibrationDurationUnit: 'months'
    }

    for (const [period, mosaicType, dates, percentile] of [
        ['monitoring', 'latest', {targetDate: DATES.monitoringEnd, seasonStart: DATES.monitoringStart, seasonEnd: DATES.monitoringEnd}, 100],
        ['monitoring', 'median', {targetDate: DATES.monitoringEnd, seasonStart: DATES.monitoringStart, seasonEnd: DATES.monitoringEnd}, 0],
        ['calibration', 'latest', {targetDate: DATES.monitoringStart, seasonStart: DATES.calibrationStart, seasonEnd: DATES.monitoringStart}, 100],
        ['calibration', 'median', {targetDate: DATES.monitoringStart, seasonStart: DATES.calibrationStart, seasonEnd: DATES.monitoringStart}, 0]
    ]) {
        it(
            `composites the ${period} period for an optical ${mosaicType} mosaic`,
            () => {
                assert.deepEqual(
                    delegatedRecipes(changeAlerts({date, sources: OPTICAL}), {period, mosaicType}),
                    [{
                        type: 'MOSAIC',
                        model: {
                            dates: {...dates, yearsBefore: 0, yearsAfter: 0},
                            sources: OPTICAL,
                            sceneSelectionOptions: {type: 'ALL'},
                            compositeOptions: {...OPTIONS, filters: [{type: 'DAY_OF_YEAR', percentile}], compose: 'MEDIAN'}
                        }
                    }]
                )
            }
        )
    }

    for (const [period, mosaicType, dates] of [
        ['monitoring', 'latest', {targetDate: DATES.monitoringEnd}],
        ['monitoring', 'median', {fromDate: DATES.monitoringStart, toDate: DATES.monitoringEnd}],
        ['calibration', 'latest', {targetDate: DATES.monitoringStart}],
        ['calibration', 'median', {fromDate: DATES.calibrationStart, toDate: DATES.monitoringStart}]
    ]) {
        it(
            `stands at or scans the ${period} period for a radar ${mosaicType} mosaic`,
            () => {
                const [delegated] = delegatedRecipes(changeAlerts({date, sources: RADAR}), {period, mosaicType})

                const {dates: delegatedDates, ...model} = delegated.model
                assert.deepEqual({...delegated, model}, {type: 'RADAR_MOSAIC', model: {options: OPTIONS}})
                assert.deepEqual(definedFields(delegatedDates), dates)
            }
        )
    }

    for (const [period, mosaicType, dates] of [
        ['monitoring', 'latest', {targetDate: DATES.monitoringEnd, fromDate: DATES.monitoringStart, toDate: DATES.monitoringEnd}],
        ['monitoring', 'median', {fromDate: DATES.monitoringStart, toDate: DATES.monitoringEnd}],
        ['calibration', 'latest', {targetDate: DATES.monitoringStart, fromDate: DATES.calibrationStart, toDate: DATES.monitoringStart}],
        ['calibration', 'median', {fromDate: DATES.calibrationStart, toDate: DATES.monitoringStart}]
    ]) {
        it(
            `selects within the ${period} period for a Planet ${mosaicType} mosaic`,
            () => {
                const [delegated] = delegatedRecipes(changeAlerts({date, sources: PLANET}), {period, mosaicType})

                const {dates: delegatedDates, ...model} = delegated.model
                assert.deepEqual({...delegated, model}, {
                    type: 'PLANET_MOSAIC',
                    model: {sources: {source: 'DAILY', assets: PLANET.assets}, options: OPTIONS}
                })
                assert.deepEqual(definedFields(delegatedDates), dates)
            }
        )
    }

    it('counts a period stated in weeks and days, as the form saves them, at both boundaries', () => {
        const [delegated] = delegatedRecipes(changeAlerts({
            date: {
                monitoringEnd: '2024-01-10', monitoringDuration: '2', monitoringDurationUnit: 'weeks',
                calibrationDuration: '30', calibrationDurationUnit: 'days'
            },
            sources: RADAR
        }), {period: 'calibration', mosaicType: 'median'})

        assert.deepEqual(
            definedFields(delegated.model.dates),
            {fromDate: '2023-11-27', toDate: '2023-12-27'}
        )
    })

    it('keeps a period in a year below 100 in that year', () => {
        const [delegated] = delegatedRecipes(changeAlerts({
            date: {
                monitoringEnd: '0096-03-31', monitoringDuration: 1, monitoringDurationUnit: 'months',
                calibrationDuration: 1, calibrationDurationUnit: 'days'
            },
            sources: RADAR
        }), {period: 'calibration', mosaicType: 'median'})

        assert.deepEqual(
            definedFields(delegated.model.dates),
            {fromDate: '0096-02-28', toDate: '0096-02-29'}
        )
    })
})

// A mosaic is described only from a complete period and a source it can be built from. What is missing is incomplete,
// and what is there but cannot be meant malformed, located where the model states it.
describe('the collection mosaic of a recipe that cannot build it', () => {
    for (const field of ['monitoringEnd', 'monitoringDuration', 'monitoringDurationUnit', 'calibrationDuration', 'calibrationDurationUnit']) {
        it(
            `is refused in every view without ${field}, which the complete period needs`,
            () => {
                VIEWS.forEach(parameters => {
                    [undefined, null, ''].forEach(value => assert.deepEqual(
                        refusal(changeAlerts({date: {...PERIOD, [field]: value}}), parameters),
                        [{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'date', field]}]
                    ))
                })
            }
        )
    }

    for (const [scenario, date, field] of [
        ['an end that is not a date', {monitoringEnd: 'soon'}, 'monitoringEnd'],
        ['an end on a day its month does not have', {monitoringEnd: '2024-02-30'}, 'monitoringEnd'],
        ['an end given as a number', {monitoringEnd: 20240301}, 'monitoringEnd'],
        ['a fractional monitoring duration', {monitoringDuration: 1.5}, 'monitoringDuration'],
        ['a calibration duration in words', {calibrationDuration: 'three'}, 'calibrationDuration'],
        ['a unit the form does not offer', {calibrationDurationUnit: 'years'}, 'calibrationDurationUnit'],
        ['a unit it cannot count', {monitoringDurationUnit: 'fortnights'}, 'monitoringDurationUnit'],
        ['a monitoring start before year 0', {monitoringDuration: 30000, monitoringDurationUnit: 'months'}, 'monitoringDuration'],
        ['a calibration start before year 0', {monitoringEnd: '0000-01-02', monitoringDuration: 1, monitoringDurationUnit: 'days', calibrationDuration: 1}, 'calibrationDuration']
    ]) {
        it(`is refused for ${scenario}`, () => {
            assert.deepEqual(
                refusal(changeAlerts({date: {...PERIOD, ...date}}), {period: 'monitoring', mosaicType: 'latest'}),
                [{code: 'MALFORMED_IMAGE_OUTPUT', path: ['model', 'date', field]}]
            )
        })
    }

    for (const [scenario, family, change, code, path] of [
        ['states no data set type', 'OPTICAL', {dataSetType: undefined}, 'INCOMPLETE_IMAGE_OUTPUT', ['dataSetType']],
        ['states no sources at all', null, null, 'INCOMPLETE_IMAGE_OUTPUT', ['dataSetType']],
        ['names a data set type no mosaic is built for', 'OPTICAL', {dataSetType: 'LIDAR'}, 'MALFORMED_IMAGE_OUTPUT', ['dataSetType']],
        ['are Planet without data sets', 'PLANET', {dataSets: undefined}, 'INCOMPLETE_IMAGE_OUTPUT', ['dataSets', 'PLANET']],
        ['are Planet without a Planet data set', 'PLANET', {dataSets: {}}, 'INCOMPLETE_IMAGE_OUTPUT', ['dataSets', 'PLANET']],
        ['are Planet with an empty list', 'PLANET', {dataSets: {PLANET: []}}, 'INCOMPLETE_IMAGE_OUTPUT', ['dataSets', 'PLANET']],
        ['are Planet with a source that is no list', 'PLANET', {dataSets: {PLANET: 'DAILY'}}, 'MALFORMED_IMAGE_OUTPUT', ['dataSets', 'PLANET']],
        ['are Planet with something merely indexable', 'PLANET', {dataSets: {PLANET: {0: 'DAILY'}}}, 'MALFORMED_IMAGE_OUTPUT', ['dataSets', 'PLANET']],
        ['are Planet with a source it does not support', 'PLANET', {dataSets: {PLANET: ['SENTINEL_1']}}, 'MALFORMED_IMAGE_OUTPUT', ['dataSets', 'PLANET']]
    ]) {
        it(`is refused when its sources ${scenario}`, () => {
            const sources = family ? {...SOURCES[family], ...change} : null

            assert.deepEqual(
                refusal(changeAlerts({sources}), {period: 'calibration', mosaicType: 'median'}),
                [{code, path: ['model', 'sources', ...path]}]
            )
        })
    }

    for (const source of ['NICFI', 'BASEMAPS', 'DAILY']) {
        it(`is described over the Planet ${source} source`, () => {
            const {description} = resolve(changeAlerts({sources: {...PLANET, dataSets: {PLANET: [source]}}}), {period: 'monitoring', mosaicType: 'latest'})

            assert.ok(description.output.bands.map(({name}) => name).includes('kndvi'))
        })
    }

    it('says both why the period and why the sources cannot build it', () => {
        assert.deepEqual(
            refusal(changeAlerts({date: {...PERIOD, monitoringEnd: undefined}, sources: {...OPTICAL, dataSetType: undefined}}), {period: 'monitoring', mosaicType: 'median'}),
            [
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'date', 'monitoringEnd']},
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'sources', 'dataSetType']}
            ]
        )
    })

    it('leaves the changes described whatever the period and sources state', () => {
        const {description} = resolve(changeAlerts({date: {}, sources: null}))

        assert.equal(description.output.product, undefined)
        assert.ok(description.output.bands.map(({name}) => name).includes('confidence'))
    })
})

const PERIOD = {
    monitoringEnd: '2024-06-15', monitoringDuration: 2, monitoringDurationUnit: 'months',
    calibrationDuration: 3, calibrationDurationUnit: 'months'
}
const OPTIONS = {corrections: ['SR'], orbits: ['ASCENDING'], histogramMatching: 'DISABLED'}
const OPTICAL = {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 75}
const RADAR = {band: 'VV', dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}
const PLANET = {band: 'ndvi', dataSetType: 'PLANET', dataSets: {PLANET: ['DAILY']}, assets: ['users/x/daily']}
const SOURCES = {OPTICAL, RADAR, PLANET}

const VIEWS = ['monitoring', 'calibration'].flatMap(period => ['latest', 'median'].map(mosaicType => ({period, mosaicType})))

const changeAlerts = ({reference = {type: 'ASSET', id: 'users/x/segments'}, date = PERIOD, sources = OPTICAL} = {}) => ({
    id: 'alerts-1',
    type: 'CHANGE_ALERTS',
    model: {reference, date, sources, options: OPTIONS, changeAlertsOptions: {minConfidence: 5}}
})

// The recipes the product asks another type to describe.
const delegatedRecipes = (recipe, parameters) => {
    const delegated = []
    recipeType('CHANGE_ALERTS').mapProducts.COLLECTION_MOSAIC.describe({
        recipe,
        parameters,
        delegate: mosaic => {
            delegated.push(mosaic)
            return {bands: [], evidence: []}
        }
    })
    return delegated
}

// A mosaic's own canonical description, as its recipe type declares it.
const canonicalBands = mosaic => {
    const recipe = {id: 'mosaic-1', ...mosaic}
    return resolveImageOutput({
        graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: () => undefined
    }).description.output.bands
}

const definedFields = object => Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined))

const bandNames = ({description}) => description.output.bands.map(({name}) => name)

const refusal = (recipe, parameters) =>
    resolve(recipe, parameters).diagnostics.map(({code, path}) => ({code, path}))

const resolve = (recipe, parameters, others = []) => {
    const observed = []
    const result = resolveImageOutput({
        graph: buildRecipeDependencyGraph({
            rootRecipe: recipe,
            recipesById: new Map([recipe, ...others].map(record => [record.id, record]))
        }),
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: reference => {
            observed.push(reference)
            return undefined
        },
        product: parameters && {name: 'COLLECTION_MOSAIC', parameters},
        productFor: (recipe, name) => recipeType(recipe.type)?.mapProducts?.[name]
    })
    return {...result, observed}
}

// Change Alerts monitors a band of its imagery and uses no Classification (what it depends on: directSources.test.js). A
// band a Classification computes is refused at the band.
describe('the band a Change Alerts monitors', () => {
    const alertsOver = sources => ({
        id: 'alerts-1',
        type: 'CHANGE_ALERTS',
        model: {
            reference: {type: 'ASSET', id: 'users/x/segments'},
            sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'ndvi', classification: 'copied-classification', ...sources}
        }
    })
    for (const operation of ['IMAGE_OUTPUT', 'PIXEL_SEGMENTS', 'PIXEL_OBSERVATIONS']) {
        it(`cannot run a band a Classification computes for ${operation}, refused at the band`, () => {
            const recipe = alertsOver({band: 'probability_1'})

            assert.deepEqual(readinessOf(recipe, operation).findings.map(({code, path, band}) => ({code, path, band})), [
                {code: 'CLASSIFIED_MONITORED_BAND', path: ['model', 'sources', 'band'], band: 'probability_1'}
            ])
        })
    }

    it('can run a band of its imagery, whatever Classification was copied', () => {
        assert.equal(readinessOf(alertsOver({})).status, 'READY')
    })
})

const readinessOf = (recipe, operation = 'IMAGE_OUTPUT') => readReadiness({
    graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
    operation,
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type)
}).readiness
