const {defer, EMPTY, Subject, concat, from, of, throwError, catchError, expand, filter, map, mergeMap, mergeScan, scan, switchMap, finalize} = require('rxjs')
const {google} = require('googleapis')
const {NotFoundException} = require('#sepal/exception')
const log = require('#sepal/log').getLogger('drive')
const {getCurrentContext$} = require('#task/jobs/service/context')
const fs = require('fs')
const Path = require('path')
const {autoRetry, swallow} = require('#sepal/rxjs')
const {mkdir$} = require('./rxjs/fileSystem')
const {driveLimiter$} = require('./jobs/service/driveLimiter')
const format = require('./format')
const moment = require('moment')

const RETRY_CONFIG = {
    maxRetries: 5,
    minRetryDelay: 500,
    retryDelayFactor: 2
}

const IS_FILE = 'mimeType != "application/vnd.google-apps.folder"'
const IS_FOLDER = 'mimeType = "application/vnd.google-apps.folder"'
const OWNED_BY_ME = '"me" in owners'
const IS_NOT_THRASHED = 'trashed = false'

const and = (...conditions) =>
    conditions.filter(condition => condition).join(' and ')

const isParent = parentId =>
    parentId && `"${parentId}" in parents`

const isName = name =>
    name && `name = "${name}"`

const do$ = (message, operation$) => {
    log.debug(() => message)
    return operation$
}

const auth$ = () =>
    defer(getCurrentContext$).pipe(
        switchMap(({userCredentials}) => {
            const oAuth2Client = new google.auth.OAuth2()
            const expiration = moment(userCredentials['access_token_expiry_date'])
            log.debug(() => `Authenticating with token expiring ${expiration.fromNow()} (${expiration})`)
            oAuth2Client.setCredentials({
                access_token: userCredentials['access_token']
            })
            return of(oAuth2Client)
        })
    )

/**
 * Google Drive wrapper: authenticate, execute (with autoretries) and unwrap result
 * @param {string} message
 * @param {Promise} op operation
 * @return {Observable}
 */
const drive$ = (message, op) => {
    log.debug(() => message)
    return of(true).pipe(
        switchMap(() =>
            driveLimiter$(
                auth$().pipe(
                    map(auth =>
                        google.drive({version: 'v3', auth})
                    ),
                    switchMap(drive =>
                        from(op(drive))
                    ),
                    map(({data}) => data)
                )
            )
        ),
        autoRetry(RETRY_CONFIG)
    )
}

/**
 * Get one page of files in a given folder id
 * @param {string} id Folder id
 * @param {string} pageToken Optional page token
 * @return {Observable} {files, nextPageToken}
 */
const getFilesByFolder$ = ({id, pageToken} = {}) =>
    drive$(`Get files for id: ${id}`, drive =>
        drive.files.list({
            q: and(isParent(id), IS_FILE, IS_NOT_THRASHED, OWNED_BY_ME),
            fields: 'files(id, name, size), nextPageToken',
            spaces: 'drive',
            pageToken
        })
    )

/**
 * Create a folder with name under a given folder id
 * @param {string} name Folder name
 * @param {string} parentId Optional parent folder id
 * @return {Observable}
 */
const createFolderByName$ = ({name, parentId}) =>
    drive$(`Create dir "${name}"`, drive =>
        drive.files.create({
            resource: {
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            },
            fields: 'id'
        })
    )

/**
 * Get a folder by name
 * @param {string} name Folder name
 * @param {string} parentId Optional parent folder id
 * @return {Observable} Id of folder or error if not found
 */
const getFolderByName$ = ({name, parentId}) =>
    drive$(`Get folder by name: ${name}`, drive =>
        drive.files.list({
            q: and(isParent(parentId), isName(name), IS_FOLDER, IS_NOT_THRASHED, OWNED_BY_ME),
            fields: 'files(id, name), nextPageToken',
            spaces: 'drive'
        })
    ).pipe(
        switchMap(({files}) =>
            files.length
                ? of({id: files[0].id}) // handling the first match only
                : throwError(
                    () => new NotFoundException(`Directory "${name}" not found ${parentId ? `in parent ${parentId}` : ''}`)
                )
        )
    )

/**
 * Get a folder by name under a given id, and optionally create it if it doesn't exist
 * @param {string} name Folder name
 * @param {string} parentId Optional parent folder id
 * @param {boolean} create Create folder if it doesn't exist
 * @return {Observable} Id of folder or error if not found
 */
const getOrCreateFolderByName$ = ({name, parentId, create}) =>
    do$(`Get ${create ? 'or create ' : ''}folder by name: ${name}`,
        getFolderByName$({name, parentId}).pipe(
            catchError(error =>
                error instanceof NotFoundException && create
                    ? createFolderByName$({name, parentId})
                    : throwError(() => error)
            )
        )
    )

/**
 * Get a nested folder by names
 * @param {array<string>} names Array of folder names
 * @param {string} parentId Optional parent folder id
 * @param {boolean} create Create folder if it doesn't exist
 * @return {Observable} Id of folder or error if not found
 */
const getNestedFolderByNames$ = ({names: [name, ...names], parentId, create}) =>
    do$(`Get ${create ? 'or create ' : ''}nested folder by names: <omitted>`,
        getOrCreateFolderByName$({name, parentId, create}).pipe(
            switchMap(({id}) =>
                names.length
                    ? getNestedFolderByNames$({names, parentId: id, create})
                    : of({id})
            )
        )
    )

/**
 * Remove a folder by id
 * @param {string} id Folder id
 * @return {Observable}
 */
