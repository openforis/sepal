import {jest} from '@jest/globals'
import {lastValueFrom, of} from 'rxjs'

// What an image export to the SEPAL workspace starts, per kind of user. Image construction, the destination and
// Earth Engine are substituted.

const state = {}

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({
    default: () => ({
        getImage$: () => of({geometry: () => ({bounds: () => 'bounds'})}),
        getGeometry$: () => of({bounds: () => ({bounds: () => 'bounds'})})
    })
}))
jest.unstable_mockModule('#gee/jobs/task/export/castToLargest', () => ({castToLargest: image => image}))
jest.unstable_mockModule('#gee/jobs/task/storage/destination', () => ({
    exportFolderName: text => text,
    prepareDestination$: ({folder}, {auth}) => {
        state.prepared.push(folder)
        return of(auth.type === 'user'
            ? {destination: {type: 'drive', folder}, exportTarget: {type: 'drive', folder}}
            : {destination: {type: 'gcs', prefix: `${folder}/`}, exportTarget: {type: 'gcs', bucket: 'alice-bucket', fileNamePrefix: `${folder}/`}}
        )
    }
}))
jest.unstable_mockModule('#sepal/ee/ee', () => ({
    default: {
        data: {ExportDestination: {DRIVE: 'DRIVE', GCS: 'GCS'}, ExportType: {IMAGE: 'IMAGE'}},
        batch: {
            Export: {convertToServerParams: (config, destination, type) => ({config, destination, type})},
            ExportTask: {create: config => config}
        },
        Geometry: geometry => geometry,
        getInfo$: value => of(value),
        startImageExport$: task => {
            state.started.push(task)
            return of('T9')
        }
    }
}))

const {inEEContext} = await import('#sepal/ee/eeContext')
const {startImageWorkspaceExport$} = await import('#gee/jobs/task/export/imageWorkspaceExport')

const ALICE = {username: 'alice'}
const PARAMS = {image: {recipe: {type: 'MOSAIC', title: 'My mosaic'}, bands: {selection: ['red']}, filenamePrefix: 'prefix', scale: 30, workspacePath: 'x'}}
const context = type => ({requestId: 'r-1', username: 'alice', origin: 'task', auth: {type}, projectId: 'p', workloadTag: 't', endpoint: 'https://ee'})

beforeEach(() => {
    state.prepared = []
    state.started = []
})

test('a user with a Google account exports to a Drive folder named for the export', async () => {
    const result = await lastValueFrom(inEEContext(context('user'), startImageWorkspaceExport$(PARAMS, {sepalUser: ALICE})))

    expect(result).toEqual({eeTaskId: 'T9', destination: {type: 'drive', folder: expect.stringMatching(/^My mosaic_\d{4}-\d{2}-\d{2}_/)}})
    expect(state.started[0]).toMatchObject({destination: 'DRIVE', config: {fileNamePrefix: 'prefix', folder: result.destination.folder}})
})

test('a user without one exports to their bucket, under the export\'s folder', async () => {
    const result = await lastValueFrom(inEEContext(context('serviceAccount'), startImageWorkspaceExport$(PARAMS, {sepalUser: ALICE})))

    expect(result.destination).toEqual({type: 'gcs', prefix: expect.stringMatching(/\/$/)})
    expect(state.started[0]).toMatchObject({destination: 'GCS', config: {bucket: 'alice-bucket', fileNamePrefix: `${result.destination.prefix}prefix`}})
})
