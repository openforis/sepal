import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The band a Time Series provides, from its persisted model alone, through the real Time Series, Masking and Stack
// declarations and the common read. Band names and policies are literals.

const COUNT = {name: 'count', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}

describe('a Time Series', () => {
    it.each([
        ['optical sources', {dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}}],
        ['radar sources', {dataSets: {SENTINEL_1: ['SENTINEL_1']}}],
        ['Planet sources', {dataSets: {PLANET: ['BASEMAPS']}}],
        ['a classification beside its imagery', {dataSets: {LANDSAT: ['LANDSAT_8']}, classification: 'classification-1'}]
    ])('over %s provides its count alone, averaged', (_case, sources) => {
        const {status, description} = read(timeSeries({sources}))

        expect(status).toBe('READY')
        expect(description.output.bands).toEqual([COUNT])
    })

    it('is described while the recipe its AOI comes from is not even loaded', () => {
        const result = read(timeSeries({aoi: {type: 'RECIPE', id: 'aoi-1'}}))

        expect(result.status).toBe('READY')
        expect(result.needs).toEqual({records: [], observations: []})
    })

    it('is described before anything is configured', () => {
        const result = read({id: 'time-series-1', type: 'TIME_SERIES', model: {}})

        expect(result.status).toBe('READY')
        expect(result.description.output.bands).toEqual([COUNT])
    })
})

describe('a recipe over a Time Series', () => {
    const counted = timeSeries()

    it('keeps its count and policy through a Masking', () => {
        const masking = {id: 'masking-1', type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: counted.id}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}}

        expect(read(masking, [counted]).description.output.bands).toEqual([COUNT])
    })

    it('keeps its policy under the name a Stack gives', () => {
        const stack = {
            id: 'stack-1',
            type: 'STACK',
            model: {
                inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: counted.id}]},
                bandNames: {bandNames: [{imageId: 'i-1', bands: [{id: 'b1', originalName: 'count', outputName: 'observations'}]}]}
            }
        }

        expect(read(stack, [counted]).description.output.bands).toEqual([{...COUNT, name: 'observations'}])
    })
})

function timeSeries({aoi = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}, sources = {dataSets: {LANDSAT: ['LANDSAT_8']}}} = {}) {
    return {
        id: 'time-series-1',
        type: 'TIME_SERIES',
        model: {aoi, dates: {startDate: '2023-01-01', endDate: '2024-01-01'}, sources, options: {corrections: []}}
    }
}

const read = (recipe, records = []) => readImageOutput({
    graph: buildRecipeDependencyGraph({
        rootRecipe: recipe,
        recipesById: new Map([recipe, ...records].map(record => [record.id, record]))
    }),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    observationFor: () => undefined
})
