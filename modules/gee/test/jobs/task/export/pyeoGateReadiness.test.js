import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

// A PyEO Alerts export with Require drop on, over a Classification of a Stack of an optical asset: held to the readiness
// its execution is (imageOutput.js), which judges the gate's index of the names the Stack outputs. Recipe reads, the
// asset's bands, image construction, the Drive client and Earth Engine are substituted; the closure, the declarations
// and the readiness are the real ones.

const state = {}

mock.module('#sepal/ee/recipe', {
    exports: {
        loadRecipe$: id => state.catalogue[id]
            ? of(state.catalogue[id])
            : throwError(() => new Error(`Recipe could not be read: ${id}`))
    }
})
mock.module('#sepal/ee/bandEvidence', {
    exports: {
        assetBandEvidence$: () => of(['red', 'nir', 'swir1', 'swir2'].map(name => ({name, arrayDimensions: 0}))),
        imageBandEvidence$: recipe => throwError(() => new Error(`Image described: ${recipe.id}`))
    }
})
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: recipe => ({
            getImage$: () => {
                state.built.push(recipe.id)
                return of({cast: () => 'cast-image', bandNames: () => ({size: () => 1})})
            },
            getGeometry$: () => of({bounds: () => ({bounds: () => 'bounds'})})
        })
    }
})
mock.module('#gee/config', {exports: {sepalHost: 'sepal.test', googleProjectId: 'p', serviceAccountCredentials: {}}})
mock.module('#gee/jobs/service/userStorageSerializer', {exports: {userStorageSerializer$: observable$ => observable$}})
mock.module('#gee/jobs/task/export/castToLargest', {exports: {castToLargest: image => image}})
mock.module('#gee/jobs/ee/batch/drive', {
    exports: {drive: () => ({createFolder$: () => of({id: 'folder-id'})})}
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
const context = {requestId: 'r-1', username: 'alice', origin: 'task', auth: {type: 'user'}, projectId: 'p', workloadTag: 't', endpoint: 'https://ee'}
const CLASSIFICATION = 'classification-1'
const STACK = 'stack-1'

beforeEach(() => {
    state.built = []
    state.started = []
})

describe('an image export of a PyEO Alerts gated on NDVI over a Classification of a Stack', () => {
    it('is refused before anything is built where the Stack outputs red without nir, and started once nir is restored', async () => {
        state.catalogue = catalogue(['red'])

        await assert.rejects(lastValueFrom(exported()), /cannot run: UNAVAILABLE_GATE_INDEX$/)
        assert.deepEqual(state.built, [])
        assert.deepEqual(state.started, [])

        state.catalogue = catalogue(['red', 'nir'])

        assert.deepEqual(await lastValueFrom(exported()), {eeTaskId: 'T5'})
        assert.equal(state.started.length, 1)
    })
})

const alerts = {
    id: 'pyeo-1',
    type: 'PYEO_ALERTS',
    title: 'My alerts',
    model: {
        sources: {classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, changeFromClasses: [1], changeToClasses: [2]},
        options: {corrections: ['SR']},
        pyeoAlertsOptions: {minConsecutiveDetections: 2, indexGate: {index: 'ndvi', threshold: 0.2}}
    }
}

const exported = () => inEEContext(context, startImageDriveExport$(
    {image: {recipe: alerts, bands: {selection: ['total_changes']}, driveFolder: 'exports-1', scale: 30}},
    {sepalUser: ALICE}
))

// The Classification, trained on red alone, over a Stack mapping the asset's `bands` to outputs of the same names.
const catalogue = bands => ({
    [CLASSIFICATION]: {
        id: CLASSIFICATION,
        type: 'CLASSIFICATION',
        model: {
            inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: STACK, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red']}]}]},
            legend: {entries: [{value: 1}, {value: 2}]},
            trainingData: {dataSets: [{type: 'COLLECTED', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]},
            classifier: {type: 'RANDOM_FOREST'}
        }
    },
    [STACK]: {
        id: STACK,
        type: 'STACK',
        model: {
            inputImagery: {images: [{imageId: 's-1', type: 'ASSET', id: 'users/x/optical'}]},
            bandNames: {bandNames: [{imageId: 's-1', bands: bands.map(band => ({originalName: band, outputName: band}))}]}
        }
    }
})
