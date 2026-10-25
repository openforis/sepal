import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock, test} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

// What an image export to Drive starts, as which user, and for which recipes. Recipe reads, image construction, the
// Drive client and Earth Engine are substituted; the closure, the declarations and the readiness the export is held
// to are the real ones.

const state = {}

// The Classification's input is observed holding what it selects (`state.inputBands`), to judge its training.
mock.module('#sepal/ee/bandEvidence', {
    exports: {
        assetBandEvidence$: () => of((state.inputBands || []).map(name => ({name, arrayDimensions: 0}))),
        imageBandEvidence$: recipe => throwError(() => new Error(`Image described: ${recipe.id}`))
    }
})
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
                return of({cast: () => 'cast-image', bandNames: () => ({size: () => 1})})
            },
            getGeometry$: () => {
                state.built.push(recipe.id)
                return of({bounds: () => ({bounds: () => 'bounds'})})
            }
        })
    }
})
mock.module('#gee/config', {
    exports: {
        sepalHost: 'sepal.test',
        googleProjectId: 'p',
        serviceAccountCredentials: {}
    }
})
mock.module('#gee/jobs/service/userStorageSerializer', {
    exports: {
        userStorageSerializer$: (observable$, _id, username) => {
            state.serialized.push(username)
            return observable$
        }
    }
})
mock.module('#gee/jobs/task/export/castToLargest', {
    exports: {
        castToLargest: image => image
    }
})
mock.module('#gee/jobs/ee/batch/drive', {
    exports: {
        drive: ({sepalUser}) => ({
            createFolder$: ({path}) => {
                state.folders.push({username: sepalUser.username, path})
                return of({id: 'folder-id'})
            }
        })
    }
})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            data: {ExportDestination: {DRIVE: 'DRIVE'}, ExportType: {IMAGE: 'IMAGE'}},
            batch: {Export: {convertToServerParams: config => config}, ExportTask: {create: config => config}},
            Geometry: geometry => geometry,
            getInfo$: value => of(value),
            startImageExport$: task => {
                state.started.push(task)
                return of('T5')
            }
        }
    }
})

const {inEEContext} = await import('#sepal/ee/eeContext')
const {startImageDriveExport$} = await import('#gee/jobs/task/export/imageDriveExport')

const ALICE = {username: 'alice', googleTokens: {accessToken: 'a', accessTokenExpiryDate: Date.now() + 3600000}}
const context = auth => ({requestId: 'r-1', username: 'alice', origin: 'task', auth, projectId: 'p', workloadTag: 't', endpoint: 'https://ee'})
const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    title: 'My mosaic',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}
const params = {image: {recipe: MOSAIC, bands: {selection: ['red']}, driveFolder: 'exports-1', scale: 30}}

beforeEach(() => {
    state.catalogue = {}
    state.built = []
    state.folders = []
    state.serialized = []
    state.started = []
})

