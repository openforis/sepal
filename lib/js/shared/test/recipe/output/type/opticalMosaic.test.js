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

        expect(diagnostics).toEqual([])
        expect(observed).toEqual([])
        expect(description.executionReference).toEqual({type: 'RECIPE_REF', id: recipe.id})
    })

    it('offers only the indexes the contributing data sets can supply', () => {
        const landsat = bandNames(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}}))
        const withSentinel2 = bandNames(mosaic({dataSets: {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}}))

        expect(landsat).toContain('thermal')
        expect(landsat).toContain('ebbi')
        expect(withSentinel2).not.toContain('thermal')
        expect(withSentinel2).not.toContain('ebbi')
        expect(withSentinel2).toContain('nbr')
    })

    it('follows the data sets of the selected scenes rather than the configured ones', () => {
        const recipe = mosaic({
            dataSets: {LANDSAT: ['LANDSAT_7', 'LANDSAT_8']},
            sceneSelectionOptions: {type: 'SELECT'},
            scenes: {'scene-area-1': [{id: 'LC08_1', dataSet: 'LANDSAT_8'}]}
        })

        expect(bandNames(recipe)).toContain('aerosol')
        expect(bandNames({...recipe, model: {...recipe.model, sceneSelectionOptions: {type: 'ALL'}}}))
            .not.toContain('aerosol')
    })

    it.each(['MEDIAN', 'MEDOID'])('offers nothing when no scene is selected for a %s composite', compose => {
        const recipe = mosaic({
            dataSets: {LANDSAT: ['LANDSAT_8']},
            compose,
            sceneSelectionOptions: {type: 'SELECT'},
            scenes: {}
        })

        expect(bandNames(recipe)).toEqual([])
    })

    it('expands a stored data-set alias as execution does', () => {
        const recipe = mosaic({dataSets: {LANDSAT: ['LANDSAT_TM']}})

        expect(bandNames(recipe)).toContain('thermal')
        expect(bandNames(recipe)).not.toContain('aerosol')
    })

    it('reads a legacy sources shape as execution migrates it', () => {
        const recipe = {...mosaic({}), model: {...mosaic({}).model, sources: {LANDSAT: ['LANDSAT_8']}}}

        expect(bandNames(recipe)).toContain('thermal')
    })

    it('offers the date bands only for a MEDOID composite, and never the native quality band', () => {
        const median = bandNames(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}, compose: 'MEDIAN'}))
        const medoid = bandNames(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}, compose: 'MEDOID'}))

        expect(median).not.toContain('dayOfYear')
        expect(medoid).toEqual(expect.arrayContaining(['unixTimeDays', 'dayOfYear', 'daysFromTarget']))
        expect([...median, ...medoid]).not.toContain('qa')
        expect([...median, ...medoid]).not.toContain('targetDayCloseness')
    })
})

describe('the stored values of each band', () => {
    const bands = recipe => Object.fromEntries(
        resolve(recipe).description.output.bands.map(({name, ...band}) => [name, band])
    )

    it('states reflectance and thermal encodings in their own units', () => {
        const described = bands(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}}))

        expect(described.red).toEqual({dataType: {arrayDimensions: 0}, encoding: REFLECTANCE})
        expect(described.thermal.encoding).toEqual(THERMAL)
    })

    it('states the encoding of calculated indexes and tasseled cap components', () => {
        const described = bands(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}}))

        expect(described.ndvi.encoding).toEqual(REFLECTANCE)
        expect(described.nbr.encoding).toEqual(REFLECTANCE)
        expect(described.brightness.encoding).toEqual(REFLECTANCE)
    })

    it('leaves the date bands unknown rather than unscaled', () => {
        const described = bands(mosaic({dataSets: {LANDSAT: ['LANDSAT_8']}, compose: 'MEDOID'}))

        expect(described.dayOfYear).toEqual({dataType: {arrayDimensions: 0}})
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
