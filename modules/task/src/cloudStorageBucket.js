const {defer, of, first, map, switchMap} = require('rxjs')
const {autoRetry} = require('#sepal/rxjs')
const {fromPromise} = require('#sepal/rxjs')
const crypto = require('crypto')
const http = require('#sepal/httpClient')
const {getCurrentContext$} = require('#task/jobs/service/context')
const {cloudStorage$} = require('./cloudStorage')
const log = require('#sepal/log').getLogger('cloudStorage')

const RETRY_CONFIG = {
    maxRetries: 5,
    minRetryDelay: 500,
    retryDelayFactor: 2
}

const initUserBucket$ = () =>
    getCurrentContext$().pipe(
        switchMap(({config}) => {
            const getUser$ = userCredentials =>
                getEmail$(userCredentials.access_token).pipe(
                    map(email => ({
                        username: config.username,
                        accessToken: userCredentials.access_token,
                        email,
                        bucketName: getBucketName({username: config.username, email})
                    }))
                )

            const getServiceAccount$ = serviceAccountCredentials => {
                const username = 'service-account'
                const email = serviceAccountCredentials.client_email
                return of({
                    username,
                    email,
                    bucketName: getBucketName({username, email, prefix: `-${config.username}`}),
                    serviceAccount: true
                })
            }

            const getBucketUser$ = ({userCredentials, serviceAccountCredentials}) =>
                userCredentials
                    ? getUser$(userCredentials)
                    : getServiceAccount$(serviceAccountCredentials)

            /**
             * Get bucket name for Sepal username and Google account email.
             */
            const getBucketName = ({username, email, prefix = ''}) => {
                const emailHash = crypto.createHash('md5').update(email).digest('hex').substring(0, 4)
                return `${username}-${emailHash}-${config.sepalHost}${prefix}`.replace(/[^a-zA-Z0-9-]/g, '-')
            }

            const createBucket$ = user =>
                cloudStorage$().pipe(
                    switchMap(cloudStorage =>
                        do$(
                            `create bucket: ${JSON.stringify(user)}`,
                            cloudStorage.createBucket(user.bucketName, {
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
                        )
                    ),
                    switchMap(() => setBucketPermissions$(user)),
                    map(() => user)
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
                            `projectEditor:${config.googleProjectId}`,
                            `projectOwner:${config.googleProjectId}`,
                            `serviceAccount:${config.serviceAccountCredentials.client_email}`
                        ],
                    },
                    ...user.serviceAccount ? [] : userBindings
                ]
                const policy = {kind: 'storage#policy', bindings}

                return cloudStorage$().pipe(
                    map(cloudStorage => cloudStorage.bucket(user.bucketName)),
                    switchMap(bucket => do$(`set bucket policy: ${JSON.stringify(user)}`, bucket.iam.setPolicy(policy)))
                )
            }

            const createIfMissingBucket$ = user =>
                bucketExists$(user).pipe(
                    switchMap(exists =>
                        exists
                            ? of(user)
                            : createBucket$(user)
                    )
                )

            return getBucketUser$(config).pipe(
                switchMap(user => createIfMissingBucket$(user)),
                map(({bucketName}) => bucketName),
                first()
            )
        })
    )

const bucketExists$ = user =>
    cloudStorage$().pipe(
        map(cloudStorage => cloudStorage.bucket(user.bucketName)),
        switchMap(bucket =>
            do$(`check if bucket exists: ${JSON.stringify(user)}`, bucket.exists()),
        ),
        map(response => response[0])
    )

const getEmail$ = accessToken =>
    http.get$('https://www.googleapis.com/drive/v3/about?fields=user', {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        retry: {
            maxRetries: 0
        }
    }).pipe(
        map(response => JSON.parse(response.body).user.emailAddress)
    )

const do$ = (description, promise) => defer(() => {
    log.debug(() => description)
    return of(true).pipe(
        switchMap(() => fromPromise(promise)),
        autoRetry(RETRY_CONFIG)
    )
})

module.exports = {initUserBucket$}
