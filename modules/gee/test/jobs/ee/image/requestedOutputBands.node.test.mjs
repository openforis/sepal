import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// What an image export gets back when it names the bands it wants, through the REAL imageFactory, recipeRef,
// masking, asset and ccdc implementations. Recipe reads, collection construction and Earth Engine are
// substituted: an image here is its band names and the masks applied to it, and Earth Engine's CCDC answers
// with the band names it constructs, so selection can be observed without computing anything.
//
// Run by Node's own test runner rather than Jest, because imageFactory loads every implementation through
// createRequire. Launched from a Jest bridge so it still runs in the ordinary gee gate.

let catalogue = {}
let assets = {}
let collectionRequests = []

const SEGMENT_BANDS = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']

const eeImage = ({source, bands, masks = []}) => ({
    source,
    bands,
    masks,
    select: selection => {
        const names = typeof selection === 'number' ? [bands[selection]] : selection
        const missing = names.filter(name => !bands.includes(name))
        if (missing.length) {
            throw new Error(`Image has no band ${missing.join(', ')}`)
        }
        return eeImage({source, bands: names, masks})
    },
    clip: () => eeImage({source, bands, masks}),
    updateMask: mask => eeImage({source, bands, masks: [...masks, mask.source]})
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: id => assets[id] ? of({type: 'Image'}) : throwError(() => new Error(`No asset ${id}`)),
            Image: value => typeof value === 'string' ? eeImage({source: value, bands: assets[value]}) : value,
            Algorithms: {
                TemporalSegmentation: {
                    Ccdc: ({collection}) => eeImage({
                        source: 'segments',
                        bands: [
                            ...SEGMENT_BANDS,
                            ...collection.bands.flatMap(band => [`${band}_coefs`, `${band}_rmse`, `${band}_magnitude`])
                        ]
                    })
                }
            }
        }
    }
})

mock.module('#sepal/ee/aoi', {exports: {toGeometry$: () => of({})}})

mock.module('#sepal/ee/timeSeries/collection', {
    exports: {
        getCollection$: ({recipe, bands}) => {
            collectionRequests.push({type: recipe.type, bands})
            return of({bands})
        }
    }
})

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: imageFactory} = await import('#sepal/ee/imageFactory')
const {default: ccdc} = await import('#sepal/ee/timeSeries/ccdc')
const {withOutputBands} = await import('#sepal/ee/outputBands')

const inOperation = (name, fn) => it(name, async () => {
    const scope = new RecipeScope(id => catalogue[id] ? of(catalogue[id]) : throwError(() => new Error(`No recipe ${id}`)))
    try {
        await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
})

const MASK = {type: 'ASSET', id: 'users/x/mask'}

const masking = primary => ({id: 'masking-1', type: 'MASKING', model: {imageToMask: primary, imageMask: MASK}})

const ccdcRecipe = {
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        aoi: {type: 'ASSET', id: 'users/x/bounds'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['red']},
        ccdcOptions: {dateFormat: 1}
    }
}

const image = (recipe, args) => firstValueFrom(imageFactory(recipe, args).getImage$())

const fittedMeasures = () => collectionRequests.map(({bands}) => bands)

beforeEach(() => {
    catalogue = {[ccdcRecipe.id]: ccdcRecipe}
    assets = {'users/x/image': ['red', 'nir', 'ndvi'], [MASK.id]: ['mask']}
    collectionRequests = []
})

describe('an export naming bands of a masked asset', () => {
    inOperation('returns exactly those bands, in the order named, with the mask applied', async () => {
        const exported = await image(masking({type: 'ASSET', id: 'users/x/image'}), withOutputBands({selection: ['ndvi', 'red']}))

        assert.deepEqual(exported.bands, ['ndvi', 'red'])
        assert.deepEqual(exported.masks, [MASK.id])
    })

    inOperation('still returns every stored band to a caller that names no output bands', async () => {
        const read = await image(masking({type: 'ASSET', id: 'users/x/image'}), {selection: ['red']})

        assert.deepEqual(read.bands, ['red', 'nir', 'ndvi'])
    })
})

describe('an export naming bands of a masked CCDC', () => {
    inOperation('fits the measures those bands come from and returns exactly those bands, masked', async () => {
        const exported = await image(
            masking({type: 'RECIPE_REF', id: 'ccdc-1'}),
            withOutputBands({selection: ['ndvi_coefs', 'tStart', 'ndvi_rmse']})
        )

        assert.deepEqual(fittedMeasures(), [['ndvi', 'red']])
        assert.deepEqual(exported.bands, ['ndvi_coefs', 'tStart', 'ndvi_rmse'])
        assert.deepEqual(exported.masks, [MASK.id])
    })

    inOperation('refuses a band CCDC does not construct', async () => {
        await assert.rejects(
            image(masking({type: 'RECIPE_REF', id: 'ccdc-1'}), withOutputBands({selection: ['ndvi']})),
            /Not a CCDC output band: ndvi/
        )
    })
})

// What CCDC says it can be asked for, which is not what it builds when asked for nothing: it fits only the
// measures it is given, so its unrequested image holds the breakpoint measures alone.
describe('the bands CCDC declares', () => {
    inOperation('names every measure its collection supplies, not only the ones it breaks on', async () => {
        const declared = await firstValueFrom(imageFactory(ccdcRecipe).getBands$())

        assert.deepEqual(declared.slice(0, SEGMENT_BANDS.length), SEGMENT_BANDS)
        assert.ok(declared.includes('red_coefs'), 'the breakpoint measure')
        assert.ok(declared.includes('nir_coefs'), 'a measure it does not break on')
        assert.ok(declared.includes('ndvi_magnitude'), 'an index the collection computes')
    })

    inOperation('answers without building a collection or an image', async () => {
        await firstValueFrom(imageFactory(ccdcRecipe).getBands$())

        assert.deepEqual(collectionRequests, [])
    })
})

// Slice, Change Alerts, the segment chart and the dedicated CCDC export name the measures to fit.
describe('an internal caller naming CCDC measures', () => {
    const everySegmentBand = measures => [
        ...SEGMENT_BANDS,
        ...measures.flatMap(band => [`${band}_coefs`, `${band}_rmse`, `${band}_magnitude`])
    ]

    inOperation('fits those measures through a Masking and receives every band they construct', async () => {
        const segments = await image(masking({type: 'RECIPE_REF', id: 'ccdc-1'}), {selection: ['ndvi']})

        assert.deepEqual(fittedMeasures(), [['ndvi', 'red']])
        assert.deepEqual(segments.bands, everySegmentBand(['ndvi', 'red']))
        assert.deepEqual(segments.masks, [MASK.id])
    })

    inOperation('fits those measures on the CCDC recipe itself', async () => {
        const segments = await firstValueFrom(ccdc(ccdcRecipe, {selection: ['ndvi']}).getImage$())

        assert.deepEqual(fittedMeasures(), [['ndvi', 'red']])
        assert.deepEqual(segments.bands, everySegmentBand(['ndvi', 'red']))
    })
})
