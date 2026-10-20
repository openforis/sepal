import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock, test} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

// What an image export to the SEPAL workspace starts, per kind of user, and for which recipes. Recipe reads, image
// construction, the destination and Earth Engine are substituted; the closure, the declarations and the readiness the
// export is held to are the real ones.

const state = {}

mock.module('#sepal/ee/recipe', {
    exports: {
        loadRecipe$: id => state.catalogue[id]
            ? of(state.catalogue[id])
            : throwError(() => new Error(`Recipe could not be read: ${id}`))
    }
})
// CCDC is described by what it can be asked for, without building it.
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: recipe => ({
            getBands$: () => of(['ndvi', 'swir1']),
            getImage$: () => {
                state.built.push(recipe.id)
                return of({geometry: () => ({bounds: () => 'bounds'})})
            },
            getGeometry$: () => {
                state.built.push(recipe.id)
                return of({bounds: () => ({bounds: () => 'bounds'})})
            }
        })
    }
})
mock.module('#gee/jobs/task/export/castToLargest', {
    exports: {
        castToLargest: image => image
    }
})
mock.module('#gee/jobs/task/storage/destination', {
    exports: {
        exportFolderName: text => text.replaceAll('/', '_'),

        prepareDestination$: ({folder}, {auth}) => {
            state.prepared.push(folder)
            return of(auth.type === 'user'
                ? {destination: {type: 'drive', folder}, exportTarget: {type: 'drive', folder}}
                : {destination: {type: 'gcs', prefix: `${folder}/`}, exportTarget: {type: 'gcs', bucket: 'alice-bucket', fileNamePrefix: `${folder}/`}}
            )
        }
    }
})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            data: {ExportDestination: {DRIVE: 'DRIVE', GCS: 'GCS'}, ExportType: {IMAGE: 'IMAGE'}},
            batch: {
                Export: {convertToServerParams: (config, destination, type) => ({config, destination, type})},
                ExportTask: {create: config => config}
            },
            Geometry: geometry => geometry,
            getInfo$: value => state.regionError ? throwError(() => state.regionError) : of(value),
            startImageExport$: task => {
                state.started.push(task)
                return of('T9')
            }
        }
    }
})

const {inEEContext} = await import('#sepal/ee/eeContext')
const {startImageWorkspaceExport$} = await import('#gee/jobs/task/export/imageWorkspaceExport')

const ALICE = {username: 'alice'}
const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    title: 'My mosaic',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}
const PARAMS = {image: {recipe: MOSAIC, bands: {selection: ['red']}, filenamePrefix: 'prefix', scale: 30, workspacePath: 'x'}}
const context = type => ({requestId: 'r-1', username: 'alice', origin: 'task', auth: {type}, projectId: 'p', workloadTag: 't', endpoint: 'https://ee'})

beforeEach(() => {
    state.catalogue = {}
    state.built = []
    state.prepared = []
    state.started = []
    state.regionError = null
})

