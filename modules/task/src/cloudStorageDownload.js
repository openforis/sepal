const fs = require('fs')
const {Subject, EMPTY, concat, defer, of, catchError, expand, map, mergeMap, scan, switchMap} = require('rxjs')
const {fromPromise, finalize, retry, swallow} = require('#sepal/rxjs')
const {cloudStorage$} = require('./cloudStorage')
const path = require('path')
const format = require('./format')
const log = require('#sepal/log').getLogger('cloudStorage')

const CHUNK_SIZE = 10 * 1024 * 1024
const CONCURRENT_FILE_DOWNLOAD = 1

const RETRIES = 5

const do$ = (description, promise) => defer(() => {
    log.debug(description)
    return of(true).pipe(
        switchMap(() => fromPromise(promise)),
        retry(RETRIES)
    )
})
const download$ = ({bucketPath, prefix, downloadDir, deleteAfterDownload}) =>
    cloudStorage$().pipe(
        map(cloudStorage => cloudStorage.bucket(`gs://${bucketPath}`)),
        switchMap(bucket =>
            do$(
                `download: ${JSON.stringify({bucketPath, prefix, downloadDir, deleteAfterDownload})}`,
                bucket.getFiles({prefix, autoPaginate: true})
            ).pipe(
                map(response => response[0]),
                switchMap(files => concat(
                    of(getProgress({files})),
                    downloadFiles$({files, prefix, downloadDir, deleteAfterDownload})
                ))
            )
        ),
    )

const delete$ = ({bucketPath, prefix}) => {
    log.debug(() => `delete files ${bucketPath}:${prefix}`)
    return cloudStorage$().pipe(
        map(cloudStorage => cloudStorage.bucket(`gs://${bucketPath}`)),
        switchMap(bucket => bucket.deleteFiles({prefix})),
        catchError(error => {
            log.debug(() => [`Failed to delete ${bucketPath}:${prefix}`, error.message])
            return EMPTY
        }),
        swallow()
    )
}

const getProgress = ({
    files,
    currentProgress = {downloadedFiles: 0, downloadedBytes: 0},
    fileProgress = {start: 0, end: -1}
}) => {
    const downloadedFiles = currentProgress.downloadedFiles + (isDownloaded(fileProgress) ? 1 : 0)
    const downloadedBytes = currentProgress.downloadedBytes + fileProgress.end - fileProgress.start + 1
    const totalFiles = files.length
    const totalBytes = files
        .map(file => Number(file.metadata.size))
        .reduce((total, bytes) => total + bytes, 0)
    const bytesLeft = formatFileSize(totalBytes - downloadedBytes)
    return {
        downloadedFiles,
        downloadedBytes,
        totalFiles,
        totalBytes,
        defaultMessage: `Downloading - ${totalFiles} ${totalFiles > 1 ? 'files' : 'file'} / ${bytesLeft} left`,
        messageKey: 'tasks.download.progress',
        messageArgs: {bytes: bytesLeft, files: totalFiles}
    }
}

const initialState = files => getProgress({files})

const downloadFiles$ = ({files, prefix, downloadDir, deleteAfterDownload}) => {
    return of(files).pipe(
        switchMap(files => of(...files)),
        mergeMap(file => downloadFile$({file, prefix, downloadDir, deleteAfterDownload}), CONCURRENT_FILE_DOWNLOAD),
        scan((currentProgress, fileProgress) => getProgress({
            files,
            currentProgress,
            fileProgress
        }), initialState(files))
    )
}

const downloadFile$ = ({file, prefix, downloadDir, deleteAfterDownload}) => {
    const relativePath = file.metadata.name.substring(prefix.length)
    const toFilePath = prefix.endsWith('/')
        ? path.join(downloadDir, relativePath)
        : path.join(downloadDir, path.basename(prefix), relativePath)
    const downloadChunk$ = start => {
        const end = start + CHUNK_SIZE
        const chunkSubject$ = new Subject()
        const chunk$ = chunkSubject$.pipe(retry(RETRIES))
        const startTime = new Date().getTime()
        let next
        file.createReadStream({start, end})
            .on('error', error => chunkSubject$.error(error))
            .on('response', response => {
                const contentRange = response.headers['content-range']
                if (contentRange) {
                    const [, , start, end, length] = contentRange.match('(.*) (.*)-(.*)/(.*)')
                    next = {path: path.basename(toFilePath), start, end: Number(end), length: Number(length)}
                } else {
                    next = null
                }
            })
            .on('finish', _response => {
                next && chunkSubject$.next({...next, time: new Date().getTime() - startTime})
                chunkSubject$.complete()
            })
            .pipe(fs.createWriteStream(toFilePath, start ? {flags: 'a'} : {}))
        return deleteAfterDownload
            ? chunk$.pipe(finalize(() => deleteFile$(file), `Delete after download: ${file}`))
            : chunk$
    }

    return createDirs$(path.dirname(toFilePath)).pipe(
        switchMap(() =>
            downloadChunk$(0).pipe(
                expand(({end, length}) => {
                    let downloaded = isDownloaded({end, length})
                    return downloaded ? EMPTY : downloadChunk$(end + 1)
                })
            )
        )
    )
}

const deleteFile$ = file => {
    return do$(`delete file ${file.name}`, file.bucket.deleteFiles({prefix: file.name})).pipe(
        switchMap(() => EMPTY)
    )
}

const createDirs$ = path =>
    do$(`create path ${path}`, fs.promises.mkdir(path, {recursive: true}))

const isDownloaded = fileProgress =>
    fileProgress.end >= fileProgress.length - 1

const formatFileSize = bytes =>
    format.fileSize(bytes)

module.exports = {download$, delete$}
