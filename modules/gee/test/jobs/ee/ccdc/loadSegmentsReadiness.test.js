import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// What a segment chart's request (/ccdc/loadSegments) is held to before anything is segmented or read at its pixel. A
// CCDC charted itself is held to its PIXEL_SEGMENTS readiness, judged and segmented at the clicked point; a recipe
// selected as a source is held to its own image's readiness, over its own AOI; an asset is read as it is. The real job,
// imageFactory, recipeRef, Masking, CCDC, segment source and readiness run; recipe reads, the collection and Earth
// Engine are substituted.

const state = {}

const eeImage = (source, masks = []) => ({
    source,
    masks,
    geometry: () => ({source}),
    select: () => eeImage(source, masks),
    clip: () => eeImage(source, masks),
    reduceRegion: () => ({source, masks}),
    bandNames: () => state.assetBands[source] ?? [`${source}:band`],
    bandTypes: () => ({get: () => 'float'}),
    toDictionary: () => ({}),
    updateMask: mask => eeImage(source, [...masks, mask.source])
})

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            getAsset$: () => of({type: 'Image', properties: {}}),
            getInfo$: value => {
                state.evaluated.push(value)
                return of(value)
            },
            Image: image => (image && typeof image === 'object' ? image : eeImage(image)),
            // What describing an image's bands evaluates (bandEvidence.js).
            Dictionary: values => {
                state.described.push(values)
                return values
            },
            PixelType: () => ({dimensions: () => 0}),
            ImageCollection: id => eeImage(id),
            Geometry: Object.assign(geoJson => geoJson, {Point: coordinates => ({point: coordinates})}),
            Reducer: {first: () => 'first'},
            Algorithms: {TemporalSegmentation: {Ccdc: () => eeImage('segments')}}
        }
    }
})
mock.module('#sepal/ee/timeSeries/collection', {
    exports: {
        getCollection$: ({recipe}) => {
            state.collections.push(recipe.model.aoi)
            return of(eeImage('collection'))
        }
    }
})
mock.module('#gee/jobs/job', {exports: {job: ({worker$}) => worker$}})

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: loadSegments$} = await import('#gee/jobs/ee/ccdc/loadSegments')

