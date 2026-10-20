import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

import {lastValueFrom, of} from 'rxjs'

// What a FeatureCollection export to an asset or to the SEPAL workspace starts, per kind of user. Destination
// and Earth Engine are substituted.

const state = {}

mock.module('#gee/jobs/task/storage/destination', {
    exports: {
        exportFolderName: text => text.replaceAll('/', '_'),

        prepareDestination$: ({folder}, {auth}) => of(auth.type === 'user'
            ? {destination: {type: 'drive', folder}, exportTarget: {type: 'drive', folder}}
            : {destination: {type: 'gcs', prefix: `${folder}/`}, exportTarget: {type: 'gcs', bucket: 'alice-bucket', fileNamePrefix: `${folder}/`}}
        )
    }
})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            data: {ExportDestination: {ASSET: 'ASSET', DRIVE: 'DRIVE', GCS: 'GCS'}, ExportType: {TABLE: 'TABLE'}},
            batch: {
                Export: {convertToServerParams: (config, destination, type) => ({config, destination, type})},
                ExportTask: {create: config => config}
            },
            createParentFolder$: assetId => {
                state.calls.push(['createParentFolder', assetId])
                return of(true)
            },
            deleteAssetRecursive$: (assetId, options) => {
                state.calls.push(['delete', assetId, options])
                return of(true)
            },
            startTableExport$: (task, description) => {
                state.calls.push(['start', description])
                state.started.push(task)
                return of('T7')
            }
        }
    }
})

const {inEEContext} = await import('#sepal/ee/eeContext')
const {startTableToAssetExport$} = await import('#gee/jobs/task/export/toAsset')
const {startTableToWorkspaceExport$} = await import('#gee/jobs/task/export/toWorkspace')

const ALICE = {username: 'alice'}
const ASSET = 'projects/p/assets/design'
const COLLECTION = {collection: true}
const context = type => ({requestId: 'r-1', username: 'alice', origin: 'task', auth: {type}, projectId: 'p', workloadTag: 't', endpoint: 'https://ee'})
const toAsset = (type, params = {}) =>
    lastValueFrom(inEEContext(context(type), startTableToAssetExport$({collection: COLLECTION, description: 'design', assetId: ASSET, strategy: 'resume', ...params})))
const toWorkspace = (type, params = {}) =>
    lastValueFrom(inEEContext(context(type), startTableToWorkspaceExport$({collection: COLLECTION, description: 'design', fileFormat: 'GeoJSON', ...params}, {sepalUser: ALICE})))

beforeEach(() => {
    state.calls = []
    state.started = []
})

test('a table export to an asset creates the parent folder, then starts the export', async () => {
    const result = await toAsset('user')

    assert.deepEqual(result, {eeTaskId: 'T7'})
    assert.deepEqual(state.calls.map(([name]) => name), ['createParentFolder', 'start'])
    assert.partialDeepStrictEqual(
        state.started[0],
        {destination: 'ASSET', type: 'TABLE', config: {collection: COLLECTION, description: 'design', assetId: ASSET}}
    )
})

test('replacing deletes the existing asset first, tables included', async () => {
    await toAsset('user', {strategy: 'replace'})

    assert.deepEqual(
        state.calls.map(([name]) => name),
        ['createParentFolder', 'delete', 'start']
    )
    const [, , {include}] = state.calls[1]
    assert.ok(include.includes('Table'))
    assert.deepEqual(state.calls[1], ['delete', ASSET, {include}])
})

test('a user without a Google account cannot export a table to an asset', async () => {
    await assert.rejects(
        toAsset('serviceAccount'),
        /Cannot export to asset using service account\./
    )

    assert.deepEqual(state.calls, [])
})

test('a table export to the workspace goes to the user\'s Drive folder under the prefix', async () => {
    const result = await toWorkspace('user', {filenamePrefix: 'prefix'})

    const {folder} = result.destination
    assert.match(folder, /^design_\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2}\.\d{3}$/)
    assert.deepEqual(result, {eeTaskId: 'T7', destination: {type: 'drive', folder}})
    assert.partialDeepStrictEqual(
        state.started[0],
        {destination: 'DRIVE', type: 'TABLE', config: {folder: result.destination.folder, fileNamePrefix: 'prefix'}}
    )
})

test('a user without a Google account exports the table to their bucket', async () => {
    const result = await toWorkspace('serviceAccount', {filenamePrefix: 'prefix'})

    const {prefix} = result.destination
    assert.match(prefix, /^design_.*\/$/)
    assert.deepEqual(result.destination, {type: 'gcs', prefix})
    assert.partialDeepStrictEqual(
        state.started[0],
        {destination: 'GCS', config: {bucket: 'alice-bucket', fileNamePrefix: `${result.destination.prefix}prefix`}}
    )
})

test('the file prefix defaults to the description', async () => {
    await toWorkspace('user')

    assert.equal(state.started[0].config.fileNamePrefix, 'design')
})

test('an unsupported file format falls back to CSV', async () => {
    await toWorkspace('user', {fileFormat: 'XLSX'})

    assert.equal(state.started[0].config.fileFormat, 'CSV')
})

test('CSV keeps the sample geometry when columns are selected', async () => {
    await toWorkspace('user', {fileFormat: 'CSV', selectors: ['a', 'b']})

    assert.deepEqual(state.started[0].config.selectors, ['a', 'b', '.geo'])
})

test('geometry formats keep the given selectors', async () => {
    await toWorkspace('user', {fileFormat: 'GeoJSON', selectors: ['a', 'b']})

    assert.deepEqual(state.started[0].config.selectors, ['a', 'b'])
})
