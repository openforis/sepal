import {catchError, defer, EMPTY, endWith, from, ignoreElements, last, map, mergeMap, switchMap, throwError, toArray} from 'rxjs'

import {drive} from '#gee/jobs/ee/batch/drive'
import {userStorageSerializer$} from '#gee/jobs/service/userStorageSerializer'
import {ClientException, ERROR_CODES, NotFoundException} from '#sepal/exception'

import {ensureUserBucket$, findUserBucket$, storage} from './userBucket.js'

const SIGNED_URL_MS = 60 * 60 * 1000
const MAX_CONCURRENT_SIGNINGS = 5

const drivePath = folder => `SEPAL/exports/${folder}`

// A folder that requireFolder accepts, made from user text such as a recipe title.
export const exportFolderName = text => {
    const name = String(text ?? '').replace(/[/\\"]/g, '_').trim()
    return name === '' || name === '.' || name === '..' ? 'export' : name
}

export const prepareDestination$ = ({folder}, {sepalUser, auth}) => defer(() => {
    requireUser(sepalUser)
    requireFolder(folder)
    return auth.type === 'user'
        ? prepareDrive$(folder, sepalUser)
        : prepareGcs$(folder, sepalUser)
})

export const listDownloads$ = (destination, {sepalUser}) => defer(() => {
    requireDestination(destination, sepalUser)
    return destination.type === 'drive'
        ? listDrive$(destination, sepalUser)
        : listGcs$(destination, sepalUser)
})

export const cleanupDestination$ = (destination, {sepalUser}) => defer(() => {
    requireDestination(destination, sepalUser)
    return (destination.type === 'drive'
        ? removeDriveFolder$(destination, sepalUser)
        : removeGcsPrefix$(destination, sepalUser)
    ).pipe(
        ignoreElements(),
        endWith({})
    )
})

const prepareDrive$ = (folder, sepalUser) => {
    requireGoogleTokens(sepalUser)
    return userStorageSerializer$(drive({sepalUser}).createFolder$({path: drivePath(folder)}), undefined, sepalUser.username).pipe(
        last(),
        map(() => ({destination: {type: 'drive', folder}, exportTarget: {type: 'drive', folder}}))
    )
}

const prepareGcs$ = (folder, sepalUser) =>
    userStorageSerializer$(ensureUserBucket$(sepalUser.username), undefined, sepalUser.username).pipe(
        map(bucket => ({
            destination: {type: 'gcs', prefix: `${folder}/`},
            exportTarget: {type: 'gcs', bucket, fileNamePrefix: `${folder}/`}
        }))
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

const listGcs$ = ({prefix}, sepalUser) =>
    userBucket$(sepalUser).pipe(
        switchMap(bucket => bucket
            ? signedDownloads$(bucket, prefix)
            : throwError(() => new NotFoundException(`No export bucket for user ${sepalUser.username}`))
        )
    )

const signedDownloads$ = (bucket, prefix) => {
    const expiresAt = Date.now() + SIGNED_URL_MS
    return from(bucket.getFiles({prefix})).pipe(
        mergeMap(([files]) => from(files)),
        mergeMap(file => from(file.getSignedUrl({version: 'v4', action: 'read', expires: expiresAt})).pipe(
            map(([url]) => ({name: file.name.substring(prefix.length), size: Number(file.metadata.size), url, headers: {}}))
        ), MAX_CONCURRENT_SIGNINGS),
        toArray(),
        map(files => ({files, expiresAt}))
    )
}

const removeDriveFolder$ = ({folder}, sepalUser) =>
    drive({sepalUser}).removeFolder$({path: drivePath(folder)}).pipe(
        catchError(error => error instanceof NotFoundException ? EMPTY : throwError(() => error))
    )

const removeGcsPrefix$ = ({prefix}, sepalUser) =>
    userBucket$(sepalUser).pipe(
        switchMap(bucket => bucket ? from(bucket.deleteFiles({prefix})) : EMPTY)
    )

// The bucket is always the requesting user's, whatever the container sent: the destination names a prefix only.
const userBucket$ = sepalUser =>
    findUserBucket$(sepalUser.username).pipe(
        map(bucketName => bucketName && storage().bucket(bucketName))
    )

const requireDestination = (destination, sepalUser) => {
    requireUser(sepalUser)
    if (destination?.type === 'drive') {
        requireFolder(destination.folder)
        requireGoogleTokens(sepalUser)
    } else if (destination?.type === 'gcs') {
        requirePrefix(destination.prefix)
    } else {
        throw new ClientException(`Not an export destination: ${JSON.stringify(destination)}`)
    }
}

const requireUser = sepalUser => {
    if (!sepalUser?.username) {
        throw new ClientException('No user to export for')
    }
}

// One plain folder name: it is placed in Drive paths and in Drive queries.
const requireFolder = folder => {
    if (typeof folder !== 'string' || !folder.length || /[/\\"]/.test(folder) || folder === '.' || folder === '..') {
        throw new ClientException(`Not an export folder: ${folder}`)
    }
}

const requirePrefix = prefix => {
    if (typeof prefix !== 'string' || prefix.length <= 1 || !prefix.endsWith('/') || prefix.split('/').includes('..')) {
        throw new ClientException(`Not an export folder: ${prefix}`)
    }
}

const requireGoogleTokens = sepalUser => {
    if (!sepalUser.googleTokens?.accessToken) {
        throw new ClientException('Exporting to Drive requires a Google account', {errorCode: ERROR_CODES.MISSING_GOOGLE_TOKENS})
    }
}