// Held to what the recipe's image output requires (imageOutput.js): one that cannot run, or that runs one that cannot,
// is refused before its image is built, a destination is prepared or an export is started.
describe('an image export to the workspace of a recipe that cannot run', () => {
    const CLASSIFICATION = 'classification-1'
    const ccdc = {
        id: 'ccdc-1',
        type: 'CCDC',
        title: 'My CCDC',
        model: {
            dates: {startDate: '2015-01-01', endDate: '2020-01-01'},
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi'], classification: CLASSIFICATION},
            options: {corrections: ['SR']}
        }
    }
    const maskingOverCcdc = {
        id: 'masking-1',
        type: 'MASKING',
        title: 'My masking',
        model: {imageToMask: {type: 'RECIPE_REF', id: ccdc.id}, imageMask: {type: 'RECIPE_REF', id: MOSAIC.id}}
    }
    const classification = included => ({
        id: CLASSIFICATION,
        type: 'CLASSIFICATION',
        model: {inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]}}
    })
    const exportOf = recipe => startImageWorkspaceExport$({image: {...PARAMS.image, recipe, bands: {selection: ['ndvi']}}}, {sepalUser: ALICE})

    beforeEach(() => {
        state.catalogue = {[ccdc.id]: ccdc, [MOSAIC.id]: MOSAIC}
    })

    it('refuses one whose classification\'s classifier the Landsat scenes cannot feed, and a Masking over it', async () => {
        state.catalogue[CLASSIFICATION] = classification(['VV_mean', 'VH_med'])

        for (const recipe of [ccdc, maskingOverCcdc]) {
            await assert.rejects(
                lastValueFrom(inEEContext(context('user'), exportOf(recipe))),
                /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/
            )
        }
        assert.deepEqual(state.built, [])
        assert.deepEqual(state.prepared, [])
        assert.deepEqual(state.started, [])
    })

    it('exports both once the classification is one the scenes can feed, to Drive or the user\'s bucket', async () => {
        state.catalogue[CLASSIFICATION] = classification(['red', 'nir', 'ndvi'])

        const toDrive = await lastValueFrom(inEEContext(context('user'), exportOf(ccdc)))
        const toBucket = await lastValueFrom(inEEContext(context('serviceAccount'), exportOf(maskingOverCcdc)))

        assert.match(toDrive.destination.folder, /^My CCDC_\d{4}-\d{2}-\d{2}_/)
        assert.match(toBucket.destination.prefix, /^My masking_\d{4}-\d{2}-\d{2}_.*\/$/)
        assert.deepEqual(state.prepared, [toDrive.destination.folder, toBucket.destination.prefix.slice(0, -1)])
        assert.partialDeepStrictEqual(state.started, [
            {destination: 'DRIVE', config: {fileNamePrefix: 'prefix', folder: toDrive.destination.folder, region: 'bounds', scale: 30}},
            {destination: 'GCS', config: {bucket: 'alice-bucket', fileNamePrefix: `${toBucket.destination.prefix}prefix`, region: 'bounds', scale: 30}}
        ])
    })

    it('fails as a read failure, not a finding, where the classification it requires cannot be read', async () => {
        await assert.rejects(
            lastValueFrom(inEEContext(context('user'), exportOf(maskingOverCcdc))),
            error => error.message === `Recipe could not be read: ${CLASSIFICATION}`
        )
        assert.deepEqual(state.built, [])
        assert.deepEqual(state.prepared, [])
        assert.deepEqual(state.started, [])
    })
})

test('a user with a Google account exports to a Drive folder named for the export', async () => {
    const result = await lastValueFrom(inEEContext(context('user'), startImageWorkspaceExport$(PARAMS, {sepalUser: ALICE})))

    const {folder} = result.destination
    assert.match(folder, /^My mosaic_\d{4}-\d{2}-\d{2}_/)
    assert.deepEqual(result, {eeTaskId: 'T9', destination: {type: 'drive', folder}})
    assert.partialDeepStrictEqual(
        state.started[0],
        {destination: 'DRIVE', config: {fileNamePrefix: 'prefix', folder: result.destination.folder}}
    )
})

test('a user without one exports to their bucket, under the export\'s folder', async () => {
    const result = await lastValueFrom(inEEContext(context('serviceAccount'), startImageWorkspaceExport$(PARAMS, {sepalUser: ALICE})))

    const {prefix} = result.destination
    assert.match(prefix, /\/$/)
    assert.deepEqual(result.destination, {type: 'gcs', prefix})
    assert.partialDeepStrictEqual(
        state.started[0],
        {destination: 'GCS', config: {bucket: 'alice-bucket', fileNamePrefix: `${result.destination.prefix}prefix`}}
    )
})

test('the folder named for a title with a slash is the same sanitised folder in the destination and the export', async () => {
    const params = {image: {...PARAMS.image, recipe: {...PARAMS.image.recipe, title: 'North/South'}}}

    const result = await lastValueFrom(inEEContext(context('user'), startImageWorkspaceExport$(params, {sepalUser: ALICE})))

    assert.match(result.destination.folder, /^North_South_\d{4}-\d{2}-\d{2}_/)
    assert.deepEqual(state.prepared, [result.destination.folder])
    assert.equal(state.started[0].config.folder, result.destination.folder)
})

test('a region that cannot be resolved fails the start before any destination is prepared', async () => {
    state.regionError = new Error('Too many pixels')

    await assert.rejects(
        lastValueFrom(inEEContext(context('user'), startImageWorkspaceExport$(PARAMS, {sepalUser: ALICE}))),
        /Too many pixels/
    )

    assert.deepEqual(state.prepared, [])
    assert.deepEqual(state.started, [])
})
