import {jest} from '@jest/globals'
import {firstValueFrom, lastValueFrom, of, throwError} from 'rxjs'

import {NotFoundException} from '#sepal/exception'

// Where a task's exports go and how the container gets them back, as which user. Drive, Cloud Storage and the
// per-user serializer are substituted.

const state = {}

jest.unstable_mockModule('#gee/config', () => ({
    sepalHost: 'sepal.test',
    googleRegion: 'EUROPE-WEST2',
    googleProjectId: 'p',
    serviceAccountCredentials: {client_email: 'sa@p.iam.gserviceaccount.com'}
}))
jest.unstable_mockModule('#gee/jobs/service/userStorageSerializer', () => ({
    userStorageSerializer$: (observable$, _id, username) => {
        state.serialized.push(username)
        return observable$
    }
}))
jest.unstable_mockModule('#gee/jobs/ee/batch/drive', () => ({
    drive: ({sepalUser: {username}}) => ({
        createFolder$: ({path}) => {
            state.drive.created.push({username, path})
            return of({id: 'folder-id'})
        },
        listFiles$: ({path}) => {
            state.drive.listed.push({username, path})
            return of(state.drive.files[path])
        },
        removeFolder$: ({path}) => {
            if (!state.drive.folders.includes(path)) {
                return throwError(() => new NotFoundException(`Path not found: '${path}'`))
            }
            state.drive.removed.push({username, path})
            return of({})
        }
    })
}))
jest.unstable_mockModule('@google-cloud/storage', () => ({Storage: class {
    bucket(name) {
        return fakeBucket(name)
    }

    async createBucket(name, metadata) {
        state.gcs.created.push({name, metadata})
        if (state.gcs.createError) {
            throw state.gcs.createError
        }
        state.gcs.buckets.push(name)
        return [fakeBucket(name)]
    }
}}))

const {cleanupDestination$, listDownloads$, prepareDestination$} = await import('#gee/jobs/task/storage/destination')
const {userBucketName} = await import('#gee/jobs/task/storage/userBucket')

const HOUR = 60 * 60 * 1000
const ALICE = {username: 'alice', googleTokens: {accessToken: 'alice-token', accessTokenExpiryDate: 1234567890}}
const ALICE_BUCKET = userBucketName('alice')

beforeEach(() => {
    state.serialized = []
    state.drive = {created: [], listed: [], removed: [], files: {}, folders: []}
    state.gcs = {buckets: [], created: [], listed: [], deleted: [], signed: [], objects: {}, createError: null}
})

describe('preparing a destination', () => {
    test('a user with a Google account exports to a SEPAL folder in their Drive', async () => {
        const result = await lastValueFrom(prepareDestination$({folder: 'f1'}, {sepalUser: ALICE, auth: {type: 'user'}}))

        expect(result).toEqual({destination: {type: 'drive', folder: 'f1'}, exportTarget: {type: 'drive', folder: 'f1'}})
        expect(state.drive.created).toEqual([{username: 'alice', path: 'SEPAL/exports/f1'}])
        expect(state.serialized).toEqual(['alice'])
        expect(state.gcs.created).toEqual([])
    })

    test('a user without one exports to their own bucket, created on first use', async () => {
        const first = await lastValueFrom(prepareDestination$({folder: 'f1'}, {sepalUser: ALICE, auth: {type: 'serviceAccount'}}))
        const second = await lastValueFrom(prepareDestination$({folder: 'f2'}, {sepalUser: ALICE, auth: {type: 'serviceAccount'}}))

        expect(first).toEqual({
            destination: {type: 'gcs', prefix: 'f1/'},
            exportTarget: {type: 'gcs', bucket: ALICE_BUCKET, fileNamePrefix: 'f1/'}
        })
        expect(second.exportTarget).toEqual({type: 'gcs', bucket: ALICE_BUCKET, fileNamePrefix: 'f2/'})
        expect(state.gcs.created).toEqual([{
            name: ALICE_BUCKET,
            metadata: expect.objectContaining({
                location: 'EUROPE-WEST2',
                lifecycle: {rule: [{action: {type: 'Delete'}, condition: {age: 1}}]}
            })
        }])
        expect(state.serialized).toEqual(['alice', 'alice'])
        expect(state.drive.created).toEqual([])
    })

    test('a bucket created by a concurrent start is used as is', async () => {
        state.gcs.createError = Object.assign(new Error('Conflict'), {code: 409})

        const result = await lastValueFrom(prepareDestination$({folder: 'f1'}, {sepalUser: ALICE, auth: {type: 'serviceAccount'}}))

        expect(result.exportTarget.bucket).toBe(ALICE_BUCKET)
    })
})