// Each case is its own execution operation, reading each recipe once.
const inOperation = (name, fn) => it(name, async () => {
    const scope = new RecipeScope(id => {
        state.recipesRead.push(id)
        return state.catalogue[id] ? of(state.catalogue[id]) : throwError(() => new Error(`No such recipe: ${id}`))
    })
    try {
        await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
})

beforeEach(() => {
    Object.assign(state, {catalogue: {}, assetBands: {}, recipesRead: [], described: [], evaluated: [], collections: []})
})

describe('the segments of a CCDC charted itself', () => {
    inOperation('are refused, segmenting and reading nothing at the pixel, where its classification\'s classifier the scenes cannot feed', async () => {
        state.catalogue[CLASSIFICATION] = classification(RADAR_FEATURES)

        await assert.rejects(chart(ccdcOf()), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assertNothingCharted()
    })

    inOperation('are read at the pixel once the classification is one the scenes can feed, segmented there', async () => {
        state.catalogue[CLASSIFICATION] = classification(COMPATIBLE)

        const segments = await chart(ccdcOf())

        assert.deepEqual(segments, SEGMENTS)
        assert.deepEqual(state.collections, [PIXEL_AOI])
    })

    for (const [_case, aoi] of [
        ['a recipe that cannot be read', {type: 'RECIPE', id: 'gone'}],
        ['the CCDC itself', {type: 'RECIPE', id: 'ccdc-1'}]
    ]) {
        inOperation(`are read over an AOI of ${_case}, which segmenting at the pixel does not read, leaving the request as it was`, async () => {
            state.catalogue[CLASSIFICATION] = classification(COMPATIBLE)
            const submitted = deepFrozen(ccdcOf({aoi}))

            const segments = await chart(submitted)

            assert.deepEqual(segments, SEGMENTS)
            assert.deepEqual(submitted.model.aoi, aoi)
            assert.deepEqual(state.recipesRead, [CLASSIFICATION])
        })
    }

    inOperation('fail with the read error, not as a finding, where the classification cannot be read', async () => {
        await assert.rejects(chart(ccdcOf()), error => error.message === `No such recipe: ${CLASSIFICATION}`)

        assertNothingCharted()
    })
})

// Every segmentation fits its breakpoint bands, so one the Classification computes trains its classifier on that
// Classification's training data and applies it to every image of the collection: what training needs refuses the
// segments. Breakpoint bands of the images need none of it.
describe('the segments of a CCDC fitting a breakpoint band its Classification computes', () => {
    const POINTS = [{x: 1, y: 1, class: 1}, {x: 1, y: 2, class: 1}, {x: 2, y: 1, class: 2}, {x: 2, y: 2, class: 2}]
    const trainedClassification = ({points = []} = {}) => {
        const {model, ...record} = classification(['red', 'nir'])
        return {
            ...record,
            model: {
                ...model,
                legend: {entries: [{value: 1}, {value: 2}]},
                trainingData: {dataSets: points.length ? [{type: 'COLLECTED', referenceData: points}] : []},
                classifier: {type: 'RANDOM_FOREST'}
            }
        }
    }

    inOperation('are refused, segmenting and reading nothing at the pixel, where the Classification stores no point', async () => {
        state.catalogue[CLASSIFICATION] = trainedClassification()

        await assert.rejects(chart(ccdcOf({breakpointBands: ['ndvi', 'probability_1']})), /cannot run: NO_TRAINING_DATA$/)

        assertNothingCharted()
    })

    inOperation('are read at the pixel once the Classification stores points', async () => {
        state.catalogue[CLASSIFICATION] = trainedClassification({points: POINTS})
        state.assetBands[CLASSIFICATION_INPUT] = ['red', 'nir']

        const segments = await chart(ccdcOf({breakpointBands: ['ndvi', 'probability_1']}))

        assert.deepEqual(segments, SEGMENTS)
        assert.deepEqual(state.collections, [PIXEL_AOI])
    })

    inOperation('are read at the pixel for breakpoint bands of the images while the Classification stores no point', async () => {
        state.catalogue[CLASSIFICATION] = trainedClassification()

        const segments = await chart(ccdcOf({breakpointBands: ['ndvi']}))

        assert.deepEqual(segments, SEGMENTS)
        assert.deepEqual(state.collections, [PIXEL_AOI])
    })
})

describe('the segments of a recipe selected as a source', () => {
    inOperation('are refused, segmenting and reading nothing, where the CCDC a Masking masks cannot run', async () => {
        state.catalogue = {[MASKING]: maskingOf(), 'ccdc-1': ccdcOf(), [CLASSIFICATION]: classification(RADAR_FEATURES)}

        await assert.rejects(chart(MASKED_REFERENCE), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assertNothingCharted()
    })

    inOperation('are read once it can, masked, without describing the CCDC or its mask', async () => {
        state.catalogue = {[MASKING]: maskingOf(), 'ccdc-1': ccdcOf(), [CLASSIFICATION]: classification(COMPATIBLE)}

        const segments = await chart(MASKED_REFERENCE)

        assert.deepEqual(segments, {source: 'segments', masks: [MASK_ASSET]})
        assert.deepEqual(state.described, [])
    })

    inOperation('are refused for what the selected recipe itself requires', async () => {
        state.catalogue = {[MASKING]: maskingOf({mask: null}), 'ccdc-1': ccdcOf(), [CLASSIFICATION]: classification(COMPATIBLE)}

        await assert.rejects(chart(MASKED_REFERENCE), /cannot run: MISSING_ROLE$/)

        assertNothingCharted()
    })

    // Running the selected recipe builds the CCDC over the CCDC's own AOI, so that AOI must be had.
    inOperation('need the AOI of the recipe running beneath it, which they read', async () => {
        state.catalogue = {[MASKING]: maskingOf(), 'ccdc-1': ccdcOf({aoi: {type: 'RECIPE', id: 'gone'}}), [CLASSIFICATION]: classification(COMPATIBLE)}

        await assert.rejects(chart(MASKED_REFERENCE), error => error.message === 'No such recipe: gone')

        assertNothingCharted()
    })
})

describe('the segments of an asset', () => {
    inOperation('are read from it as before, reading no recipe', async () => {
        const segments = await chart({type: 'ASSET', id: SEGMENTS_ASSET})

        assert.deepEqual(segments, {source: SEGMENTS_ASSET, masks: []})
        assert.deepEqual(state.recipesRead, [])
    })
})

const CLASSIFICATION = 'classification-1'
const MASKING = 'masking-1'
const MASK_ASSET = 'users/x/mask'
const SEGMENTS_ASSET = 'users/x/segments'
const RADAR_FEATURES = ['VV_mean', 'VH_med']
const COMPATIBLE = ['red', 'nir', 'ndvi']
const LAT_LNG = {lat: 1, lng: 2}
const PIXEL_AOI = {type: 'POINT', ...LAT_LNG}
const MASKED_REFERENCE = {type: 'RECIPE_REF', id: MASKING}
// Every band of the segments read at the pixel, empty where a pixel has none.
const SEGMENTS = {source: 'segments', masks: []}

const ccdcOf = ({aoi = {type: 'ASSET', id: 'users/x/bounds'}, breakpointBands = ['ndvi']} = {}) => ({
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        aoi,
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands, classification: CLASSIFICATION},
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1}
    }
})

const maskingOf = ({mask = {type: 'ASSET', id: MASK_ASSET}} = {}) => ({
    id: MASKING,
    type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: 'ccdc-1'}, imageMask: mask}
})

const CLASSIFICATION_INPUT = 'users/x/input'
const classification = included => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: CLASSIFICATION_INPUT, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]}}
})

const chart = recipe => firstValueFrom(loadSegments$({requestArgs: {recipe, latLng: LAT_LNG, bands: ['ndvi']}}))

const assertNothingCharted = () => {
    assert.deepEqual(state.collections, [])
    assert.deepEqual(state.evaluated, [])
}

const deepFrozen = value => {
    Object.values(value).forEach(child => child && typeof child === 'object' && deepFrozen(child))
    return Object.freeze(value)
}
