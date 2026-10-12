import {jest} from '@jest/globals'
import {lastValueFrom, of, throwError} from 'rxjs'

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
    exportFolderName: text => text.replaceAll('/', '_'),
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
        getInfo$: value => state.regionError ? throwError(() => state.regionError) : of(value),
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
    state.regionError = null
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

test('the folder named for a title with a slash is the same sanitised folder in the destination and the export', async () => {
    const params = {image: {...PARAMS.image, recipe: {...PARAMS.image.recipe, title: 'North/South'}}}

    const result = await lastValueFrom(inEEContext(context('user'), startImageWorkspaceExport$(params, {sepalUser: ALICE})))

    expect(result.destination.folder).toMatch(/^North_South_\d{4}-\d{2}-\d{2}_/)
    expect(state.prepared).toEqual([result.destination.folder])
    expect(state.started[0].config.folder).toBe(result.destination.folder)
})

test('a region that cannot be resolved fails the start before any destination is prepared', async () => {
    state.regionError = new Error('Too many pixels')

    await expect(lastValueFrom(inEEContext(context('user'), startImageWorkspaceExport$(PARAMS, {sepalUser: ALICE})))).rejects.toThrow('Too many pixels')

    expect(state.prepared).toEqual([])
    expect(state.started).toEqual([])
})
