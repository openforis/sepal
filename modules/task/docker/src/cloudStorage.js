const {from, of} = require('rx')
const {first, map, switchMap, mapTo} = require('rx/operators')
const crypto = require('crypto')
const http = require('sepal/httpClient')
const {Storage} = require('@google-cloud/storage')
const {getContext$} = require('root/jobs/service/context')
const {fromPromise} = require('sepal/rxjs')
const {retry} = require('sepal/rxjs/operators')
const log = require('sepal/log').getLogger('cloudstorage')

const RETRIES = 5

const cloudStorage$ = (message, op) => {
    log.debug(() => message)
    return getContext$().pipe(
        map(({config}) => new Storage({
            credentials: config.serviceAccountCredentials,
            projectId: config.googleProjectId
        })),
        switchMap(cloudStorage =>
            from(op(cloudStorage)),
        ),
        retry(RETRIES)
    )
}

/**
 * Get bucket name for Sepal username and Google account email.
 */
const getBucketName = ({username, email, host}) => {
    const emailHash = crypto.createHash('md5').update(email).digest('hex').substring(0, 4)
    return `${username}-${emailHash}-${host}`.replace(/[^a-zA-Z0-9-]/g, '-')
}

const bucketExists$ = user =>
    cloudStorage$(`Check if bucket ${user.bucketName} exists`,
        cloudStorage => fromPromise(cloudStorage.bucket(user.bucketName).exists()).pipe(
            map(response => response[0])
        )
    )

const createBucket$ = (config, bucket) =>
    cloudStorage$(`Create bucket ${bucket.bucketName}`,
        cloudStorage => cloudStorage.createBucket(bucket.bucketName, {
            location: config.googleRegion,
            storageClass: 'STANDARD',
            iamConfiguration: {
                uniformBucketLevelAccess: {enabled: true}
            },
            labels: {type: 'user'},
            lifecycle: {
                rule: [{
                    action: {type: 'Delete'},
                    condition: {age: 1}
                }]
            }
        })
    ).pipe(
        switchMap(() => setBucketPermissions$(config, bucket)),
        mapTo(bucket)
    )

const setBucketPermissions$ = (config, user) =>
    cloudStorage$('Set bucket permissions',
        cloudStorage => {
            const userBindings = [
                {
                    role: 'roles/storage.objectCreator',
                    members: [`user:${user.email}`],
                },
                {
                    role: 'roles/storage.legacyBucketWriter',
                    members: [`user:${user.email}`],
                }
            ]
            const projectId = config.googleProjectId
            const bindings = [
                {
                    role: 'roles/storage.admin',
                    members: [
                        `projectEditor:${projectId}`,
                        `projectOwner:${projectId}`,
                        `serviceAccount:${config.serviceAccountCredentials.client_email}`
                    ],
                },
                ...user.serviceAccount ? [] : userBindings
            ]
            const policy = {kind: 'storage#policy', bindings}
            const bucket = cloudStorage.bucket(user.bucketName)
            return bucket.iam.setPolicy(policy)
        }
    )

const ensureBucketExists$ = (config, bucket) =>
    bucketExists$(bucket).pipe(
        switchMap(exists =>
            exists
                ? of(bucket)
                : createBucket$(config, bucket)
        )
    )

const getEmail$ = accessToken =>
    http.get$('https://www.googleapis.com/drive/v3/about?fields=user', {
        retries: 0,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    }).pipe(
        map(response => JSON.parse(response.body).user.emailAddress)
    )

const getUserBucket$ = (config, userCredentials) =>
    getEmail$(userCredentials.access_token).pipe(
        map(email => ({
            username: config.username,
            accessToken: userCredentials.access_token,
            email,
            bucketName: getBucketName({username: config.username, email, host: config.sepalHost})
        }))
    )

const getServiceAccountBucket$ = (config, serviceAccountCredentials) => {
    const username = 'service-account'
    const email = serviceAccountCredentials.client_email
    return of({
        username,
        email,
        bucketName: getBucketName({username, email, host: config.sepalHost}),
        serviceAccount: true
    })
}

const getBucket$ = ({config, userCredentials, serviceAccountCredentials}) =>
    userCredentials
        ? getUserBucket$(config, userCredentials)
        : getServiceAccountBucket$(config, serviceAccountCredentials)

const initUserBucket$ = () =>
    getContext$().pipe(
        switchMap(context => getBucket$(context).pipe(
            switchMap(bucket => ensureBucketExists$(context.config, bucket)),
        )),
        map(({bucketName}) => bucketName),
        first()
    )

module.exports = {cloudStorage$, initUserBucket$}
