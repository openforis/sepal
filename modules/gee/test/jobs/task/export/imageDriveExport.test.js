import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

import {lastValueFrom, of} from 'rxjs'

// What an image export to Drive starts, as which user. Image construction, the Drive client and Earth Engine are
// substituted.

const state = {}

mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: () => ({
            getImage$: () => of({cast: () => 'cast-image', bandNames: () => ({size: () => 1})}),
            getGeometry$: () => of({bounds: () => ({bounds: () => 'bounds'})})
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
const params = {image: {recipe: {type: 'MOSAIC', title: 'My mosaic'}, bands: {selection: ['red']}, driveFolder: 'exports-1', scale: 30}}

beforeEach(() => {
    state.folders = []
    state.serialized = []
    state.started = []
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
