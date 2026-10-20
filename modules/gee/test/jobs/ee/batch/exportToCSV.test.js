import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

import {defer, finalize, lastValueFrom, of} from 'rxjs'

// A batch CSV export through the user's Drive. Drive, the Earth Engine export and the per-user serializer are
// substituted.

const state = {}

mock.module('#gee/jobs/service/userStorageSerializer', {
    exports: {
        userStorageSerializer$: (observable$, _id, username) => defer(() => {
            state.serializing = username
            return observable$.pipe(finalize(() => state.serializing = null))
        })
    }
})
mock.module('#gee/jobs/ee/batch/drive', {
    exports: {
        drive: ({sepalUser: {username}}) => ({
            createFolder$: ({path}) => defer(() => {
                state.created.push({username, path, serializedFor: state.serializing})
                return of({id: 'folder-id'})
            }),
            readFile$: () => of({groups: []}),
            removeFolder$: () => of({})
        })
    }
})
mock.module('#gee/jobs/ee/batch/exportTask', {
    exports: {
        exportTableToDrive$: () => of('T')
    }
})

const {exportToCSV$} = await import('#gee/jobs/ee/batch/exportToCSV')

beforeEach(() => {
    state.created = []
    state.serializing = null
})

test('the export folder is created in Drive one at a time per user', async () => {
    await lastValueFrom(exportToCSV$({collection: {}, description: 'area-per-stratum', selectors: ['groups'], sepalUser: {username: 'alice'}}))

    const [{path}] = state.created
    assert.match(path, /^SEPAL\/export\/area-per-stratum_/)
    assert.deepEqual(state.created, [{username: 'alice', path, serializedFor: 'alice'}])
})
