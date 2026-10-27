import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

// The asset write endpoints act with the rights of whoever makes the request. A user without a Google account would
// act as the SEPAL service account, on SEPAL's own assets, so their writes are refused before reaching Earth Engine.

const calls = []

const record = call => {
    calls.push(call)
    return of(undefined)
}

const ee = {
    deleteAssetRecursive$: id => record({operation: 'delete', id}),
    renameAsset$: (sourceId, destinationId) => record({operation: 'rename', sourceId, destinationId}),
    createFolder$: id => record({operation: 'createFolder', id})
}

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: ee}))
jest.unstable_mockModule('#gee/jobs/job', () => ({job: config => config}))

const {default: deleteAsset} = await import('#gee/jobs/ee/asset/delete')
const {default: renameAsset} = await import('#gee/jobs/ee/asset/rename')
const {default: createFolder} = await import('#gee/jobs/ee/asset/createFolder')

const USER = {sepalUser: {username: 'alice', googleTokens: {accessToken: 'token'}}}
const NO_GOOGLE_ACCOUNT = {sepalUser: {username: 'alice'}}

beforeEach(() => {
    calls.length = 0
})

describe.each([
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
])('$name', ({job, requestArgs, expected}) => {
    it('is made in Earth Engine for a user with a Google account', async () => {
        await firstValueFrom(job.worker$({requestArgs, credentials: USER}))

        expect(calls).toEqual([expected])
    })

    it('is refused for a user without a Google account, and nothing is written', () => {
        expect(() => job.worker$({requestArgs, credentials: NO_GOOGLE_ACCOUNT})).toThrow('Requires a connected Google Account')

        expect(calls).toEqual([])
    })
})
