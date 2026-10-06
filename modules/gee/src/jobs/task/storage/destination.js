import {catchError, defer, EMPTY, endWith, from, ignoreElements, last, map, mergeMap, throwError, toArray} from 'rxjs'

import {drive} from '#gee/jobs/ee/batch/drive'
import {userStorageSerializer$} from '#gee/jobs/service/userStorageSerializer'
import {ClientException, NotFoundException} from '#sepal/exception'

import {ensureUserBucket$, storage, userBucketName} from './userBucket.js'

const SIGNED_URL_MS = 60 * 60 * 1000
const MAX_CONCURRENT_SIGNINGS = 5

const drivePath = folder => `SEPAL/exports/${folder}`

export const prepareDestination$ = ({folder}, {sepalUser, auth}) =>
    auth.type === 'user'
        ? userStorageSerializer$(drive({sepalUser}).createFolder$({path: drivePath(folder)}), undefined, sepalUser.username).pipe(
            last(),
            map(() => ({destination: {type: 'drive', folder}, exportTarget: {type: 'drive', folder}}))
        )
        : userStorageSerializer$(ensureUserBucket$(sepalUser.username), undefined, sepalUser.username).pipe(
            map(bucket => ({
                destination: {type: 'gcs', prefix: `${folder}/`},
                exportTarget: {type: 'gcs', bucket, fileNamePrefix: `${folder}/`}
            }))
        )

export const listDownloads$ = (destination, {sepalUser}) =>
    destination.type === 'drive'
        ? listDrive$(destination, sepalUser)
        : listGcs$(destination, sepalUser)

export const cleanupDestination$ = (destination, {sepalUser}) =>
    (destination.type === 'drive'
        ? removeDriveFolder$(destination, sepalUser)
        : withPrefix$(destination, prefix => from(userBucket(sepalUser).deleteFiles({prefix})))
    ).pipe(
        ignoreElements(),
        endWith({})
    )

const listDrive$ = ({folder}, sepalUser) => {
    const {accessToken, accessTokenExpiryDate} = sepalUser.googleTokens
    return drive({sepalUser}).listFiles$({path: drivePath(folder)}).pipe(
        map(files => ({
            files: files.map(({id, name, size}) => ({
                name,
                size: Number(size),
                url: `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
                headers: {Authorization: `Bearer ${accessToken}`}
            })),
            expiresAt: accessTokenExpiryDate
        }))
    )
}

const listGcs$ = (destination, sepalUser) => withPrefix$(destination, prefix => {
    const expiresAt = Date.now() + SIGNED_URL_MS
    return from(userBucket(sepalUser).getFiles({prefix})).pipe(
        mergeMap(([files]) => from(files)),
        mergeMap(file => from(file.getSignedUrl({version: 'v4', action: 'read', expires: expiresAt})).pipe(
            map(([url]) => ({name: file.name.substring(prefix.length), size: Number(file.metadata.size), url, headers: {}}))
        ), MAX_CONCURRENT_SIGNINGS),
        toArray(),
        map(files => ({files, expiresAt}))
    )
})

const removeDriveFolder$ = ({folder}, sepalUser) =>
    drive({sepalUser}).removeFolder$({path: drivePath(folder)}).pipe(
        catchError(error => error instanceof NotFoundException ? EMPTY : throwError(() => error))
    )

// The bucket is always the requesting user's, whatever the container sent: the destination names a prefix only.
const userBucket = sepalUser =>
    storage().bucket(userBucketName(sepalUser.username))

const withPrefix$ = ({prefix}, prefix$) =>
    isExportFolder(prefix)
        ? defer(() => prefix$(prefix))
        : throwError(() => new ClientException(`Not an export folder: ${prefix}`))

const isExportFolder = prefix =>
    typeof prefix === 'string' && prefix.length > 1 && prefix.endsWith('/') && !prefix.split('/').includes('..')