// Held to what the recipe's image output requires (imageOutput.js): one that cannot run, or that runs one that cannot,
// is refused before its image is built, a folder is created or an export is started.
describe('an image export to Drive of a recipe that cannot run', () => {
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
    // Trained on points over `included` of an asset: every CCDC export trains it (type/ccdc.js).
    const classification = included => {
        state.inputBands = included
        return {
            id: CLASSIFICATION,
            type: 'CLASSIFICATION',
            model: {
                inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
                legend: {entries: [{value: 1}, {value: 2}]},
                trainingData: {dataSets: [{type: 'COLLECTED', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]},
                classifier: {type: 'RANDOM_FOREST'}
            }
        }
    }
    const exportOf = recipe => startImageDriveExport$({image: {...params.image, recipe, bands: {selection: ['ndvi_coefs']}}}, {sepalUser: ALICE})

    beforeEach(() => {
        state.catalogue = {[ccdc.id]: ccdc, [MOSAIC.id]: MOSAIC}
    })

    it('refuses one whose classification\'s classifier the Landsat scenes cannot feed, and a Masking over it', async () => {
        state.catalogue[CLASSIFICATION] = classification(['VV_mean', 'VH_med'])

        for (const recipe of [ccdc, maskingOverCcdc]) {
            await assert.rejects(
                lastValueFrom(inEEContext(context({type: 'user'}), exportOf(recipe))),
                /cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/
            )
        }
        assert.deepEqual(state.built, [])
        assert.deepEqual(state.folders, [])
        assert.deepEqual(state.started, [])
    })

    it('exports both once the classification is one the scenes can feed', async () => {
        state.catalogue[CLASSIFICATION] = classification(['red', 'nir', 'ndvi'])

        for (const recipe of [ccdc, maskingOverCcdc]) {
            const result = await lastValueFrom(inEEContext(context({type: 'user'}), exportOf(recipe)))
            assert.deepEqual(result, {eeTaskId: 'T5'})
        }
        assert.deepEqual(state.folders, [
            {username: 'alice', path: 'SEPAL/exports/exports-1'},
            {username: 'alice', path: 'SEPAL/exports/exports-1'}
        ])
        assert.deepEqual(state.serialized, ['alice', 'alice'])
        assert.partialDeepStrictEqual(state.started, [
            {folder: 'exports-1', fileNamePrefix: 'My CCDC', description: 'My CCDC', region: 'bounds', scale: 30},
            {folder: 'exports-1', fileNamePrefix: 'My masking', description: 'My masking', region: 'bounds', scale: 30}
        ])
    })

    it('fails as a read failure, not a finding, where the classification it requires cannot be read', async () => {
        await assert.rejects(
            lastValueFrom(inEEContext(context({type: 'user'}), exportOf(maskingOverCcdc))),
            error => error.message === `Recipe could not be read: ${CLASSIFICATION}`
        )
        assert.deepEqual(state.built, [])
        assert.deepEqual(state.folders, [])
        assert.deepEqual(state.started, [])
    })
})

// Its baseline is read of the Classification's one input image, so one of two is refused - gate or no gate - before
// anything of the alerts is built, a folder is created or an export is started.
describe('an image export to Drive of a PyEO Alerts over a Classification of two input images', () => {
    const CLASSIFICATION = 'classification-1'
    const input = (imageId, id) => ({imageId, type: 'ASSET', id, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]})
    const alerts = gate => ({
        id: 'pyeo-1',
        type: 'PYEO_ALERTS',
        title: 'My alerts',
        model: {
            sources: {classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, changeFromClasses: [1], changeToClasses: [2]},
            options: {corrections: ['SR']},
            pyeoAlertsOptions: {minConsecutiveDetections: 2, ...(gate && {indexGate: gate})}
        }
    })

    beforeEach(() => {
        state.catalogue = {[CLASSIFICATION]: {
            id: CLASSIFICATION,
            type: 'CLASSIFICATION',
            model: {
                inputImagery: {images: [input('i-1', 'users/x/a'), input('i-2', 'users/x/b')]},
                legend: {entries: [{value: 1}, {value: 2}]},
                trainingData: {dataSets: [{type: 'COLLECTED', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]},
                classifier: {type: 'RANDOM_FOREST'}
            }
        }}
    })

    for (const [_case, gate] of [['its gate off', undefined], ['its gate on', {index: 'ndvi', threshold: 0.2}]]) {
        it(`is refused, ${_case}, before anything is built`, async () => {
            await assert.rejects(
                lastValueFrom(inEEContext(context({type: 'user'}), startImageDriveExport$(
                    {image: {...params.image, recipe: alerts(gate), bands: {selection: ['total_changes']}}},
                    {sepalUser: ALICE}
                ))),
                /cannot run: MULTIPLE_CLASSIFICATION_INPUTS$/
            )
            assert.deepEqual(state.built, [])
            assert.deepEqual(state.folders, [])
            assert.deepEqual(state.started, [])
        })
    }
})

test('creates the Drive folder as the user, one creation at a time per user, then starts the export into it', async () => {
    const result = await lastValueFrom(inEEContext(context({type: 'user'}), startImageDriveExport$(params, {sepalUser: ALICE})))

    assert.deepEqual(result, {eeTaskId: 'T5'})
    assert.deepEqual(state.folders, [{username: 'alice', path: 'SEPAL/exports/exports-1'}])
    assert.deepEqual(state.serialized, ['alice'])
    assert.partialDeepStrictEqual(
        state.started[0],
        {folder: 'exports-1', fileNamePrefix: 'My mosaic', description: 'My mosaic'}
    )
})

test('a folder named after a recipe title is made safe, the same for the Drive folder and the export', async () => {
    const titled = {image: {...params.image, driveFolder: 'Mosaic 2020/21 "x"_2026-10-06'}}

    const result = await lastValueFrom(inEEContext(context({type: 'user'}), startImageDriveExport$(titled, {sepalUser: ALICE})))

    assert.deepEqual(result, {eeTaskId: 'T5'})
    assert.deepEqual(
        state.folders,
        [{username: 'alice', path: 'SEPAL/exports/Mosaic 2020_21 _x__2026-10-06'}]
    )
    assert.partialDeepStrictEqual(state.started[0], {folder: 'Mosaic 2020_21 _x__2026-10-06'})
})

test('starts nothing for a user without a Google account', async () => {
    const result = await lastValueFrom(inEEContext(context({type: 'serviceAccount'}), startImageDriveExport$(params, {sepalUser: {username: 'alice'}})))

    assert.deepEqual(result, {eeTaskId: null})
    assert.deepEqual(state.started, [])
})
