import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {assertMatches} from '#sepal/testSupport/assert'

// The radar observation a BAYTS Alerts layer shows instead of its alerts, resolved through the registered declarations
// and the real resolver. Codes and paths are literals.

describe('the radar observation a BAYTS Alerts layer shows', () => {
    for (const position of ['first', 'last']) {
        it(
            `at its ${position} position is described as a point-in-time Radar Mosaic, without observing anything`,
            () => {
                const {description, diagnostics, observed} = resolve(baytsAlerts(), {position})

                assert.deepEqual(diagnostics, [])
                assert.deepEqual(observed, [])
                assert.deepEqual(
                    description.output.bands,
                    resolve(pointInTimeRadarMosaic()).description.output.bands
                )
            }
        )
    }

    for (const position of ['first', 'last']) {
        it(
            `at its ${position} position is described under the BAYTS Alerts recipe, identified by its product and position`,
            () => {
                const recipe = baytsAlerts()

                const {description} = resolve(recipe, {position})

                assert.deepEqual(description.executionReference, {type: 'RECIPE_REF', id: recipe.id})
                assert.deepEqual(
                    description.output.product,
                    {name: 'RADAR_OBSERVATION', parameters: {position}}
                )
            }
        )
    }

    it('is described while the historical reference it monitors is not even loaded', () => {
        const {description} = resolve(baytsAlerts({reference: {type: 'RECIPE_REF', id: 'historical-1'}}), {position: 'first'})

        assert.deepEqual(
            description.output.bands.map(({name}) => name),
            ['VV', 'VH', 'ratio_VV_VH', 'orbit', 'dayOfYear', 'daysFromTarget']
        )
    })

    for (const [scenario, parameters] of [
        ['omitted', {}],
        ['undefined', {position: undefined}],
        ['null', {position: null}],
        ['another word', {position: 'middle'}],
        ['capitalized', {position: 'FIRST'}],
        ['a number', {position: 1}]
    ]) {
        it(`is refused for a position that is ${scenario}`, () => {
            assertMatches(resolve(baytsAlerts(), parameters), {
                description: null,
                diagnostics: [{code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'position'], recipePath: ['alerts-1'], product: 'RADAR_OBSERVATION'}]
            })
        })
    }

    it('is refused for a parameter it does not take', () => {
        assertMatches(
            resolve(baytsAlerts(), {position: 'last', year: 2023}).diagnostics,
            [{code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'year']}]
        )
    })
})

// A position is placed at a date its monitoring period states: the end for the last, the end less its duration for the
// first. A product that date cannot be placed for is refused rather than described as some other mosaic.
describe('the radar observation of a monitoring period that cannot place it', () => {
    for (const position of ['first', 'last']) {
        it(`is refused at its ${position} position without a monitoring end`, () => {
            assert.deepEqual(
                refusal(baytsAlerts({date: {...PERIOD, monitoringEnd: undefined}}), position),
                [{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'date', 'monitoringEnd']}]
            )
            assert.deepEqual(
                refusal(baytsAlerts({date: {...PERIOD, monitoringEnd: ''}}), position),
                [{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'date', 'monitoringEnd']}]
            )
        })
    }

    for (const [scenario, monitoringEnd] of [
        ['not a date', 'soon'],
        ['a month that does not exist', '2023-13-01'],
        ['a day its month does not have', '2023-02-30'],
        ['a number', 20230301]
    ]) {
        it(
            `is refused at either position for a monitoring end that is ${scenario}`,
            () => {
                ['first', 'last'].forEach(position =>
                    assert.deepEqual(
                        refusal(baytsAlerts({date: {...PERIOD, monitoringEnd}}), position),
                        [{code: 'MALFORMED_IMAGE_OUTPUT', path: ['model', 'date', 'monitoringEnd']}]
                    )
                )
            }
        )
    }

    it('places the last without the duration it does not use', () => {
        const {description} = resolve(baytsAlerts({date: {monitoringEnd: '2023-03-01'}}), {position: 'last'})

        assert.deepEqual(description.output.product.parameters, {position: 'last'})
    })

    for (const [scenario, date, field] of [
        ['the duration', {monitoringDuration: undefined}, 'monitoringDuration'],
        ['the duration unit', {monitoringDurationUnit: undefined}, 'monitoringDurationUnit']
    ]) {
        it(`refuses the first without ${scenario}`, () => {
            assert.deepEqual(
                refusal(baytsAlerts({date: {...PERIOD, ...date}}), 'first'),
                [{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'date', field]}]
            )
        })
    }

    for (const [scenario, date, field] of [
        ['a fraction', {monitoringDuration: 2.5}, 'monitoringDuration'],
        ['a word', {monitoringDuration: 'two'}, 'monitoringDuration'],
        ['infinite', {monitoringDuration: Infinity}, 'monitoringDuration'],
        ['a unit the form does not offer', {monitoringDurationUnit: 'years'}, 'monitoringDurationUnit'],
        ['so long no date can be placed before its end', {monitoringDuration: 1e12, monitoringDurationUnit: 'days'}, 'monitoringDuration']
    ]) {
        it(`refuses the first for a duration that is ${scenario}`, () => {
            assert.deepEqual(
                refusal(baytsAlerts({date: {...PERIOD, ...date}}), 'first'),
                [{code: 'MALFORMED_IMAGE_OUTPUT', path: ['model', 'date', field]}]
            )
        })
    }

    // The form keeps what its number input holds, so a duration edited there is saved as its digits.
    for (const [scenario, monitoringDuration] of [
        ['a whole number', 3],
        ['the digits the form saves', '3']
    ]) {
        it(`places the first for a duration that is ${scenario}`, () => {
            const {description} = resolve(baytsAlerts({date: {...PERIOD, monitoringDuration}}), {position: 'first'})

            assert.deepEqual(description.output.product.parameters, {position: 'first'})
        })
    }

    it('leaves the alerts described without any monitoring period', () => {
        const {description} = resolve(baytsAlerts({date: {}}))

        assert.ok(description.output.bands.map(({name}) => name).includes('flag'))
    })
})

