import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// Resolved through the registered declaration and the real resolver, over persisted model shapes.

const REFLECTANCE = {scale: 0.0001, offset: 0, unit: '1'}
const THERMAL = {scale: 0.1, offset: 0, unit: 'K'}

describe('the bands an optical mosaic can be asked for', () => {
    it('is resolved without observing anything', () => {
        const recipe = mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}})

        const {description, diagnostics, observed} = resolve(recipe)

        assert.deepEqual(diagnostics, [])
        assert.deepEqual(observed, [])
        assert.deepEqual(description.executionReference, {type: 'RECIPE_REF', id: recipe.id})
    })

    it('offers only the indexes the contributing data sets can supply', () => {
        const landsat = bandNames(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}}))
        const withSentinel2 = bandNames(mosaic({dataSets: {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}}))

        assert.ok(landsat.includes('thermal'))
        assert.ok(landsat.includes('ebbi'))
        assert.ok(!withSentinel2.includes('thermal'))
        assert.ok(!withSentinel2.includes('ebbi'))
        assert.ok(withSentinel2.includes('nbr'))
    })

    it('follows the data sets of the selected scenes rather than the configured ones', () => {
        const recipe = mosaic({
            dataSets: {LANDSAT: ['LANDSAT_7', 'LANDSAT_8']},
            sceneSelectionOptions: {type: 'SELECT'},
            scenes: {'scene-area-1': [{id: 'LC08_1', dataSet: 'LANDSAT_8'}]}
        })

        assert.ok(bandNames(recipe).includes('aerosol'))
        assert.ok(
            !bandNames({...recipe, model: {...recipe.model, sceneSelectionOptions: {type: 'ALL'}}}).includes('aerosol')
        )
    })

    for (const compose of ['MEDIAN', 'MEDOID']) {
        it(
            `offers nothing when no scene is selected for a ${compose} composite`,
            () => {
                const recipe = mosaic({
                    dataSets: {LANDSAT: ['LANDSAT_8']},
                    compose,
                    sceneSelectionOptions: {type: 'SELECT'},
                    scenes: {}
                })

                assert.deepEqual(bandNames(recipe), [])
            }
        )
    }

    it('expands a stored data-set alias as execution does', () => {
        const recipe = mosaic({dataSets: {LANDSAT: ['LANDSAT_TM']}})

        assert.ok(bandNames(recipe).includes('thermal'))
        assert.ok(!bandNames(recipe).includes('aerosol'))
    })

    it('reads a legacy sources shape as execution migrates it', () => {
        const recipe = {...mosaic({}), model: {...mosaic({}).model, sources: {LANDSAT: ['LANDSAT_8']}}}

        assert.ok(bandNames(recipe).includes('thermal'))
    })

    it('offers the date bands only for a MEDOID composite, and never the native quality band', () => {
        const median = bandNames(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}, compose: 'MEDIAN'}))
        const medoid = bandNames(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}, compose: 'MEDOID'}))

        assert.ok(!median.includes('dayOfYear'))
        assert.ok(
            new Set(['unixTimeDays', 'dayOfYear', 'daysFromTarget']).isSubsetOf(new Set(medoid))
        )
        assert.ok(![...median, ...medoid].includes('qa'))
        assert.ok(![...median, ...medoid].includes('targetDayCloseness'))
    })
})

describe('the stored values of each band', () => {
    const bands = recipe => Object.fromEntries(
        resolve(recipe).description.output.bands.map(({name, ...band}) => [name, band])
    )

    it('states reflectance and thermal encodings in their own units', () => {
        const described = bands(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}}))

        assert.deepEqual(described.red, {dataType: {arrayDimensions: 0}, encoding: REFLECTANCE})
        assert.deepEqual(described.thermal.encoding, THERMAL)
    })

    it('states the encoding of calculated indexes and tasseled cap components', () => {
        const described = bands(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}}))

        assert.deepEqual(described.ndvi.encoding, REFLECTANCE)
        assert.deepEqual(described.nbr.encoding, REFLECTANCE)
        assert.deepEqual(described.brightness.encoding, REFLECTANCE)
    })

    it('leaves the date bands unknown rather than unscaled', () => {
        const described = bands(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}, compose: 'MEDOID'}))

        assert.deepEqual(described.dayOfYear, {dataType: {arrayDimensions: 0}})
    })
})

const mosaic = ({dataSets = {LANDSAT: ['LANDSAT_8']}, compose = 'MEDIAN', corrections = ['SR'], ...model}) => ({
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        sources: {dataSets, cloudPercentageThreshold: 100},
        compositeOptions: {corrections, compose},
        ...model
    }
})

const resolve = recipe => {
    const observed = []
    const result = resolveImageOutput({
        graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: reference => {
            observed.push(reference)
            return undefined
        }
    })
    return {...result, observed}
}

const bandNames = recipe => resolve(recipe).description.output.bands.map(({name}) => name)
