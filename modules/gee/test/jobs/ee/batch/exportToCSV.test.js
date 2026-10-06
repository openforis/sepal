import {jest} from '@jest/globals'
import {defer, finalize, lastValueFrom, of} from 'rxjs'

// A batch CSV export through the user's Drive. Drive, the Earth Engine export and the per-user serializer are
// substituted.

const state = {}

jest.unstable_mockModule('#gee/jobs/service/userStorageSerializer', () => ({
    userStorageSerializer$: (observable$, _id, username) => defer(() => {
        state.serializing = username
        return observable$.pipe(finalize(() => state.serializing = null))
    })
}))
jest.unstable_mockModule('#gee/jobs/ee/batch/drive', () => ({
    drive: ({sepalUser: {username}}) => ({
        createFolder$: ({path}) => defer(() => {
            state.created.push({username, path, serializedFor: state.serializing})
            return of({id: 'folder-id'})
        }),
        readFile$: () => of({groups: []}),
        removeFolder$: () => of({})
    })
}))
jest.unstable_mockModule('#gee/jobs/ee/batch/exportTask', () => ({
    exportTableToDrive$: () => of('T')
}))

const {exportToCSV$} = await import('#gee/jobs/ee/batch/exportToCSV')

beforeEach(() => {
    state.created = []
    state.serializing = null
})

test('the export folder is created in Drive one at a time per user', async () => {
    await lastValueFrom(exportToCSV$({collection: {}, description: 'area-per-stratum', selectors: ['groups'], sepalUser: {username: 'alice'}}))

    expect(state.created).toEqual([{
        username: 'alice',
        path: expect.stringMatching(/^SEPAL\/export\/area-per-stratum_/),
        serializedFor: 'alice'
    }])
})
