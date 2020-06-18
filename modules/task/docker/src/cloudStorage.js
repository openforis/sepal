const {of} = require('rx')
const {first, map, switchMap} = require('rx/operators')
const {fromPromise} = require('sepal/rxjs')
const crypto = require('crypto')
const http = require('sepal/httpClient')
const {Storage} = require('@google-cloud/storage')
const {getCredentials, getConfig} = require('root/context')
const {retry} = require('sepal/rxjs/operators')

const config = getConfig()

const projectId = config.googleProjectId
const cloudStorage = new Storage({credentials: config.serviceAccountCredentials, projectId})

const RETRIES = 5

const do$ = promise =>
    fromPromise(promise).pipe(
        retry(RETRIES)
    )

/**
 * Get bucket name for Sepal username and Google account email.
 */
const getBucketName = ({username, email}) => {
    const emailHash = crypto.createHash('md5').update(email).digest('hex').substring(0, 4)
    return `${username}-${emailHash}-${config.sepalHost}`.replace(/[^a-zA-Z0-9-]/g, '-')
}

const bucketExists$ = user =>
    do$(cloudStorage.bucket(user.bucketName).exists()).pipe(
        map(response => response[0])
    )

const createBucket$ = bucket =>
    do$(cloudStorage.createBucket(bucket.bucketName, {
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
    })).pipe(
        switchMap(() => setBucketPermissions$(bucket)),
        mapTo(bucket)
    )

const setBucketPermissions$ = user => {
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
    return do$(bucket.iam.setPolicy(policy))
}

const createIfMissingBucket$ = bucket =>
    bucketExists$(bucket).pipe(
        switchMap(exists => 
            exists 
                ? of(bucket) 
                : createBucket$(bucket)
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

const getUserBucket$ = userCredentials =>
    getEmail$(userCredentials.access_token).pipe(
        map(email => ({
            username: config.username,
            accessToken: userCredentials.access_token,
            email,
            bucketName: getBucketName({username: config.username, email})
        }))
    )

const getServiceAccountBucket$ = serviceAccountCredentials => {
    const username = 'service-account'
    const email = serviceAccountCredentials.client_email
    return of({
        username,
        email,
        bucketName: getBucketName({username, email}),
        serviceAccount: true
    });
}

const getBucket$ = ({userCredentials, serviceAccountCredentials}) =>
    userCredentials
        ? getUserBucket$(userCredentials)
        : getServiceAccountBucket$(serviceAccountCredentials)

const initUserBucket$ = () =>
    getBucket$(getCredentials()).pipe(
        switchMap(bucket => createIfMissingBucket$(bucket)),
        map(({bucketName}) => bucketName),
        first()
    )

module.exports = {cloudStorage, initUserBucket$}
