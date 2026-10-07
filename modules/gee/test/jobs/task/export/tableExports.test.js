import {jest} from '@jest/globals'
import {lastValueFrom, of} from 'rxjs'

// What a FeatureCollection export to an asset or to the SEPAL workspace starts, per kind of user. Destination
// and Earth Engine are substituted.

const state = {}

jest.unstable_mockModule('#gee/jobs/task/storage/destination', () => ({
    exportFolderName: text => text.replaceAll('/', '_'),
    prepareDestination$: ({folder}, {auth}) => of(auth.type === 'user'
        ? {destination: {type: 'drive', folder}, exportTarget: {type: 'drive', folder}}
        : {destination: {type: 'gcs', prefix: `${folder}/`}, exportTarget: {type: 'gcs', bucket: 'alice-bucket', fileNamePrefix: `${folder}/`}}
    )
}))
jest.unstable_mockModule('#sepal/ee/ee', () => ({
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
}))

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

    expect(result).toEqual({eeTaskId: 'T7'})
    expect(state.calls.map(([name]) => name)).toEqual(['createParentFolder', 'start'])
    expect(state.started[0]).toMatchObject({destination: 'ASSET', type: 'TABLE', config: {collection: COLLECTION, description: 'design', assetId: ASSET}})
})

test('replacing deletes the existing asset first, tables included', async () => {
    await toAsset('user', {strategy: 'replace'})

    expect(state.calls.map(([name]) => name)).toEqual(['createParentFolder', 'delete', 'start'])
    expect(state.calls[1]).toEqual(['delete', ASSET, {include: expect.arrayContaining(['Table'])}])
})

test('a user without a Google account cannot export a table to an asset', async () => {
    await expect(toAsset('serviceAccount')).rejects.toThrow('Cannot export to asset using service account.')

    expect(state.calls).toEqual([])
})

test('a table export to the workspace goes to the user\'s Drive folder under the prefix', async () => {
    const result = await toWorkspace('user', {filenamePrefix: 'prefix'})

    expect(result).toEqual({eeTaskId: 'T7', destination: {type: 'drive', folder: expect.stringMatching(/^design_\d{4}-\d{2}-\d{2}_\d{2}:\d{2}:\d{2}\.\d{3}$/)}})
    expect(state.started[0]).toMatchObject({destination: 'DRIVE', type: 'TABLE', config: {folder: result.destination.folder, fileNamePrefix: 'prefix'}})
})

test('a user without a Google account exports the table to their bucket', async () => {
    const result = await toWorkspace('serviceAccount', {filenamePrefix: 'prefix'})

    expect(result.destination).toEqual({type: 'gcs', prefix: expect.stringMatching(/^design_.*\/$/)})
    expect(state.started[0]).toMatchObject({destination: 'GCS', config: {bucket: 'alice-bucket', fileNamePrefix: `${result.destination.prefix}prefix`}})
})

test('the file prefix defaults to the description', async () => {
    await toWorkspace('user')

    expect(state.started[0].config.fileNamePrefix).toBe('design')
})

test('an unsupported file format falls back to CSV', async () => {
    await toWorkspace('user', {fileFormat: 'XLSX'})

    expect(state.started[0].config.fileFormat).toBe('CSV')
})

test('CSV keeps the sample geometry when columns are selected', async () => {
    await toWorkspace('user', {fileFormat: 'CSV', selectors: ['a', 'b']})

    expect(state.started[0].config.selectors).toEqual(['a', 'b', '.geo'])
})

test('geometry formats keep the given selectors', async () => {
    await toWorkspace('user', {fileFormat: 'GeoJSON', selectors: ['a', 'b']})

    expect(state.started[0].config.selectors).toEqual(['a', 'b'])
})
