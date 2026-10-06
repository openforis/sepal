import {jest} from '@jest/globals'
import {lastValueFrom, of} from 'rxjs'

// What an image export to Drive starts, as which user. Image construction, the Drive client and Earth Engine are
// substituted.

const state = {}

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({
    default: () => ({
        getImage$: () => of({cast: () => 'cast-image', bandNames: () => ({size: () => 1})}),
        getGeometry$: () => of({bounds: () => ({bounds: () => 'bounds'})})
    })
}))
jest.unstable_mockModule('#gee/config', () => ({sepalHost: 'sepal.test', googleProjectId: 'p', serviceAccountCredentials: {}}))
jest.unstable_mockModule('#gee/jobs/service/userStorageSerializer', () => ({
    userStorageSerializer$: (observable$, _id, username) => {
        state.serialized.push(username)
        return observable$
    }
}))
jest.unstable_mockModule('#gee/jobs/task/export/castToLargest', () => ({castToLargest: image => image}))
jest.unstable_mockModule('#gee/jobs/ee/batch/drive', () => ({
    drive: ({sepalUser}) => ({
        createFolder$: ({path}) => {
            state.folders.push({username: sepalUser.username, path})
            return of({id: 'folder-id'})
        }
    })
}))
jest.unstable_mockModule('#sepal/ee/ee', () => ({
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
}))

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

    expect(result).toEqual({eeTaskId: 'T5'})
    expect(state.folders).toEqual([{username: 'alice', path: 'SEPAL/exports/exports-1'}])
    expect(state.serialized).toEqual(['alice'])
    expect(state.started[0]).toMatchObject({folder: 'exports-1', fileNamePrefix: 'My mosaic', description: 'My mosaic'})
})

test('starts nothing for a user without a Google account', async () => {
    const result = await lastValueFrom(inEEContext(context({type: 'serviceAccount'}), startImageDriveExport$(params, {sepalUser: {username: 'alice'}})))

    expect(result).toEqual({eeTaskId: null})
    expect(state.started).toEqual([])
})
