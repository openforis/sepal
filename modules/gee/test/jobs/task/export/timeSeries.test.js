import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

import {assertMatches} from '#sepal/testSupport/assert'

// The Earth Engine half of a time-series export, as the task container drives it: tile ids, the date ranges of a
// tile that have imagery, and the start of one chunk's export. Earth Engine, recipe reads and the exporter are
// substituted; the closure, the declarations and the readiness each request is held to are the real ones.

const resolved = {resolvedFeatureCollection: true}
const aoiGeometry = {aoiGeometry: true}
const featureCollection = Object.defineProperty({__featureCollection: resolved}, 'geometry', {value: () => aoiGeometry})

const state = {}
let tileIds
let rangesWithImagery

// The assembled time series: every step of the band assembly answers the same stand-in.
const timeSeries = {
    toBands: () => timeSeries,
    regexpRename: () => timeSeries,
    clip: () => timeSeries,
    select: () => 'time-series image',
    bandNames: () => ({sort: () => 'sorted'})
}
const images = {select: () => images, distinct: () => 'distinct'}

const ee = {
    List: values => values,
    ImageCollection: () => timeSeries,
    Join: {saveAll: () => ({apply: () => ({map: () => 'joined'})})},
    Filter: {equals: () => 'equal-dates'},
    Date: value => value,
    getInfo$: (value, description) => {
        state.getInfoCalls.push(description)
        return of(String(description).startsWith('time-series tile ids') ? tileIds : value)
    }
}

mock.module('#sepal/ee/ee', {
    exports: {
        default: ee
    }
})
mock.module('#sepal/ee/aoi', {
    exports: {
        toFeatureCollection$: aoi => (state.aois.push(aoi), of(featureCollection))
    }
})
mock.module('#sepal/ee/tile', {
    exports: {
        default: (collection, sizeInDegrees) => {
            state.tile = {collection, sizeInDegrees}
            return {
                aggregate_array: () => 'tileIds',
                filterMetadata: (_property, _operator, tileId) => {
                    state.tilesLookedUp.push(tileId)
                    return {first: () => ({geometry: () => 'tileGeometry'})}
                }
            }
        }
    }
})
mock.module('#sepal/ee/timeSeries/collection', {
    exports: {
        getCollection$: args => (state.getCollection = args, of(images))
    }
})
const imagery = ({startDate}) => rangesWithImagery.includes(startDate)
mock.module('#sepal/ee/optical/collection', {
    exports: {
        hasImagery: imagery
    }
})
mock.module('#sepal/ee/planet/collection', {
    exports: {
        hasImagery: imagery
    }
})
mock.module('#sepal/ee/radar/collection', {
    exports: {
        hasImagery: imagery
    }
})
mock.module('#sepal/ee/recipe', {
    exports: {
        loadRecipe$: id => state.catalogue[id]
            ? of(state.catalogue[id])
            : throwError(() => new Error(`Recipe could not be read: ${id}`))
    }
})
// A Classification's input imagery, observed as readiness's own evidence: no work of the download's.
mock.module('#sepal/ee/bandEvidence', {
    exports: {
        assetBandEvidence$: id => {
            state.observed.push(id)
            return state.unreadable.includes(id)
                ? throwError(() => new Error(`Asset unreadable: ${id}`))
                : of(['red', 'nir', 'ndvi'].map(name => ({name, arrayDimensions: 0})))
        },
        imageBandEvidence$: recipe => throwError(() => new Error(`Image described: ${recipe.id}`))
    }
})
// A time series' image is described without building or observing anything.
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: recipe => {
            throw new Error(`Built an image to establish readiness: ${recipe.id}`)
        }
    }
})
mock.module('#gee/jobs/task/export/toWorkspace', {
    exports: {
        startImageToWorkspaceExport$: (args, context) => (state.export = {args, context}, of({eeTaskId: 'T1', destination: {type: 'drive', folder: 'f'}}))
    }
})

const {timeSeriesTiles$, timeSeriesChunks$, startTimeSeriesChunkExport$} = await import('#gee/jobs/task/export/timeSeries')

const aoi = {type: 'ASSET', id: 'some/asset'}
const recipe = {
    id: 'time-series-1',
    type: 'TIME_SERIES',
    model: {
        aoi,
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
        dates: {startDate: '2020-01-01', endDate: '2020-04-01'},
        options: {corrections: []}
    }
}
const image = {recipe, indicator: 'ndvi', scale: 30, tileSize: 2}

