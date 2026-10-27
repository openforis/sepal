import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, mock, test} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

import ee from '#sepal/ee/ee'
import {inEEContext} from '#sepal/ee/eeContext'

// The asset write endpoints act with the rights of whoever makes the request. A user without a Google account would
// act as the SEPAL service account, on SEPAL's own assets, so their writes are refused before reaching Earth Engine.

mock.module('#gee/jobs/job', {exports: {job: config => config}})

const {default: deleteAsset} = await import('#gee/jobs/ee/asset/delete')
const {default: renameAsset} = await import('#gee/jobs/ee/asset/rename')
const {default: createFolder} = await import('#gee/jobs/ee/asset/createFolder')

const USER = {requestId: 'r-1', username: 'alice', origin: 'interactive', auth: {type: 'user'}, projectId: 'p', endpoint: 'https://ee'}
const SERVICE_ACCOUNT = {...USER, auth: {type: 'serviceAccount'}}

const calls = []

beforeEach(() => {
    calls.length = 0
    mock.method(ee, 'deleteAssetRecursive$', id => record({operation: 'delete', id}))
    mock.method(ee, 'renameAsset$', (sourceId, destinationId) => record({operation: 'rename', sourceId, destinationId}))
    mock.method(ee, 'createFolder$', id => record({operation: 'createFolder', id}))
})

afterEach(() => mock.restoreAll())

const WRITES = [
    {
        name: 'deleting an asset',
        job: deleteAsset,
        requestArgs: {id: 'projects/p/assets/a'},
        expected: {operation: 'delete', id: 'projects/p/assets/a'}
    },
    {
        name: 'renaming an asset',
        job: renameAsset,
        requestArgs: {sourceId: 'projects/p/assets/a', destinationId: 'projects/p/assets/b'},
        expected: {operation: 'rename', sourceId: 'projects/p/assets/a', destinationId: 'projects/p/assets/b'}
    },
    {
        name: 'creating a folder',
        job: createFolder,
        requestArgs: {id: 'projects/p/assets/f'},
        expected: {operation: 'createFolder', id: 'projects/p/assets/f'}
    }
]

for (const {name, job, requestArgs, expected} of WRITES) {
    describe(name, () => {
        test('is made in Earth Engine for a user with a Google account', async () => {
            await run(job, requestArgs, USER)

            assert.deepEqual(calls, [expected])
        })

        test('is refused for a user without a Google account, and nothing is written', async () => {
            await assert.rejects(run(job, requestArgs, SERVICE_ACCOUNT), /service account/)

            assert.deepEqual(calls, [])
        })
    })
}

const run = (job, requestArgs, context) =>
    firstValueFrom(inEEContext(context, job.worker$({requestArgs})))

const record = call => {
    calls.push(call)
    return of(undefined)
}
