import {isUndeclaredOutputOnly} from '#sepal/recipe/output/diagnostic'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The bands a Stack provides: each input band its mapping selects, under the name the mapping gives it, in model order,
// with the dimensionality, pyramiding policy and encoding its input's current description states. Real Optical Mosaic,
// Remapping, Masking and BAYTS Historical declarations; assets observed as stated here. Statuses, codes and persisted
// field names are literals.

describe('a Stack over described inputs', () => {
    it('averages a verified scalar its input states no policy for', () => {
        const {status, description} = read(stack([image('i-1', DEM)], [mapping('i-1', [['elevation', 'dem']])]))

        expect(status).toBe('READY')
        expect(description.executionReference).toEqual({type: 'RECIPE_REF', id: 'stack-1'})
        expect(description.output.bands).toEqual([{name: 'dem', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}])
    })

    it('keeps each renamed band\'s own policy and encoding, in model order', () => {
        const {description} = read(stack(
            [image('i-1', MOSAIC), image('i-2', REMAPPING), image('i-3', SEGMENTS)],
            [
                mapping('i-1', [['blue', 'b'], ['red', 'r']]),
                mapping('i-2', [['class', 'land']]),
                mapping('i-3', [['thermal', 'heat']])
            ]
        ), [MOSAIC, REMAPPING])

        expect(description.output.bands).toEqual([
            {name: 'b', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean', encoding: REFLECTANCE},
            {name: 'r', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean', encoding: REFLECTANCE},
            {name: 'land', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mode'},
            {name: 'heat', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean', encoding: THERMAL}
        ])
    })

    it('keeps an array its input samples beside scalars', () => {
        const {description} = read(stack(
            [image('i-1', SEGMENTS), image('i-2', DEM)],
            [mapping('i-1', [['coefs', 'coefs']]), mapping('i-2', [['elevation', 'dem']])]
        ))

        expect(description.output.bands).toEqual([
            {name: 'coefs', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'},
            {name: 'dem', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}
        ])
    })

    it('gives a band of unknown dimensionality no policy', () => {
        const {description} = read(stack([image('i-1', SEGMENTS)], [mapping('i-1', [['unknown', 'u']])]))

        expect(description.output.bands).toEqual([{name: 'u'}])
    })

    it('provides one input selected twice, its identically named bands under distinct names', () => {
        const {status, description} = read(stack(
            [image('i-1', DEM), image('i-2', DEM)],
            [mapping('i-1', [['elevation', 'elevation']]), mapping('i-2', [['elevation', 'elevation_1']])]
        ))

        expect(status).toBe('READY')
        expect(description.output.bands.map(({name}) => name)).toEqual(['elevation', 'elevation_1'])
    })

    // Masking preserves what Stack describes, so its fallback for undeclared sources never reaches a Stack's bands.
    it('is described the same through a Masking over it', () => {
        const over = stack([image('i-1', DEM)], [mapping('i-1', [['elevation', 'dem'], ['change', 'change']])])
        const masking = {id: 'masking-1', type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: over.id}, imageMask: DEM}}

        expect(read(masking, [over]).description.output.bands).toEqual([
            {name: 'dem', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'},
            {name: 'change', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}
        ])
    })

    it('needs an input it has not yet read', () => {
        const result = read(stack([image('i-1', MOSAIC)], [mapping('i-1', [['blue', 'b']])]))

        expect(result.status).toBe('NEEDS_EVIDENCE')
        expect(result.needs.records).toEqual(['mosaic-1'])
    })
})

describe('a Stack mapping a band its input does not hold', () => {
    it('is refused, located at that mapping', () => {
        const result = read(stack([image('i-1', MOSAIC)], [mapping('i-1', [['blue', 'b'], ['unixTimeDays', 'date']])]), [MOSAIC])

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics).toEqual([{
            code: 'MISSING_INPUT_BAND',
            path: ['model', 'bandNames', 'bandNames', 0, 'bands', 1, 'originalName'],
            recipePath: ['stack-1']
        }])
    })
})

describe('a Stack over an input that declares no output', () => {
    it('is answered by no description, only the undeclared input standing in the way', () => {
        const result = read(stack([image('i-1', HISTORICAL)], [mapping('i-1', [['VV_mean_asc', 'vv']])]), [HISTORICAL])

        expect(result.status).toBe('INVALID')
        expect(isUndeclaredOutputOnly(result.diagnostics)).toBe(true)
    })
})

// Known from the configuration alone, so refused before any input is read - an undeclared one included, which would
// otherwise let the legacy answer stand in for a Stack that cannot run.
describe('a Stack whose mapping is itself unusable', () => {
    it.each([
        ['names two output bands alike', () => stack(
            [image('i-1', HISTORICAL), image('i-2', DEM)],
            [mapping('i-1', [['VV_mean_asc', 'x']]), mapping('i-2', [['elevation', 'x']])]
        ), {code: 'DUPLICATE_BAND_NAME', path: ['model', 'bandNames', 'bandNames', 1, 'bands', 0, 'outputName']}],
        ['maps no bands for an input', () => stack(
            [image('i-1', HISTORICAL), image('i-2', DEM)],
            [mapping('i-1', [['VV_mean_asc', 'vv']])]
        ), {code: 'UNMAPPED_INPUT', path: ['model', 'inputImagery', 'images', 1]}],
        ['leaves an output name blank', () => stack(
            [image('i-1', HISTORICAL)],
            [mapping('i-1', [['VV_mean_asc', ' ']])]
        ), {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['model', 'bandNames', 'bandNames', 0, 'bands', 0]}]
    ])('is refused when it %s, beside an input that declares no output', (_case, stackOf, diagnostic) => {
        const result = read(stackOf(), [HISTORICAL])

        expect(result.status).toBe('INVALID')
        expect(result.diagnostics).toEqual([{...diagnostic, recipePath: ['stack-1']}])
        expect(isUndeclaredOutputOnly(result.diagnostics)).toBe(false)
    })
})

const REFLECTANCE = {scale: 0.0001, offset: 0, unit: '1'}
const THERMAL = {scale: 0.1, offset: 0, unit: 'K'}

const DEM = {type: 'ASSET', id: 'users/x/dem'}
const SEGMENTS = {type: 'ASSET', id: 'users/x/segments'}

// What reading each asset shows: its bands, their dimensionality where it was observed, and the encoding it states.
const ASSET_BANDS = {
    [DEM.id]: [
        {name: 'elevation', dataType: {arrayDimensions: 0}},
        {name: 'change', dataType: {arrayDimensions: 0}}
    ],
    [SEGMENTS.id]: [
        {name: 'coefs', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'},
        {name: 'thermal', dataType: {arrayDimensions: 0}, encoding: THERMAL},
        {name: 'unknown'}
    ]
}

const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    }
}

const REMAPPING = {id: 'remapping-1', type: 'REMAPPING', model: {legend: {entries: [{value: 1, label: 'forest', color: '#000000'}]}}}

const HISTORICAL = {id: 'historical-1', type: 'BAYTS_HISTORICAL', model: {options: {orbits: ['ASCENDING']}}}

const image = (imageId, source) => ({
    imageId,
    type: source.type === 'ASSET' ? 'ASSET' : 'RECIPE_REF',
    id: source.id
})

const mapping = (imageId, pairs) => ({
    imageId,
    bands: pairs.map(([originalName, outputName], index) => ({id: `${imageId}-${index}`, originalName, outputName}))
})

const stack = (images, bandNames) => ({
    id: 'stack-1',
    type: 'STACK',
    model: {inputImagery: {images}, bandNames: {bandNames}}
})

const read = (recipe, records = []) => readImageOutput({
    graph: buildRecipeDependencyGraph({
        rootRecipe: recipe,
        recipesById: new Map([recipe, ...records].map(record => [record.id, record]))
    }),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    observationFor: ({type, id}) => type === 'ASSET' && ASSET_BANDS[id]
        ? {bands: ASSET_BANDS[id], evidence: []}
        : undefined
})