const CLASSIFICATION = 'classification-1'
const PROVIDER = 'provider-1'
const CLASSIFIED = 'probability_1'
const POINTS = [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]
const classifiedImage = {...image, recipe: {...recipe, model: {...recipe.model, sources: {...recipe.model.sources, classification: CLASSIFICATION}}}}

// A Classification over an asset of its own, selecting `included` of it, trained on its points and the recipes it reuses.
const trainable = ({id = CLASSIFICATION, included = ['red', 'nir', 'ndvi'], images, points = POINTS, reuses = [], classifier = {type: 'RANDOM_FOREST'}} = {}) => ({
    id,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: images ?? [{imageId: 'i-1', type: 'ASSET', id: `users/x/${id}`, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
        legend: {entries: [{value: 1}, {value: 2}]},
        classifier,
        trainingData: {dataSets: [
            ...(points.length ? [{dataSetId: 'collected', type: 'COLLECTED', referenceData: points}] : []),
            ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe}))
        ]}
    }
})

// Nothing of the download is planned: no AOI resolved or tiled, no tile looked up, nothing evaluated.
const assertNothingPlanned = () => {
    assert.deepEqual(state.aois, [])
    assert.equal(state.tile, undefined)
    assert.deepEqual(state.tilesLookedUp, [])
    assert.deepEqual(state.getInfoCalls, [])
}

// Nothing of the chunk is built, its destination prepared or its export submitted.
const assertNothingExported = () => {
    assert.deepEqual(state.aois, [])
    assert.equal(state.getCollection, undefined)
    assert.equal(state.export, undefined)
}

beforeEach(() => {
    Object.assign(state, {
        catalogue: {}, aois: [], getInfoCalls: [], tilesLookedUp: [], tile: undefined, getCollection: undefined, export: undefined,
        observed: [], unreadable: []
    })
    tileIds = ['tile-0', 'tile-1']
    rangesWithImagery = []
})

