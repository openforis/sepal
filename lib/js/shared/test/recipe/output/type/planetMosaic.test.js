import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The bands a Planet Mosaic provides, from its persisted model alone, through the real Planet Mosaic, Masking and
// Stack declarations and the common read. Band names, policies and encodings are literals.

const PER_TEN_THOUSAND = {scale: 0.0001, offset: 0, unit: '1'}
const SPECTRAL = ['blue', 'green', 'red', 'nir']
const INDEXES = ['ndvi', 'ndwi', 'evi', 'evi2', 'savi', 'kndvi']

describe('a Planet Mosaic', () => {
    it.each([
        ['NICFI, as a new recipe states it', {source: 'NICFI'}, 'DISABLED'],
        ['basemaps', {source: 'BASEMAPS', assets: ['users/x/basemaps']}, undefined],
        ['basemaps stating histogram matching, which only Daily applies', {source: 'BASEMAPS', assets: ['users/x/basemaps']}, 'ENABLED'],
        ['Daily without histogram matching', {source: 'DAILY', assets: ['users/x/daily']}, 'DISABLED'],
        ['no sources, read as the fixed NICFI basemaps', undefined, undefined]
    ])('over %s provides its spectral bands of unknown scaling, then its indexes stored per ten thousand, all averaged', (_case, sources, histogramMatching) => {
        const {status, description} = read(planet({sources, histogramMatching}))

        expect(status).toBe('READY')
        expect(description.output.bands).toEqual([
            ...SPECTRAL.map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'})),
            ...INDEXES.map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean', encoding: PER_TEN_THOUSAND}))
        ])
    })

    it('over Daily with histogram matching stores its spectral bands per ten thousand, as the reference it matches', () => {
        const {description} = read(planet({sources: {source: 'DAILY', assets: ['users/x/daily']}, histogramMatching: 'ENABLED'}))

        expect(description.output.bands.map(({name, encoding}) => [name, encoding]))
            .toEqual([...SPECTRAL, ...INDEXES].map(name => [name, PER_TEN_THOUSAND]))
    })

    it('is described while the recipe its AOI comes from is not even loaded', () => {
        const result = read(planet({aoi: {type: 'RECIPE', id: 'aoi-1'}}))

        expect(result.status).toBe('READY')
        expect(result.needs).toEqual({records: [], observations: []})
    })
})

describe('a recipe over a Planet Mosaic', () => {
    const matched = planet({sources: {source: 'DAILY', assets: ['users/x/daily']}, histogramMatching: 'ENABLED'})

    it('keeps its policies and encodings through a Masking', () => {
        const masking = {id: 'masking-1', type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: matched.id}, imageMask: {type: 'ASSET', id: 'users/x/mask'}}}

        expect(read(masking, [matched]).description.output.bands).toEqual(read(matched).description.output.bands)
    })

    it('keeps them under the names a Stack gives', () => {
        const stack = {
            id: 'stack-1',
            type: 'STACK',
            model: {
                inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: matched.id}]},
                bandNames: {bandNames: [{imageId: 'i-1', bands: [
                    {id: 'b1', originalName: 'kndvi', outputName: 'k'},
                    {id: 'b2', originalName: 'red', outputName: 'r'}
                ]}]}
            }
        }

        expect(read(stack, [matched]).description.output.bands).toEqual([
            {name: 'k', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean', encoding: PER_TEN_THOUSAND},
            {name: 'r', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean', encoding: PER_TEN_THOUSAND}
        ])
    })
})

function planet({sources, histogramMatching, aoi = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}} = {}) {
    return {
        id: 'planet-1',
        type: 'PLANET_MOSAIC',
        model: {
            aoi,
            dates: {fromDate: '2024-01-01', toDate: '2024-04-01'},
            ...(sources && {sources}),
            options: {cloudThreshold: 0.15, shadowThreshold: 0.4, cloudBuffer: 0, ...(histogramMatching && {histogramMatching})}
        }
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
