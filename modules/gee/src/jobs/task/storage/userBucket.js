import crypto from 'node:crypto'

import {Storage} from '@google-cloud/storage'
import {defer, from, map, of, switchMap} from 'rxjs'

import * as config from '#gee/config'
import {ServerException} from '#sepal/exception'

const ALREADY_EXISTS = 409

export const storage = () => new Storage({credentials: config.serviceAccountCredentials, projectId: config.googleProjectId})

export const userBucketName = username =>
    `sepal-exports-${crypto.createHash('sha256').update(`${config.sepalHost}/${username}`).digest('hex').substring(0, 24)}`

// Bucket names are global and these are predictable: a bucket of the name is the user's only when it is in
// SEPAL's own project. Emits the name, or null when SEPAL has no such bucket.
export const findUserBucket$ = username =>
    defer(() => ownBucket$(userBucketName(username)))

// Owned by the service account, which writes the exports; the objects expire after a day whatever happens.
export const ensureUserBucket$ = username =>
    findUserBucket$(username).pipe(
        switchMap(bucketName => bucketName ? of(bucketName) : create$(userBucketName(username)))
    )

const create$ = bucketName =>
    from(storage().createBucket(bucketName, {
        location: config.googleRegion,
        storageClass: 'STANDARD',
        iamConfiguration: {uniformBucketLevelAccess: {enabled: true}},
        labels: {type: 'user'},
        lifecycle: {rule: [{action: {type: 'Delete'}, condition: {age: 1}}]}
    }).catch(error => {
        if (error.code !== ALREADY_EXISTS) {
            throw error
        }
    })).pipe(
        switchMap(() => ownBucket$(bucketName)),
        map(ownBucketName => {
            if (!ownBucketName) {
                throw new ServerException(`Export bucket name ${bucketName} is taken by another project`)
            }
            return ownBucketName
        })
    )

// Lists the buckets of the client's own project only.
const ownBucket$ = bucketName =>
    from(storage().getBuckets({prefix: bucketName})).pipe(
        map(([buckets]) => buckets.some(({name}) => name === bucketName) ? bucketName : null)
    )