// The date each position is delegated at, read from the recipe Radar Mosaic is asked to describe: the bands alone could
// not show a wrong date.
describe('the target date a radar observation is delegated at', () => {
    it('is the monitoring end for the last', () => {
        assert.equal(
            delegatedTarget({...PERIOD, monitoringEnd: '2024-02-29'}, 'last'),
            '2024-02-29'
        )
    })

    for (const [scenario, monitoringEnd, monitoringDuration, monitoringDurationUnit, target] of [
        ['days', '2024-03-01', 1, 'days', '2024-02-29'],
        ['days in a year that is not a leap year', '2023-03-01', 1, 'days', '2023-02-28'],
        ['weeks, across a year', '2024-01-10', 2, 'weeks', '2023-12-27'],
        ['months, keeping the day', '2024-01-15', 13, 'months', '2022-12-15'],
        ['a month, to the last day of a leap February', '2024-03-31', 1, 'months', '2024-02-29'],
        ['a month, to the last day of February', '2023-03-31', 1, 'months', '2023-02-28'],
        ['a month, in a century that is a leap year', '2000-03-31', 1, 'months', '2000-02-29'],
        ['a month, in a century that is not', '1900-03-31', 1, 'months', '1900-02-28'],
        ['a day, in a year below 100', '0099-03-01', 1, 'days', '0099-02-28'],
        ['a month, in a year below 100', '0096-03-31', 1, 'months', '0096-02-29'],
        ['a negative duration, after the end', '2023-12-31', -1, 'days', '2024-01-01']
    ]) {
        it(`is the end less the duration for the first, in ${scenario}`, () => {
            assert.equal(
                delegatedTarget({monitoringEnd, monitoringDuration, monitoringDurationUnit}, 'first'),
                target
            )
        })
    }

    for (const [scenario, date] of [
        ['before year 0', {monitoringEnd: '2023-03-01', monitoringDuration: 30000, monitoringDurationUnit: 'months'}],
        ['before year 0, by a day', {monitoringEnd: '0000-01-01', monitoringDuration: 1, monitoringDurationUnit: 'days'}],
        ['after year 9999', {monitoringEnd: '9999-12-31', monitoringDuration: -1, monitoringDurationUnit: 'days'}]
    ]) {
        it(
            `is refused for the first when it falls ${scenario}, which YYYY-MM-DD cannot state`,
            () => {
                assert.deepEqual(
                    refusal(baytsAlerts({date}), 'first'),
                    [{code: 'MALFORMED_IMAGE_OUTPUT', path: ['model', 'date', 'monitoringDuration']}]
                )
            }
        )
    }

    it('keeps a monitoring end in year 0', () => {
        assert.equal(delegatedTarget({monitoringEnd: '0000-01-01'}, 'last'), '0000-01-01')
    })
})

const PERIOD = {monitoringEnd: '2023-03-01', monitoringDuration: 2, monitoringDurationUnit: 'months'}

// The target date of the recipe the product asks Radar Mosaic to describe.
const delegatedTarget = (date, position) => {
    const delegated = []
    recipeType('BAYTS_ALERTS').mapProducts.RADAR_OBSERVATION.describe({
        recipe: baytsAlerts({date}),
        parameters: {position},
        delegate: recipe => {
            delegated.push(recipe)
            return {bands: [], evidence: []}
        }
    })
    return delegated.map(({model: {dates: {targetDate}}}) => targetDate).join()
}

const baytsAlerts = ({reference = {type: 'ASSET', id: 'users/x/historical'}, date = PERIOD} = {}) => ({
    id: 'alerts-1',
    type: 'BAYTS_ALERTS',
    model: {
        reference,
        date,
        options: {orbits: ['ASCENDING', 'DESCENDING'], spatialSpeckleFilter: 'LEE', minObservations: 20},
        baytsAlertsOptions: {normalization: 'DISABLED'}
    }
})

const pointInTimeRadarMosaic = () => ({
    id: 'radar-1',
    type: 'RADAR_MOSAIC',
    model: {dates: {targetDate: '2023-01-01'}, options: {orbits: ['ASCENDING', 'DESCENDING']}}
})

const refusal = (recipe, position) =>
    resolve(recipe, {position}).diagnostics.map(({code, path}) => ({code, path}))

const resolve = (recipe, parameters) => {
    const observed = []
    const result = resolveImageOutput({
        graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: reference => {
            observed.push(reference)
            return undefined
        },
        product: parameters && {name: 'RADAR_OBSERVATION', parameters},
        productFor: (recipe, name) => recipeType(recipe.type)?.mapProducts?.[name]
    })
    return {...result, observed}
}
