import {jest} from '@jest/globals'
import {firstValueFrom, lastValueFrom, of, throwError} from 'rxjs'

import {NotFoundException} from '#sepal/exception'

// Where a task's exports go and how the container gets them back, as which user. Drive, Cloud Storage and the
// per-user serializer are substituted. Cloud Storage holds the buckets of SEPAL's own project and those of
// other projects, whose names are just as taken.

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

    async getBuckets({prefix}) {
        return [state.gcs.buckets.filter(name => name.startsWith(prefix)).map(name => fakeBucket(name))]
    }

    async createBucket(name, metadata) {
        state.gcs.created.push({name, metadata})
        if (state.gcs.buckets.includes(name) || state.gcs.otherProjectBuckets.includes(name)) {
            throw Object.assign(new Error('Conflict'), {code: 409})
        }
        state.gcs.buckets.push(name)
        return [fakeBucket(name)]
    }
}}))

const {cleanupDestination$, listDownloads$, prepareDestination$} = await import('#gee/jobs/task/storage/destination')
const {userBucketName} = await import('#gee/jobs/task/storage/userBucket')

const HOUR = 60 * 60 * 1000
const ALICE = {username: 'alice', googleTokens: {accessToken: 'alice-token', accessTokenExpiryDate: 1234567890}}
const ALICE_WITHOUT_GOOGLE = {username: 'alice'}
const ALICE_BUCKET = userBucketName('alice')
const UNSAFE_FOLDERS = [['empty', ''], ['missing', undefined], ['nested', 'a/b'], ['with a backslash', 'a\\b'],
    ['with a quote', 'a"b'], ['the current folder', '.'], ['the parent folder', '..']]

beforeEach(() => {
    state.serialized = []
    state.drive = {created: [], listed: [], removed: [], files: {}, folders: []}
    state.gcs = {buckets: [], otherProjectBuckets: [], created: [], listed: [], deleted: [], signed: [], objects: {}}
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
        const first = await lastValueFrom(prepareDestination$({folder: 'f1'}, {sepalUser: ALICE_WITHOUT_GOOGLE, auth: {type: 'serviceAccount'}}))
        const second = await lastValueFrom(prepareDestination$({folder: 'f2'}, {sepalUser: ALICE_WITHOUT_GOOGLE, auth: {type: 'serviceAccount'}}))

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

    test('a bucket of the user\'s name in another project is refused', async () => {
        state.gcs.otherProjectBuckets = [ALICE_BUCKET]

        await expect(lastValueFrom(prepareDestination$({folder: 'f1'}, {sepalUser: ALICE_WITHOUT_GOOGLE, auth: {type: 'serviceAccount'}})))
            .rejects.toThrow(`Export bucket name ${ALICE_BUCKET} is taken by another project`)
    })

    test.each(UNSAFE_FOLDERS)('a folder that is %s is refused', async (_description, folder) => {
        await expect(lastValueFrom(prepareDestination$({folder}, {sepalUser: ALICE, auth: {type: 'user'}}))).rejects.toMatchObject({statusCode: 400})
        await expect(lastValueFrom(prepareDestination$({folder}, {sepalUser: ALICE_WITHOUT_GOOGLE, auth: {type: 'serviceAccount'}}))).rejects.toMatchObject({statusCode: 400})

        expect(state.drive.created).toEqual([])
        expect(state.gcs.created).toEqual([])
    })

    test('a request without a user is refused', async () => {
        await expect(lastValueFrom(prepareDestination$({folder: 'f1'}, {sepalUser: {}, auth: {type: 'serviceAccount'}}))).rejects.toMatchObject({statusCode: 400})

        expect(state.gcs.created).toEqual([])
    })
})

