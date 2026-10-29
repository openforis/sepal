import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// What a segment chart's request (/ccdc/loadSegments) is held to before anything is segmented or read at its pixel. A
// CCDC charted itself is held to its PIXEL_SEGMENTS readiness - the Classification its Sources select trainable among it,
// whatever bands are fitted (type/ccdc.js) - judged and segmented at the clicked point; a recipe selected as a source is
// held to its own image's readiness, over its own AOI, which a CCDC beneath it brings its Classification's training to;
// an asset is read as it is. The real job,
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
            getAsset$: id => state.unreadable.includes(id)
                ? throwError(() => new Error(`Asset unreadable: ${id}`))
                : of({type: 'Image', properties: {}}),
            // Readiness's own evidence of an input's bands is no work of the chart's.
            getInfo$: (value, description) => {
                (description?.startsWith('asset band evidence') ? state.evidence : state.evaluated).push(value)
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
        getCollection$: ({recipe, bands}) => {
            state.collections.push(recipe.model.aoi)
            state.fitted.push(bands)
            return of(eeImage('collection'))
        }
    }
})
mock.module('#gee/jobs/job', {exports: {job: ({worker$}) => worker$}})

// The real readiness, recording each operation a request is judged by.
const readiness = await import('#gee/jobs/executionReadiness')
mock.module('#gee/jobs/executionReadiness', {
    exports: {
        ...readiness,
        requireExecutable$: args => {
            state.judged.push(args.operation)
            return readiness.requireExecutable$(args)
        }
    }
})

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: loadSegments$} = await import('#gee/jobs/ee/ccdc/loadSegments')

// Each case is its own execution operation, reading each recipe once.
const inOperation = (name, fn) => it(name, () => operation(fn))