describe('listing downloads', () => {
    test('a listing names only the requesting user\'s bucket, whatever prefix is asked', async () => {
        state.gcs.objects[ALICE_BUCKET] = [{name: 'bob/a.tif', metadata: {size: '7'}}]

        const result = await firstValueFrom(listDownloads$({type: 'gcs', bucket: userBucketName('bob'), prefix: 'bob/'}, {sepalUser: ALICE}))

        expect(state.gcs.listed).toEqual([{bucket: ALICE_BUCKET, prefix: 'bob/'}])
        expect(result.files).toEqual([
            {name: 'a.tif', size: 7, url: `https://signed/${ALICE_BUCKET}/bob/a.tif`, headers: {}}
        ])
    })

    test('a GCS listing signs each object for an hour of reading', async () => {
        state.gcs.objects[ALICE_BUCKET] = [
            {name: 'f1/a.tif', metadata: {size: '10'}},
            {name: 'f1/b.tif', metadata: {size: '20'}}
        ]
        const before = Date.now()

        const result = await firstValueFrom(listDownloads$({type: 'gcs', prefix: 'f1/'}, {sepalUser: ALICE}))

        const after = Date.now()
        expect(result.files.map(({name, size}) => ({name, size}))).toEqual(
            expect.arrayContaining([{name: 'a.tif', size: 10}, {name: 'b.tif', size: 20}])
        )
        expect(result.files).toHaveLength(2)
        expect(result.expiresAt).toBeGreaterThanOrEqual(before + HOUR)
        expect(result.expiresAt).toBeLessThanOrEqual(after + HOUR)
        expect(state.gcs.signed).toEqual([
            {version: 'v4', action: 'read', expires: result.expiresAt},
            {version: 'v4', action: 'read', expires: result.expiresAt}
        ])
    })

    test('a Drive listing gives each file\'s download URL and the user\'s own token', async () => {
        state.drive.files['SEPAL/exports/f1'] = [{id: 'x', name: 'a.tif', size: '10'}]

        const result = await firstValueFrom(listDownloads$({type: 'drive', folder: 'f1'}, {sepalUser: ALICE}))

        expect(result).toEqual({
            files: [{
                name: 'a.tif',
                size: 10,
                url: 'https://www.googleapis.com/drive/v3/files/x?alt=media',
                headers: {Authorization: 'Bearer alice-token'}
            }],
            expiresAt: ALICE.googleTokens.accessTokenExpiryDate
        })
        expect(state.drive.listed).toEqual([{username: 'alice', path: 'SEPAL/exports/f1'}])
    })

    test.each([
        ['empty', ''],
        ['not a folder', 'f1'],
        ['outside the bucket\'s folders', '../f1/'],
        ['missing', undefined]
    ])('a GCS prefix that is %s is refused', async (_description, prefix) => {
        state.gcs.objects[ALICE_BUCKET] = [{name: 'f1/a.tif', metadata: {size: '10'}}]

        await expect(firstValueFrom(listDownloads$({type: 'gcs', prefix}, {sepalUser: ALICE}))).rejects.toMatchObject({statusCode: 400})
        await expect(firstValueFrom(cleanupDestination$({type: 'gcs', prefix}, {sepalUser: ALICE}))).rejects.toMatchObject({statusCode: 400})

        expect(state.gcs.listed).toEqual([])
        expect(state.gcs.deleted).toEqual([])
    })
})

describe('cleaning up', () => {
    test('cleaning up removes the Drive folder, or every object under the prefix in the user\'s bucket', async () => {
        state.drive.folders = ['SEPAL/exports/f1']

        const driveResult = await lastValueFrom(cleanupDestination$({type: 'drive', folder: 'f1'}, {sepalUser: ALICE}))
        const gcsResult = await lastValueFrom(cleanupDestination$({type: 'gcs', prefix: 'f2/'}, {sepalUser: ALICE}))

        expect(driveResult).toEqual({})
        expect(gcsResult).toEqual({})
        expect(state.drive.removed).toEqual([{username: 'alice', path: 'SEPAL/exports/f1'}])
        expect(state.gcs.deleted).toEqual([{bucket: ALICE_BUCKET, prefix: 'f2/'}])
    })

    test('a Drive folder already gone is a successful cleanup', async () => {
        const result = await lastValueFrom(cleanupDestination$({type: 'drive', folder: 'f1'}, {sepalUser: ALICE}))

        expect(result).toEqual({})
    })
})

const fakeBucket = name => ({
    exists: async () => [state.gcs.buckets.includes(name)],
    getFiles: async ({prefix}) => {
        state.gcs.listed.push({bucket: name, prefix})
        return [(state.gcs.objects[name] || []).filter(object => object.name.startsWith(prefix)).map(object => fakeFile(name, object))]
    },
    deleteFiles: async ({prefix}) => {
        state.gcs.deleted.push({bucket: name, prefix})
    }
})

const fakeFile = (bucket, {name, metadata}) => ({
    name,
    metadata,
    getSignedUrl: async config => {
        state.gcs.signed.push(config)
        return [`https://signed/${bucket}/${name}`]
    }
})
