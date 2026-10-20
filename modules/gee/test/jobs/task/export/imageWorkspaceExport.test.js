import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

import {lastValueFrom, of, throwError} from 'rxjs'

// What an image export to the SEPAL workspace starts, per kind of user. Image construction, the destination and
// Earth Engine are substituted.

const state = {}

mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: () => ({
            getImage$: () => of({geometry: () => ({bounds: () => 'bounds'})}),
            getGeometry$: () => of({bounds: () => ({bounds: () => 'bounds'})})
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
const PARAMS = {image: {recipe: {type: 'MOSAIC', title: 'My mosaic'}, bands: {selection: ['red']}, filenamePrefix: 'prefix', scale: 30, workspacePath: 'x'}}
const context = type => ({requestId: 'r-1', username: 'alice', origin: 'task', auth: {type}, projectId: 'p', workloadTag: 't', endpoint: 'https://ee'})

beforeEach(() => {
    state.prepared = []
    state.started = []
    state.regionError = null
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