// One execution operation: what it reads of the catalogue, it reads once.
const operation = async fn => {
    const scope = new RecipeScope(id => {
        state.recipesRead.push(id)
        return state.catalogue[id] ? of(state.catalogue[id]) : throwError(() => new Error(`No such recipe: ${id}`))
    })
    try {
        return await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
}

beforeEach(() => {
    Object.assign(state, {catalogue: {}, assetBands: {}, unreadable: [], recipesRead: [], described: [], evaluated: [], evidence: [], collections: [], fitted: [], judged: []})
})

describe('the segments of a CCDC charted itself', () => {
    inOperation('are refused, segmenting and reading nothing at the pixel, where its classification\'s classifier the scenes cannot feed', async () => {
        state.catalogue[CLASSIFICATION] = trainable({included: RADAR_FEATURES})

        await assert.rejects(chart(ccdcOf()), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assertNothingCharted()
    })

    inOperation('are read at the pixel once the classification is one the scenes can feed, segmented there', async () => {
        state.catalogue[CLASSIFICATION] = trainable()

        const segments = await chart(ccdcOf())

        assert.deepEqual(segments, SEGMENTS)
        assert.deepEqual(state.collections, [PIXEL_AOI])
    })

    for (const [_case, aoi] of [
        ['a recipe that cannot be read', {type: 'RECIPE', id: 'gone'}],
        ['the CCDC itself', {type: 'RECIPE', id: 'ccdc-1'}]
    ]) {
        inOperation(`are read over an AOI of ${_case}, which segmenting at the pixel does not read, leaving the request as it was`, async () => {
            state.catalogue[CLASSIFICATION] = trainable()
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

// The Classification a CCDC's Sources select is part of its analysis: what training it needs refuses the segments, at
// the recipe it concerns, before anything is segmented - for a band it computes, fitted with the breakpoint bands, and
// for a band of the images alike, whichever the breakpoint bands are.
describe('the segments of a CCDC charted itself over a Classification that cannot be trained', () => {
    for (const [_case, catalogue, code] of [
        ['stores no points', () => ({[CLASSIFICATION]: trainable({points: []})}), 'NO_TRAINING_DATA'],
        ['has multiple input images', () => {
            const recipe = trainable()
            const input = recipe.model.inputImagery.images[0]
            recipe.model.inputImagery.images.push({...input, imageId: 'i-2'})
            return {[CLASSIFICATION]: recipe}
        }, 'MULTIPLE_CLASSIFIER_INPUTS'],
        ['reuses a recipe without input imagery', () => ({[CLASSIFICATION]: trainable({reuses: [PROVIDER]}), [PROVIDER]: trainable({id: PROVIDER, images: []})}), 'MISSING_ROLE'],
        ['reuses a recipe sampling fewer features', () => ({[CLASSIFICATION]: trainable({reuses: [PROVIDER]}), [PROVIDER]: trainable({id: PROVIDER, included: ['red']})}), 'MISSING_TRAINING_FEATURES']
    ]) {
        for (const [band, breakpointBands] of [['probability_1', ['ndvi']], ['ndvi', ['ndvi']], ['ndvi', ['ndvi', 'probability_1']]]) {
            inOperation(`are refused for ${band}, breakpoint bands ${breakpointBands.join(', ')}, segmenting nothing, where the Classification ${_case}`, async () => {
                state.catalogue = catalogue()

                await assert.rejects(chartBand(ccdcOf({breakpointBands}), band), new RegExp(`ccdc-1 cannot run: ${code}$`))

                assertNothingCharted()
            })
        }
    }

    it('are read once the Classification stores points again, the band fitted with the breakpoint bands', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}
        await assert.rejects(operation(() => chartBand(ccdcOf(), CLASSIFIED)), /NO_TRAINING_DATA$/)

        state.catalogue = {[CLASSIFICATION]: trainable()}
        assert.deepEqual(await operation(() => chartBand(ccdcOf(), CLASSIFIED)), SEGMENTS)

        assert.deepEqual(state.fitted, [[CLASSIFIED, 'ndvi']])
    })

    inOperation('fail with what could not be read, as no finding and segmenting nothing, where the Classification\'s input cannot be observed', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable()}
        state.unreadable = [inputOf(CLASSIFICATION)]

        await assert.rejects(chartBand(ccdcOf(), CLASSIFIED), /cannot run: what it needs could not be read: Asset unreadable: users\/x\/classification-1-input$/)

        assertNothingCharted()
    })
})

// The CCDC's own configuration is judged first, its Classification's training and a classified breakpoint band's output
// included; then the outputs the request adds, refused as the collection refuses them.
describe('the segments of a CCDC charted itself where more than one thing is wrong', () => {
    const SVM = {type: 'SVM', svmType: 'C_SVC'}

    inOperation('are refused for a classified breakpoint band\'s training before a requested output the Classification does not provide', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: [], classifier: SVM})}

        await assert.rejects(chartBand(ccdcOf({breakpointBands: ['ndvi', CLASSIFIED]}), 'regression'), /ccdc-1 cannot run: NO_TRAINING_DATA$/)

        assertNothingCharted()
    })

    inOperation('are refused for the Classification\'s training before a requested output it does not provide, the breakpoint bands native', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: [], classifier: SVM})}

        await assert.rejects(chartBand(ccdcOf(), 'regression'), /ccdc-1 cannot run: NO_TRAINING_DATA$/)

        assertNothingCharted()
    })

    inOperation('are refused for a requested output a trainable Classification does not provide, as a client\'s error', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({classifier: SVM})}

        await assert.rejects(chartBand(ccdcOf(), 'regression'), error =>
            error.errorCode === 'UNSUPPORTED_CLASSIFIED_OUTPUT' && error.statusCode === 400
            && error.message === `Classification ${CLASSIFICATION} does not provide regression`)

        assertNothingCharted()
    })

    inOperation('are refused for a configured breakpoint band the Classification does not provide, as the configuration\'s finding', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({classifier: SVM})}

        await assert.rejects(chartBand(ccdcOf({breakpointBands: ['ndvi', 'regression']}), 'regression'), error =>
            /ccdc-1 cannot run: UNSUPPORTED_CLASSIFIED_OUTPUT$/.test(error.message) && error.errorCode === undefined)

        assertNothingCharted()
    })

    inOperation('are refused for classifier inputs the scenes cannot feed before anything the request adds', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({included: RADAR_FEATURES, classifier: SVM})}

        await assert.rejects(chartBand(ccdcOf(), 'regression'), /ccdc-1 cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assertNothingCharted()
    })
})

