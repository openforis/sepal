import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {annualMosaicRecipe} from '#sepal/recipe/type/landTrendr'

// LandTrendr's annual mosaic, resolved through the registered declarations and the real resolver.

describe('the annual mosaic a LandTrendr layer shows', () => {
    it('is described as the optical mosaic of the same data sets and options, without observing anything', () => {
        const recipe = landTrendr()

        const {description, diagnostics, observed} = resolve(recipe, {year: 2018})

        expect(diagnostics).toEqual([])
        expect(observed).toEqual([])
        expect(description.output.bands).toEqual(resolve(opticalMosaicOf(recipe)).description.output.bands)
        expect(bandNames(description)).not.toContain('yod')
    })

    it('is described under the LandTrendr recipe, identified by its product and year', () => {
        const recipe = landTrendr()

        const {description} = resolve(recipe, {year: 2018})

        expect(description.executionReference).toEqual({type: 'RECIPE_REF', id: recipe.id})
        expect(description.output.product).toEqual({name: 'ANNUAL_MOSAIC', parameters: {year: 2018}})
    })

    // The recipe's options may ask for a medoid; the annual mosaic is a median, so the date bands only a medoid keeps
    // are not offered.
    it('is a median composite whatever the options ask for', () => {
        const {description} = resolve(landTrendr({options: {corrections: ['SR'], compose: 'MEDOID'}}), {year: 2018})

        expect(bandNames(description)).not.toContain('unixTimeDays')
    })

    it.each([
        ['omitted', {}],
        ['undefined', {year: undefined}],
        ['null', {year: null}]
    ])('shows the last fitted year when its year is %s', (_case, parameters) => {
        const {description} = resolve(landTrendr({dates: {startYear: 2014, endYear: 2021}}), parameters)

        expect(description.output.product.parameters).toEqual({year: 2021})
    })

    // The picker offers the fitted range; execution takes any year.
    it.each([1990, 2030])('shows year %s, outside the fitted range', year => {
        const {description} = resolve(landTrendr({dates: {startYear: 2014, endYear: 2021}}), {year})

        expect(description.output.product.parameters).toEqual({year})
    })

    it.each([
        ['a numeric string', '2020'],
        ['a fraction', 2020.5],
        ['infinity', Infinity],
        ['not a number', NaN],
        ['a boolean', true]
    ])('is refused for a year that is %s', (_case, year) => {
        expect(resolve(landTrendr(), {year})).toMatchObject({
            description: null,
            diagnostics: [{code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'year'], recipePath: ['landtrendr-1'], product: 'ANNUAL_MOSAIC'}]
        })
    })

    it('is refused for a parameter it does not take', () => {
        expect(resolve(landTrendr(), {year: 2020, month: 6}).diagnostics)
            .toEqual([expect.objectContaining({code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'month']})])
    })

    it('is refused when it would show a last fitted year that is not an integer', () => {
        expect(resolve(landTrendr({dates: {startYear: 2014, endYear: '2021'}}), {}).diagnostics)
            .toEqual([expect.objectContaining({code: 'INVALID_PRODUCT_PARAMETERS', path: ['parameters', 'year']})])
    })

    it('leaves the change output as it is declared', () => {
        expect(bandNames(resolve(landTrendr()).description)).toEqual(['yod', 'mag', 'dur', 'preval', 'postval', 'rmse', 'sig'])
    })
})

// Built once, for description and execution alike.
describe('the mosaic built for a year', () => {
    it('covers that calendar year alone, centred mid-year', () => {
        expect(annualMosaicRecipe(landTrendr(), 2018).model.dates).toEqual({
            targetDate: '2018-07-01',
            seasonStart: '2018-01-01',
            seasonEnd: '2019-01-01',
            yearsBefore: 0,
            yearsAfter: 0
        })
    })

    it('composites every scene of the series\' AOI and sources, with its options, as a median', () => {
        const recipe = landTrendr({options: {corrections: ['SR'], compose: 'MEDOID', cloudBuffer: 0}})

        expect(annualMosaicRecipe(recipe, 2018)).toMatchObject({
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

const landTrendr = ({dates = {startYear: 2014, endYear: 2021}, options = {corrections: ['SR'], compose: 'MEDIAN'}} = {}) => ({
    id: 'landtrendr-1',
    type: 'LANDTRENDR',
    model: {
        aoi: {type: 'POLYGON', path: [[-60.1, -3.1], [-60, -3.1], [-60, -3], [-60.1, -3.1]]},
        dates,
        sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']}, index: 'nbr'},
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
