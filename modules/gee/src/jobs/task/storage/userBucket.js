import {Storage} from '@google-cloud/storage'
import crypto from 'crypto'
import {defer, from, map, of, switchMap} from 'rxjs'

import * as config from '#gee/config'

const ALREADY_EXISTS = 409

export const storage = () => new Storage({credentials: config.serviceAccountCredentials, projectId: config.googleProjectId})

export const userBucketName = username =>
    `sepal-exports-${crypto.createHash('sha256').update(`${config.sepalHost}/${username}`).digest('hex').substring(0, 24)}`

// Owned by the service account, which writes the exports; the objects expire after a day whatever happens.
export const ensureUserBucket$ = username => defer(() => {
    const bucketName = userBucketName(username)
    return from(storage().bucket(bucketName).exists()).pipe(
        switchMap(([exists]) => exists ? of(bucketName) : create$(bucketName))
    )
})

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
        map(() => bucketName)
    )