// The GUI's chart watches the same (ccdc/panels/chartPixel.jsx): its segments' operation alone, whatever band is asked.
describe('the operations a CCDC chart\'s segment request is judged by', () => {
    for (const band of ['ndvi', 'probability_1']) {
        inOperation(`are its segments' alone for ${band}`, async () => {
            state.catalogue = {[CLASSIFICATION]: trainable()}

            await chartBand(ccdcOf(), band)

            assert.deepEqual(state.judged, ['PIXEL_SEGMENTS'])
        })
    }
})

// Selecting none, or a supplied decision tree, needs no training.
describe('the segments of a CCDC needing no training', () => {
    inOperation('are read selecting no Classification, reading none', async () => {
        const {model: {sources: {classification: _classification, ...sources}, ...model}, ...recipe} = ccdcOf()

        assert.deepEqual(await chart({...recipe, model: {...model, sources}}), SEGMENTS)
        assert.deepEqual(state.recipesRead, [])
    })

    inOperation('are read over a supplied decision tree storing no points', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: [], classifier: {type: 'DECISION_TREE', decisionTree: '1) root 9 0 0 (0 1) *'}})}

        assert.deepEqual(await chart(ccdcOf()), SEGMENTS)
    })
})

describe('the segments of a recipe selected as a source', () => {
    inOperation('are refused, segmenting and reading nothing, where the CCDC a Masking masks cannot run', async () => {
        state.catalogue = {[MASKING]: maskingOf(), 'ccdc-1': ccdcOf(), [CLASSIFICATION]: trainable({included: RADAR_FEATURES})}

        await assert.rejects(chart(MASKED_REFERENCE), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assertNothingCharted()
    })

    inOperation('are read once it can, masked, describing neither the CCDC nor its mask, only its Classification\'s input', async () => {
        state.catalogue = {[MASKING]: maskingOf(), 'ccdc-1': ccdcOf(), [CLASSIFICATION]: trainable()}

        const segments = await chart(MASKED_REFERENCE)

        assert.deepEqual(segments, {source: 'segments', masks: [MASK_ASSET]})
        assert.deepEqual(state.described.filter(({name}) => name).map(({name}) => name), COMPATIBLE)
    })

    inOperation('are refused for what the selected recipe itself requires', async () => {
        state.catalogue = {[MASKING]: maskingOf({mask: null}), 'ccdc-1': ccdcOf(), [CLASSIFICATION]: trainable()}

        await assert.rejects(chart(MASKED_REFERENCE), /cannot run: MISSING_ROLE$/)

        assertNothingCharted()
    })

    // Running the selected recipe builds the CCDC over the CCDC's own AOI, so that AOI must be had.
    inOperation('need the AOI of the recipe running beneath it, which they read', async () => {
        state.catalogue = {[MASKING]: maskingOf(), 'ccdc-1': ccdcOf({aoi: {type: 'RECIPE', id: 'gone'}}), [CLASSIFICATION]: trainable()}

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

const chart = recipe => chartBand(recipe, 'ndvi')

const chartBand = (recipe, band) => firstValueFrom(loadSegments$({requestArgs: {recipe, latLng: LAT_LNG, bands: [band]}}))

const PROVIDER = 'provider-1'
const CLASSIFIED = 'probability_1'
const POINTS = [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]

const inputOf = id => `users/x/${id}-input`

// A Classification over an asset of its own, selecting `included` of it, trained on its points and the recipes it
// reuses; each input observed holding what it selects.
const trainable = ({id = CLASSIFICATION, included = COMPATIBLE, images, points = POINTS, reuses = [], classifier = {type: 'RANDOM_FOREST'}} = {}) => {
    state.assetBands[inputOf(id)] = included
    return {
        id,
        type: 'CLASSIFICATION',
        model: {
            inputImagery: {images: images ?? [{imageId: 'i-1', type: 'ASSET', id: inputOf(id), bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
            legend: {entries: [{value: 1}, {value: 2}]},
            classifier,
            trainingData: {dataSets: [
                ...(points.length ? [{dataSetId: 'collected', type: 'COLLECTED', referenceData: points}] : []),
                ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe}))
            ]}
        }
    }
}

const assertNothingCharted = () => {
    assert.deepEqual(state.collections, [])
    assert.deepEqual(state.evaluated, [])
}

const deepFrozen = value => {
    Object.values(value).forEach(child => child && typeof child === 'object' && deepFrozen(child))
    return Object.freeze(value)
}
