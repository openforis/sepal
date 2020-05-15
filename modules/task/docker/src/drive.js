const {from, of, throwError, ReplaySubject, EMPTY, concat, pipe, timer} = require('rxjs')
const {catchError, map, switchMap, tap, scan, mergeMap, expand, retryWhen, range, zip} = require('rxjs/operators')
const {google} = require('googleapis')
const {NotFoundException} = require('sepal/exception')
const log = require('sepal/log').getLogger('task')
const {auth$} = require('root/credentials')
const fs = require('fs')
const Path = require('path')

const msg = message => `Google Drive: ${message}`

const do$ = (message, operation$) => {
    log.debug(msg(message))
    return operation$
}

const retry = maxRetries =>
    pipe(
        retryWhen(error$ =>
            zip(
                error$,
                range(0, maxRetries + 1)
            ).pipe(
                mergeMap(
                    ([error, retry]) => retry === maxRetries
                        ? throwError(error)
                        : timer(Math.pow(2, retry) * 400)
                )
            )
        )
    )

const drive$ = (message, op$) =>
    auth$().pipe(
        tap(() => log.trace(msg(message))),
        map(auth => google.drive({version: 'v3', auth})),
        switchMap(drive => from(op$(drive))),
        retry(3),
        map(({data}) => data)
    )

const createDir$ = (name, parentId) =>
    drive$(`create dir "${name}"`, drive =>
        drive.files.create({
            resource: {
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            },
            fields: 'id'
        })
    )

const getFiles$ = (id, {pageToken} = {}) =>
    drive$(`get files for id <${id}>`, drive =>
        drive.files.list({
            q: `'${id}' in parents and mimeType != "application/vnd.google-apps.folder" and trashed = false`,
            fields: 'files(id, name, size), nextPageToken',
            spaces: 'drive',
            pageSize: 3,
            pageToken
        })
    )

const getDir$ = (name, parentId, pageToken) =>
    drive$(`get dir "${name}"`, drive =>
        drive.files.list({
            q: `name = "${name}" and mimeType = "application/vnd.google-apps.folder" and trashed = false`,
            fields: 'files(id, name), nextPageToken',
            spaces: 'drive',
            pageToken
        })
    ).pipe(
        switchMap(({files, nextPageToken}) =>
            files.length
                ? of({id: files[0].id}) // handling the first match only
                : nextPageToken
                    ? getDir$(name, parentId, nextPageToken) // TODO implement recursion with expand
                    : throwError(new NotFoundException(null, `Directory "${name}" not found ${parentId ? `in parent ${parentId}` : ''}`))
        )
    )

const getOrCreateDir$ = (name, create, parentId) =>
    getDir$(name, parentId).pipe(
        catchError(error =>
            error instanceof NotFoundException && create
                ? createDir$(name, parentId)
                : throwError(error)
        )
    )

const getNestedDir$ = ([dir, ...dirs], create, parentId) =>
    getOrCreateDir$(dir, create, parentId).pipe(
        switchMap(({id}) =>
            dirs.length
                ? getNestedDir$(dirs, create, id) // TODO replace recursion with expand?
                : of({id})
        )
    )

const remove$ = id =>
    drive$(`remove id <${id}>`, drive =>
        drive.files.delete({
            fileId: id
        })
    )

const getPath$ = (path, {create = false} = {}) =>
    getNestedDir$(path.split('/'), create).pipe(
        catchError(error =>
            error instanceof NotFoundException
                ? throwError(new NotFoundException(error, `Path not found: '${path}'`))
                : throwError(error)
        )
    )

const getPathFiles$ = (path, options) =>
    do$(`get files for path "${path}"`,
        getPath$(path).pipe(
            switchMap(({id}) => getFiles$(id, options))
        )
    )

const removePath$ = path =>
    do$(`remove path "${path}"`,
        getPath$(path).pipe(
            switchMap(({id}) => remove$(id))
        )
    )

const downloadFile$ = (id, destinationStream) =>
    drive$(`get file <${id}>`, drive =>
        drive.files.get(
            {fileId: id, alt: 'media'},
            {responseType: 'stream'}
        )
    ).pipe(
        switchMap(stream => {
            const stream$ = new ReplaySubject()
            stream.on('data', data => stream$.next(data.length))
            stream.on('error', error => stream.error(error))
            stream.on('end', () => stream$.complete())
            stream.pipe(destinationStream)
            return stream$.pipe(
                // scan((downloadedSize, blockSize) => downloadedSize + blockSize, 0)
            )
        })
    )

const createLocalPath$ = path =>
    from(
        fs.promises.mkdir(path, {recursive: true})
    )

const scanDir$ = path =>
    getPathFiles$(path).pipe(
        
        expand(({nextPageToken}) => nextPageToken
            ? getPathFiles$(path, {pageToken: nextPageToken})
            : EMPTY
        ),
        switchMap(({files}) => of(...files)),
        scan((totalSize, {size}) => totalSize + Number(size), 0)
    )

// [TODO] recurse subdirs
const downloadDir$ = (path, destinationPath, {concurrency, deleteAfterDownload = false}) =>
    do$(`download directory "${path}"`,
        concat(
            createLocalPath$(destinationPath).pipe(
                switchMap(() =>
                    scanDir$(path).pipe(
                        switchMap(totalSize =>
                            getPathFiles$(path).pipe(
                                expand(({nextPageToken}) => nextPageToken
                                    ? getPathFiles$(path, {pageToken: nextPageToken})
                                    : EMPTY
                                ),
                                switchMap(({files}) => of(...files)),
                                mergeMap(file =>
                                    downloadFile$(file.id, fs.createWriteStream(Path.join(destinationPath, file.name))).pipe(
                                        map(downloaded => ({name: file.name, downloaded, totalSize}))
                                    ), concurrency
                                )
                            )
                        )
                    )
                )
            ),
            deleteAfterDownload ? removePath$(path) : EMPTY
        )
    )

module.exports = {getPath$, removePath$, getPathFiles$, downloadFile$, downloadDir$}