const remove$ = ({id}) =>
    drive$(`Remove id: ${id}`, drive =>
        drive.files.delete({
            fileId: id
        })
    ).pipe(swallow())

// PATH FUNCTIONS

/**
 * Get a folder by path
 * @param {string} path Path of folder
 * @param {boolean} create Create folder if it doesn't exist
 * @return {Observable} Id of folder or error if not found
 */
const getFolderByPath$ = ({path, create} = {}) =>
    do$(`Get ${create ? 'or create ' : ''}folder by path: ${path}`,
        getNestedFolderByNames$({names: path.split('/'), create}).pipe(
            catchError(error =>
                error instanceof NotFoundException
                    ? throwError(
                        () => new NotFoundException(error, {
                            userMessage: {
                                message: `Path not found: '${path}'`
                            }
                        })
                    )
                    : throwError(() => error)
            )
        )
    )

/**
 * Get files in a folder by path
 * @param {string} path Path of folder
 * @param {string} pageToken Optional page token
 * @return {Observable} {files, nextPageToken} or error if not found
 */
const getFilesByPath = ({path, pageToken}) =>
    do$(`Get files by path: ${path}`,
        getFolderByPath$({path}).pipe(
            switchMap(({id}) => getFilesByFolder$({id, pageToken}))
        )
    )

/**
 * Remove a folder by path
 * @param {string} path Folder path
 * @return {Observable}
 */
const removeFolderByPath$ = ({path}) =>
    do$(`Remove folder by path: ${path}`,
        getFolderByPath$({path}).pipe(
            catchError(e =>
                e instanceof NotFoundException
                    ? EMPTY
                    : throwError(() => e)
            ),
            switchMap(({id}) => remove$({id})),
            catchError(e => {
                log.warn(`Failed to remove ${path}`, e)
                return EMPTY
            }),
            swallow()
        )
    )

/**
 * Get number and total size of files in a folder by path
 * @param {string} path Folder path
 * @return {Observable} Emits {files, bytes} with totals
 */
const getFolderTotalsByPath$ = path =>
    do$(`Get folder totals by path: ${path}`,
        getFilesByPath({path}).pipe(
            expand(({nextPageToken}) => nextPageToken
                ? getFilesByPath({path, pageToken: nextPageToken})
                : EMPTY
            ),
            switchMap(({files}) => of(...files)),
            scan(({bytes, files}, {size}) => ({bytes: bytes + Number(size), files: files + 1}), {bytes: 0, files: 0})
        )
    )

/**
 * Download a fild by id
 * @param {string} id Id of file
 * @param {stream} destinationStream Destination stream
 * @return {Observable} Emits bytes downloaded for each fragment downloaded
 */
const downloadFile$ = (id, destinationStream) =>
    defer(() =>
        drive$(`Download file by id: ${id}`, drive =>
            drive.files.get(
                {fileId: id, alt: 'media'},
                {responseType: 'stream'}
            )
        )
    ).pipe(
        switchMap(stream => {
            const stream$ = new Subject()

            const onData = data => {
                stream$.next(data.length)
            }
            const onError = error => {
                destinationStream.close()
                stream$.error(error)
            }
            const onEnd = () => {
                stream$.complete()
            }

            stream.on('data', onData)
            stream.on('error', onError)
            stream.on('end', onEnd)
            stream.pipe(destinationStream)

            return stream$.pipe(
                finalize(() => {
                    stream.off('data', onData)
                    stream.off('error', onError)
                    stream.off('end', onEnd)
                })
            )
        })
    )

/**
 * Download a folder by path (non-recursive, it ignores subfolders)
 * @param {string} path Folder path
 * @param {string} destinationPath Destination filesystem path
 * @param {number} concurrency Number of concurrent downloads
 * @param {boolean} deleteAfterDownload Remove the path after download
 */
const downloadSingleFolderByPath$ = (path, destinationPath, {concurrency, deleteAfterDownload}) =>
    do$(`Download folder files by path: ${path}`,
        concat(
            mkdir$(destinationPath, {recursive: true}).pipe(
                switchMap(() =>
                    getFolderTotalsByPath$(path).pipe(
                        switchMap(({bytes, files}) =>
                            concat(
                                downloadProgress$({bytes, files}),
                                getFilesByPath({path}).pipe(
                                    expand(({nextPageToken}) => nextPageToken
                                        ? getFilesByPath({path, pageToken: nextPageToken})
                                        : EMPTY
                                    ),
                                    switchMap(({files}) => of(...files)),
                                    mergeMap(file =>
                                        concat(
                                            downloadFile$(file.id, fs.createWriteStream(Path.join(destinationPath, file.name))).pipe(
                                                map(downloaded => ({bytes: -downloaded}))
                                            ),
                                            of({files: -1})
                                        ), concurrency
                                    ),
                                    filter(({files}) => files > 0)
                                )
                            ).pipe(
                                mergeScan((acc, {bytes = 0, files = 0}) =>
                                    downloadProgress$({bytes: acc.bytes + bytes, files: acc.files + files}), {
                                    bytes: 0,
                                    files: 0
                                })
                            )
                        )
                    )
                )
            ),
            deleteAfterDownload ? removeFolderByPath$({path}) : EMPTY
        )
    )

const downloadProgress$ = ({bytes, files}) => {
    const formattedBytes = format.fileSize(bytes)
    return of({
        bytes,
        files,
        defaultMessage: `Downloading - ${files} ${files > 1 ? 'files' : 'file'} / ${formattedBytes} left`,
        messageKey: 'tasks.download.progress',
        messageArgs: {bytes: formattedBytes, files}
    })
}
module.exports = {getFolderByPath$, removeFolderByPath$, downloadSingleFolderByPath$}
