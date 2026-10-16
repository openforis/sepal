import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// Which bands Band Math and Stack get back from a CCDC input, through the REAL imageFactory, recipeRef, ccdc, Band
// Math and Stack implementations. Recipe reads, collection construction and Earth Engine are substituted: an image
// here is its band names, a collection supplies only the measures it holds, and Earth Engine's CCDC answers with the
// bands it constructs from them. Geometry is not modelled - every image answers as unbounded, so nothing is clipped -
// and casting keeps the bands it is given. Which dimensions those bands have is the live verifiers'
// (verify/bandMathOutputBands.mjs, verify/stackOutputBands.mjs).

const COLLECTION_MEASURES = ['red', 'nir', 'swir1', 'ndvi']
const SEGMENT_BANDS = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']

let catalogue = {}
let collectionRequests = []

const eeImage = bands => ({
    bands,
    select: (selection, newNames) => {
        if (selection === '.*') {
            return eeImage(bands)
        }
        const names = [selection].flat()
        const missing = names.filter(name => !bands.includes(name))
        if (missing.length) {
            throw new Error(`Image has no band ${missing.join(', ')}`)
        }
        return eeImage(newNames ? [newNames].flat() : names)
    },
    rename: names => eeImage([names].flat()),
    expression: () => eeImage(['expression']),
    cast: () => eeImage(bands),
    clip: () => eeImage(bands),
    geometry: () => ({})
})

const unbounded = {map: () => unbounded, size: () => 0, iterate: () => ({}), get: () => ({})}

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            Image: value => Array.isArray(value)
                ? eeImage(value.flatMap(image => image.bands))
                : value || eeImage([]),
            Dictionary: {fromLists: () => ({})},
            List: () => unbounded,
            Algorithms: {
                If: (_condition, _whenTrue, whenFalse) => whenFalse,
                TemporalSegmentation: {
                    Ccdc: ({collection}) => eeImage([
                        ...SEGMENT_BANDS,
                        ...collection.bands.flatMap(band => [`${band}_coefs`, `${band}_rmse`, `${band}_magnitude`])
                    ])
                }
            }
        }
    }
})

mock.module('#sepal/ee/aoi', {exports: {toGeometry$: () => of({})}})

mock.module('#sepal/ee/timeSeries/collection', {
    exports: {
        getCollection$: ({bands}) => {
            collectionRequests.push(bands)
            const missing = bands.filter(band => !COLLECTION_MEASURES.includes(band))
            return missing.length
                ? throwError(() => new Error(`Collection has no band ${missing.join(', ')}`))
                : of({bands})
        }
    }
})

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: imageFactory} = await import('#sepal/ee/imageFactory')

const inOperation = (name, fn) => it(name, async () => {
    const scope = new RecipeScope(id => catalogue[id] ? of(catalogue[id]) : throwError(() => new Error(`No recipe ${id}`)))
    try {
        await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
})

const CCDC = {
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        aoi: {type: 'ASSET', id: 'users/x/bounds'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['nir']},
        ccdcOptions: {dateFormat: 1}
    }
}

const built = recipe => firstValueFrom(imageFactory(recipe).getImage$())

const fittedMeasures = () => collectionRequests

beforeEach(() => {
    catalogue = {[CCDC.id]: CCDC}
    collectionRequests = []
})

describe('a Band Math recipe over a CCDC', () => {
    inOperation('builds from the coefficients and segment starts it includes, fitting the measure they come from', async () => {
        const bandMath = {
            id: 'band-math-1',
            type: 'BAND_MATH',
            model: {
                inputImagery: {images: [{
                    imageId: 'i-1', name: 'i1', type: 'RECIPE_REF', id: CCDC.id,
                    includedBands: [{id: 'b1', name: 'ndvi_coefs'}, {id: 'b2', name: 'tStart'}]
                }]},
                calculations: {calculations: [{
                    imageId: 'c-1', name: 'c1', type: 'EXPRESSION', expression: 'i1.ndvi_coefs * 2', dataType: 'float',
                    includedBands: [{id: 'b1', name: 'ndvi_coefs'}]
                }]},
                outputBands: {outputImages: [
                    {imageId: 'c-1', outputBands: [{id: 'b1', name: 'ndvi_coefs', defaultOutputName: 'coefs2'}]},
                    {imageId: 'i-1', outputBands: [{id: 'b2', name: 'tStart', defaultOutputName: 'tStart'}]}
                ]}
            }
        }

        assert.deepEqual((await built(bandMath)).bands, ['coefs2', 'tStart'])
        assert.deepEqual(fittedMeasures(), [['ndvi', 'nir']])
    })
})

describe('a Stack over a CCDC', () => {
    inOperation('renames the coefficients and segment starts it maps, fitting the measure they come from', async () => {
        const stack = {
            id: 'stack-1',
            type: 'STACK',
            model: {
                inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: CCDC.id}]},
                bandNames: {bandNames: [{imageId: 'i-1', bands: [
                    {id: 'b1', originalName: 'ndvi_coefs', outputName: 'coefs'},
                    {id: 'b2', originalName: 'tStart', outputName: 'start'}
                ]}]}
            }
        }

        assert.deepEqual((await built(stack)).bands, ['coefs', 'start'])
        assert.deepEqual(fittedMeasures(), [['ndvi', 'nir']])
    })
})