// The download reads an indicator of the collection, not the time series' image, but what that image requires concerns
// the collection both build. Each entry point is held to it on its own, so skipping planning bypasses nothing.
describe('a time-series download of a recipe that cannot run', () => {
    const CLASSIFICATION = 'classification-1'
    const classified = {...image, recipe: {...recipe, model: {...recipe.model, sources: {...recipe.model.sources, classification: CLASSIFICATION}}}}
    const dateRanges = [{startDate: '2020-01-01', endDate: '2020-04-01'}]
    const chunk = {description: 'ts', image: classified, tileId: 'tile-1', tileIndex: 3, startDate: '2020-01-01', endDate: '2020-04-01'}
    const sepalUser = {username: 'alice'}

    const RADAR_STATISTICS = ['VV_mean', 'VH_med']

    it('refuses the tile ids, before resolving the aoi, where the classification\'s classifier the Landsat scenes cannot feed', async () => {
        state.catalogue[CLASSIFICATION] = trainable({included: RADAR_STATISTICS})

        await assert.rejects(lastValueFrom(timeSeriesTiles$({description: 'ts', image: classified})), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assert.deepEqual(state.aois, [])
        assert.equal(state.tile, undefined)
        assert.deepEqual(state.getInfoCalls, [])
    })

    it('refuses a tile\'s date ranges, checking no imagery', async () => {
        state.catalogue[CLASSIFICATION] = trainable({included: RADAR_STATISTICS})

        await assert.rejects(
            lastValueFrom(timeSeriesChunks$({description: 'ts', image: classified, tileId: 'tile-1', dateRanges})),
            /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/
        )

        assert.deepEqual(state.aois, [])
        assert.deepEqual(state.tilesLookedUp, [])
        assert.deepEqual(state.getInfoCalls, [])
    })

    it('refuses a chunk export requested directly, building and exporting nothing', async () => {
        state.catalogue[CLASSIFICATION] = trainable({included: RADAR_STATISTICS})

        await assert.rejects(lastValueFrom(startTimeSeriesChunkExport$(chunk, {sepalUser})), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

        assert.deepEqual(state.aois, [])
        assert.equal(state.getCollection, undefined)
        assert.equal(state.export, undefined)
    })

    it('plans and exports as before once the classification is one the scenes can feed', async () => {
        state.catalogue[CLASSIFICATION] = trainable()
        rangesWithImagery = ['2020-01-01']

        const tiles = await lastValueFrom(timeSeriesTiles$({description: 'ts', image: classified}))
        const chunks = await lastValueFrom(timeSeriesChunks$({description: 'ts', image: classified, tileId: 'tile-1', dateRanges}))
        const exported = await lastValueFrom(startTimeSeriesChunkExport$(chunk, {sepalUser}))

        assert.deepEqual(tiles, {tileIds: ['tile-0', 'tile-1']})
        assert.deepEqual(chunks, {dateRanges})
        assert.deepEqual(exported, {eeTaskId: 'T1', destination: {type: 'drive', folder: 'f'}})
        assertMatches(state.getCollection, {
            recipe: classified.recipe, geometry: aoiGeometry, bands: ['ndvi'], startDate: '2020-01-01', endDate: '2020-04-01'
        })
        assert.partialDeepStrictEqual(state.export.args, {description: 'ts_3_2020-01-01_2020-04-01', scale: 30, image: 'time-series image'})
        assert.deepEqual(state.export.context, {sepalUser})
    })

    it('fails a chunk export as a read failure, not a finding, where the classification cannot be read', async () => {
        await assert.rejects(
            lastValueFrom(startTimeSeriesChunkExport$(chunk, {sepalUser})),
            error => error.message === `Recipe could not be read: ${CLASSIFICATION}`
        )

        assert.equal(state.getCollection, undefined)
        assert.equal(state.export, undefined)
    })
})

// The Classification a time series' Sources select is part of its analysis: what training it needs refuses the
// download, as what its image requires, whatever indicators it names - one the Classification computes, which trains it
// (collection.js), and one of the scenes alike - before anything is tiled, built or exported. Then each indicator the
// Classification computes must be one it provides: planning judges every indicator the download names - `indicators`,
// or the one `indicator` a request from an earlier release names - and each chunk its own.
describe('a time-series download over a Classification that cannot be trained', () => {
    const SVM = {type: 'SVM', svmType: 'C_SVC'}
    const download = indicators => ({...classifiedImage, indicators, indicator: indicators[0]})
    const chunkOf = (indicator, indicators = [indicator]) =>
        ({description: 'ts', image: {...classifiedImage, indicators, indicator}, tileId: 'tile-1', tileIndex: 3, startDate: '2020-01-01', endDate: '2020-04-01'})
    const dateRanges = [{startDate: '2020-01-01', endDate: '2020-04-01'}]
    const sepalUser = {username: 'alice'}

    for (const [_case, catalogue, code] of [
        ['stores no points', () => ({[CLASSIFICATION]: trainable({points: []})}), 'NO_TRAINING_DATA'],
        ['reuses a recipe without input imagery', () => ({[CLASSIFICATION]: trainable({reuses: [PROVIDER]}), [PROVIDER]: trainable({id: PROVIDER, images: []})}), 'MISSING_ROLE'],
        ['reuses a recipe sampling fewer features', () => ({[CLASSIFICATION]: trainable({reuses: [PROVIDER]}), [PROVIDER]: trainable({id: PROVIDER, included: ['red']})}), 'MISSING_TRAINING_FEATURES']
    ]) {
        for (const indicators of [[CLASSIFIED], ['ndvi']]) {
            it(`refuses the tile ids of ${indicators.join(', ')}, tiling nothing, where the Classification ${_case}`, async () => {
                state.catalogue = catalogue()

                await assert.rejects(lastValueFrom(timeSeriesTiles$({description: 'ts', image: download(indicators)})), new RegExp(`time-series-1 cannot run: ${code}$`))

                assertNothingPlanned()
            })
        }
    }

    it('refuses the tile ids of a download naming an indicator of the scenes beside one the Classification computes', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}

        await assert.rejects(lastValueFrom(timeSeriesTiles$({description: 'ts', image: download(['ndvi', CLASSIFIED])})), /NO_TRAINING_DATA$/)

        assertNothingPlanned()
    })

    it('judges the one indicator a request from an earlier release names', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({classifier: SVM})}
        const {indicators: _indicators, ...legacy} = download(['regression'])

        await assert.rejects(lastValueFrom(timeSeriesTiles$({description: 'ts', image: legacy})), error => error.errorCode === 'UNSUPPORTED_CLASSIFIED_OUTPUT')
        assert.deepEqual(
            await lastValueFrom(timeSeriesTiles$({description: 'ts', image: {...legacy, indicator: 'ndvi'}})),
            {tileIds: ['tile-0', 'tile-1']}
        )
    })

    it('refuses a tile\'s date ranges, checking no imagery', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}

        await assert.rejects(
            lastValueFrom(timeSeriesChunks$({description: 'ts', image: download(['ndvi', CLASSIFIED]), tileId: 'tile-1', dateRanges})),
            /NO_TRAINING_DATA$/
        )

        assertNothingPlanned()
    })

    it('refuses the chunk export of an indicator the Classification computes, building and exporting nothing', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}

        await assert.rejects(lastValueFrom(startTimeSeriesChunkExport$(chunkOf(CLASSIFIED, ['ndvi', CLASSIFIED]), {sepalUser})), /NO_TRAINING_DATA$/)

        assertNothingExported()
    })

    it('refuses the chunk export of an indicator of the scenes too, building and exporting nothing', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}

        await assert.rejects(lastValueFrom(startTimeSeriesChunkExport$(chunkOf('ndvi', ['ndvi', CLASSIFIED]), {sepalUser})), /NO_TRAINING_DATA$/)

        assertNothingExported()
    })

    it('exports the chunk of an indicator of the scenes, judging its own indicator alone, beside one a trainable Classification does not provide', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({classifier: SVM})}

        await lastValueFrom(startTimeSeriesChunkExport$(chunkOf('ndvi', ['ndvi', 'regression']), {sepalUser}))

        assertMatches(state.getCollection, {bands: ['ndvi']})
    })

    it('exports the chunk once the Classification stores points again', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}
        await assert.rejects(lastValueFrom(startTimeSeriesChunkExport$(chunkOf(CLASSIFIED), {sepalUser})), /NO_TRAINING_DATA$/)

        state.catalogue = {[CLASSIFICATION]: trainable()}
        await lastValueFrom(startTimeSeriesChunkExport$(chunkOf(CLASSIFIED), {sepalUser}))

        assertMatches(state.getCollection, {bands: [CLASSIFIED]})
        assert.notEqual(state.export, undefined)
    })

    it('fails a chunk export with what could not be read, as no finding, where the Classification\'s input cannot be observed', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable()}
        state.unreadable = [`users/x/${CLASSIFICATION}`]

        await assert.rejects(
            lastValueFrom(startTimeSeriesChunkExport$(chunkOf(CLASSIFIED), {sepalUser})),
            /cannot run: what it needs could not be read: Asset unreadable: users\/x\/classification-1$/
        )

        assertNothingExported()
    })

    it('refuses an output its trainable Classification does not provide as a client\'s error, tiling nothing', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({classifier: SVM})}

        await assert.rejects(lastValueFrom(timeSeriesTiles$({description: 'ts', image: download(['ndvi', 'regression'])})), error =>
            error.errorCode === 'UNSUPPORTED_CLASSIFIED_OUTPUT' && error.statusCode === 400
            && error.message === `Classification ${CLASSIFICATION} does not provide regression`)

        assertNothingPlanned()
    })

    // What the configuration needs comes first: the Classification's training before an output asked of it.
    it('refuses a Classification that cannot be trained before an output it does not provide, tiling nothing', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: [], classifier: SVM})}

        await assert.rejects(lastValueFrom(timeSeriesTiles$({description: 'ts', image: download(['ndvi', 'regression'])})), /time-series-1 cannot run: NO_TRAINING_DATA$/)

        assertNothingPlanned()
    })

    it('refuses classifier inputs the scenes cannot feed before anything the indicators add', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({included: ['VV_mean', 'VH_med'], classifier: SVM})}

        await assert.rejects(lastValueFrom(timeSeriesTiles$({description: 'ts', image: download(['regression'])})), /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)
    })
})