describe('listing downloads', () => {
    test('a listing names only the requesting user\'s bucket, whatever bucket or prefix is asked', async () => {
        state.gcs.buckets = [ALICE_BUCKET, userBucketName('bob')]
        state.gcs.objects[ALICE_BUCKET] = [{name: 'bob/a.tif', metadata: {size: '7'}}]

        const result = await firstValueFrom(listDownloads$({type: 'gcs', bucket: userBucketName('bob'), prefix: 'bob/'}, {sepalUser: ALICE}))

        expect(state.gcs.listed).toEqual([{bucket: ALICE_BUCKET, prefix: 'bob/'}])
        expect(result.files).toEqual([
            {name: 'a.tif', size: 7, url: `https://signed/${ALICE_BUCKET}/bob/a.tif`, headers: {}}
        ])
    })

    test('a GCS listing signs each object for an hour of reading', async () => {
        state.gcs.buckets = [ALICE_BUCKET]
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

    test('a GCS listing is refused when the user\'s bucket is not one of SEPAL\'s', async () => {
        state.gcs.otherProjectBuckets = [ALICE_BUCKET]
        state.gcs.objects[ALICE_BUCKET] = [{name: 'f1/a.tif', metadata: {size: '10'}}]

        await expect(firstValueFrom(listDownloads$({type: 'gcs', prefix: 'f1/'}, {sepalUser: ALICE}))).rejects.toMatchObject({statusCode: 404})

        expect(state.gcs.listed).toEqual([])
        expect(state.gcs.signed).toEqual([])
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

    test('a Drive listing for a user without Google tokens is refused', async () => {
        await expect(firstValueFrom(listDownloads$({type: 'drive', folder: 'f1'}, {sepalUser: ALICE_WITHOUT_GOOGLE})))
            .rejects.toMatchObject({statusCode: 400, errorCode: 'MISSING_GOOGLE_TOKENS'})

        expect(state.drive.listed).toEqual([])
    })

    test.each(UNSAFE_FOLDERS)('a Drive folder that is %s is refused', async (_description, folder) => {
        await expect(firstValueFrom(listDownloads$({type: 'drive', folder}, {sepalUser: ALICE}))).rejects.toMatchObject({statusCode: 400})

        expect(state.drive.listed).toEqual([])
    })

    test.each([
        ['empty', ''],
        ['not a folder', 'f1'],
        ['outside the bucket\'s folders', '../f1/'],
        ['missing', undefined]
    ])('a GCS prefix that is %s is refused', async (_description, prefix) => {
        state.gcs.buckets = [ALICE_BUCKET]
        state.gcs.objects[ALICE_BUCKET] = [{name: 'f1/a.tif', metadata: {size: '10'}}]

        await expect(firstValueFrom(listDownloads$({type: 'gcs', prefix}, {sepalUser: ALICE}))).rejects.toMatchObject({statusCode: 400})
        await expect(firstValueFrom(cleanupDestination$({type: 'gcs', prefix}, {sepalUser: ALICE}))).rejects.toMatchObject({statusCode: 400})

        expect(state.gcs.listed).toEqual([])
        expect(state.gcs.deleted).toEqual([])
    })

    test.each([
        ['no destination', undefined, ALICE],
        ['an unknown kind of destination', {type: 'asset', prefix: 'f1/'}, ALICE],
        ['no user', {type: 'gcs', prefix: 'f1/'}, {}]
    ])('a request with %s is refused', async (_description, destination, sepalUser) => {
        state.gcs.buckets = [ALICE_BUCKET]
        state.drive.folders = ['SEPAL/exports/f1']

        await expect(firstValueFrom(listDownloads$(destination, {sepalUser}))).rejects.toMatchObject({statusCode: 400})
        await expect(firstValueFrom(cleanupDestination$(destination, {sepalUser}))).rejects.toMatchObject({statusCode: 400})

        expect(state.gcs.listed).toEqual([])
        expect(state.gcs.deleted).toEqual([])
        expect(state.drive.listed).toEqual([])
        expect(state.drive.removed).toEqual([])
    })
})

describe('cleaning up', () => {
    test('cleaning up removes the Drive folder, or every object under the prefix in the user\'s bucket', async () => {
        state.drive.folders = ['SEPAL/exports/f1']
        state.gcs.buckets = [ALICE_BUCKET]

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

    test('a user with no bucket of SEPAL\'s has nothing to clean up', async () => {
        state.gcs.otherProjectBuckets = [ALICE_BUCKET]

        const result = await lastValueFrom(cleanupDestination$({type: 'gcs', prefix: 'f1/'}, {sepalUser: ALICE}))

        expect(result).toEqual({})
        expect(state.gcs.deleted).toEqual([])
    })

    test.each(UNSAFE_FOLDERS)('a Drive folder that is %s is never removed', async (_description, folder) => {
        state.drive.folders = ['SEPAL/exports/', 'SEPAL/exports/undefined', 'SEPAL/exports/a/b', 'SEPAL/exports/..']

        await expect(lastValueFrom(cleanupDestination$({type: 'drive', folder}, {sepalUser: ALICE}))).rejects.toMatchObject({statusCode: 400})

        expect(state.drive.removed).toEqual([])
    })

    test('a Drive cleanup for a user without Google tokens is refused', async () => {
        state.drive.folders = ['SEPAL/exports/f1']

        await expect(lastValueFrom(cleanupDestination$({type: 'drive', folder: 'f1'}, {sepalUser: ALICE_WITHOUT_GOOGLE})))
            .rejects.toMatchObject({statusCode: 400, errorCode: 'MISSING_GOOGLE_TOKENS'})

        expect(state.drive.removed).toEqual([])
    })
})

const fakeBucket = name => ({
    name,
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
