const fs = require('fs')
const {Subject, from, of} = require('rxjs')
const {first, map, switchMap} = require('rxjs/operators')
const crypto = require('crypto')
const http = require('sepal/httpClient')
const {Storage} = require('@google-cloud/storage')
const config = require('root/config')

const projectId = config.googleProjectId
const cloudStorage = new Storage({credentials: config.serviceAccountCredentials, projectId})

/**
 * Get bucket name for Sepal username and Google account email.
 */
const getBucketName = ({username, email}) => {
    const emailHash = crypto.createHash('md5').update(email).digest('hex').substring(0, 4)
    return `${username}-${emailHash}-${config.sepalHost}`.replace(/[^a-zA-Z0-9-]/g, '-')
}

const bucketExists$ = user =>
    from(cloudStorage.bucket(user.bucketName).exists()).pipe(
        map(response => response[0])
    )

const createBucket$ = user =>
    from(cloudStorage.createBucket(user.bucketName, {
        location: 'EUROPE-WEST2', // TODO: Config
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
        switchMap(() => setBucketPermissions$(user)),
        map(() => user.bucketName)
    )

const setBucketPermissions$ = user => {
    const userBindings = [{
        role: 'roles/storage.objectCreator',
        members: [`user:${user.email}`],
    }, {
        role: 'roles/storage.legacyBucketWriter',
        members: [`user:${user.email}`],
    }]
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
    return from(bucket.iam.setPolicy(policy))
}

const createIfMissingBucket$ = user =>
    bucketExists$(user).pipe(
        switchMap(exists => exists ? of(user.bucketName) : createBucket$(user))
    )

const getEmail$ = accessToken => {
    return http.get$('https://www.googleapis.com/drive/v3/about?fields=user', {
        retries: 0,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    }).pipe(
        map(response => JSON.parse(response.body).user.emailAddress)
    )
}

const readJsonFile$ = filePath => {
    const data$ = new Subject()
    fs.readFile(filePath, 'utf8', (error, data) => {
        if (error) {
            data$.error(error)
        } else {
            data$.next(JSON.parse(data))
        }
    })
    return data$
}

const fileExist$ = path => {
    const exists$ = new Subject()
    fs.access(path, error => exists$.next(error ? null : path))
    return exists$.pipe(first())
}

const getUser$ = path =>
    readJsonFile$(path).pipe(
        map(credentials => credentials.access_token),
        switchMap(accessToken => getEmail$(accessToken).pipe(
            map(email => ({
                username: config.username,
                accessToken,
                email,
                bucketName: getBucketName({username: config.username, email})
            }))
        ))
    )

const getServiceAccount$ = () => {
    const username = 'service-account'
    const email = config.serviceAccountCredentials.client_email
    const bucketName = getBucketName({username, email})
    return of({username, email, bucketName, serviceAccount: true})
}

const initUserBucket$ = () =>
    fileExist$(`${config.homeDir}/.config/earthengine/credentials`).pipe(
        switchMap(path => path
            ? getUser$(path)
            : getServiceAccount$()
        ),
        switchMap(user => createIfMissingBucket$(user))
    )

module.exports = {cloudStorage, initUserBucket$}