// What a download builds is a Time Series' collection whatever type its recipe states, so it is judged as one: MOSAIC
// declares no need of a Classification at all. Each entry point refuses before anything is tiled, checked or built.
describe('a time-series download of a recipe stated as another type', () => {
    const stated = {...classifiedImage, recipe: {...classifiedImage.recipe, type: 'MOSAIC'}, indicators: [CLASSIFIED], indicator: CLASSIFIED}
    const dateRanges = [{startDate: '2020-01-01', endDate: '2020-04-01'}]
    const chunk = {description: 'ts', image: stated, tileId: 'tile-1', tileIndex: 3, startDate: '2020-01-01', endDate: '2020-04-01'}
    const sepalUser = {username: 'alice'}

    it('refuses its tile ids, date ranges and chunk export, building nothing, where its Classification stores no points', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable({points: []})}

        await assert.rejects(lastValueFrom(timeSeriesTiles$({description: 'ts', image: stated})), /time-series-1 cannot run: NO_TRAINING_DATA$/)
        await assert.rejects(lastValueFrom(timeSeriesChunks$({description: 'ts', image: stated, tileId: 'tile-1', dateRanges})), /NO_TRAINING_DATA$/)
        await assert.rejects(lastValueFrom(startTimeSeriesChunkExport$(chunk, {sepalUser})), /NO_TRAINING_DATA$/)

        assertNothingPlanned()
        assertNothingExported()
    })

    it('is planned and exported as before once its Classification can be trained', async () => {
        state.catalogue = {[CLASSIFICATION]: trainable()}

        assert.deepEqual(await lastValueFrom(timeSeriesTiles$({description: 'ts', image: stated})), {tileIds: ['tile-0', 'tile-1']})
        await lastValueFrom(startTimeSeriesChunkExport$(chunk, {sepalUser}))

        assertMatches(state.getCollection, {recipe: stated.recipe, bands: [CLASSIFIED]})
        assert.notEqual(state.export, undefined)
    })
})

describe('timeSeriesTiles$', () => {
    it('tiles the once-resolved aoi and answers the tile ids', async () => {
        const result = await lastValueFrom(timeSeriesTiles$({description: 'ts', image}))

        assert.deepEqual(result, {tileIds: ['tile-0', 'tile-1']})
        assert.deepEqual(state.aois, [aoi])
        assert.deepEqual(state.tile, {collection: featureCollection, sizeInDegrees: 2})
    })
})

describe('timeSeriesChunks$', () => {
    const dateRanges = [
        {startDate: '2020-01-01', endDate: '2020-04-01'},
        {startDate: '2020-04-01', endDate: '2020-07-01'},
        {startDate: '2020-07-01', endDate: '2020-10-01'}
    ]

    it('answers, in order, only the date ranges that have imagery, checking the tile in one request', async () => {
        rangesWithImagery = ['2020-01-01', '2020-07-01']

        const result = await lastValueFrom(timeSeriesChunks$({description: 'ts', image, tileId: 'tile-1', dateRanges}))

        assert.deepEqual(result, {dateRanges: [dateRanges[0], dateRanges[2]]})
        assert.equal(state.getInfoCalls.length, 1)
        assert.deepEqual(state.tilesLookedUp, ['tile-1'])
    })
})

describe('startTimeSeriesChunkExport$', () => {
    const request = {description: 'ts', image, tileId: 'tile-1', tileIndex: 3, startDate: '2020-01-01', endDate: '2020-04-01'}
    const sepalUser = {username: 'alice'}

    it('builds the chunk of its tile from the whole aoi and exports it to the workspace under the chunk name', async () => {
        const result = await lastValueFrom(startTimeSeriesChunkExport$(request, {sepalUser}))

        assert.deepEqual(result, {eeTaskId: 'T1', destination: {type: 'drive', folder: 'f'}})
        assert.deepEqual(state.tilesLookedUp, ['tile-1'])
        assertMatches(state.getCollection, {
            recipe, geometry: aoiGeometry, bands: ['ndvi'], startDate: '2020-01-01', endDate: '2020-04-01'
        })
        assert.partialDeepStrictEqual(state.export.args, {description: 'ts_3_2020-01-01_2020-04-01', scale: 30})
        assert.equal(state.export.args.image, 'time-series image')
        assert.equal(state.export.args.region, undefined)
        assert.deepEqual(state.export.context, {sepalUser})
    })

    it('exports each run of a chunk into a folder named for the time it started', async () => {
        await lastValueFrom(startTimeSeriesChunkExport$(request, {sepalUser}))

        assert.match(
            state.export.args.folder,
            /^ts_3_2020-01-01_2020-04-01_\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2}\.\d{3}$/
        )
    })

    it('prefers the filename prefix over the description', async () => {
        await lastValueFrom(startTimeSeriesChunkExport$({...request, image: {...image, filenamePrefix: 'prefix'}}, {sepalUser}))

        assert.equal(state.export.args.description, 'prefix_3_2020-01-01_2020-04-01')
    })
})
