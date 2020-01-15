const fs = require('fs')
const {Subject, EMPTY, concat, from, of} = require('rxjs')
const {expand, finalize, map, mergeMap, scan, switchMap} = require('rxjs/operators')
const {cloudStorage} = require('root/cloudStorage')
const path = require('path')
const format = require('root/format')

const CHUNK_SIZE = 10 * 1024 * 1024
const CONCURRENT_FILE_DOWNLOAD = 1

const downloadFromCloudStorage$ = ({bucketName, prefix, toPath, deleteAfterDownload}) => {
    const bucket = cloudStorage.bucket(`gs://${bucketName}`)
    return from(bucket.getFiles({prefix, autoPaginate: true}))
        .pipe(
            map(response => response[0]),
            switchMap(files => concat(
                of(getProgress({files})),
                downloadFiles$({files, prefix, toPath, deleteAfterDownload})
            )),
            finalize(() => deleteAfterDownload ? bucket.deleteFiles({prefix}): null)
        )
}

const getProgress = (
    {
        files,
        currentProgress = {downloadedFiles: 0, downloadedBytes: 0},
        fileProgress = {start: 0, end: -1}
    }) => {
    const downloadedFiles = currentProgress.downloadedFiles + (isDownloaded(fileProgress) ? 1 : 0)
    const downloadedBytes = currentProgress.downloadedBytes + fileProgress.end - fileProgress.start + 1
    const downloaded = formatFileSize(downloadedBytes)
    const totalFiles = files.length
    const totalBytes = files
        .map(file => Number(file.metadata.size))
        .reduce((total, bytes) => total + bytes, 0)
    const total = formatFileSize(totalBytes)
    return {
        defaultMessage: `Downloaded ${downloadedFiles} of ${totalFiles} files (${downloaded} of ${total})`,
        messageKey: 'tasks.drive.download_folder',
        downloadedFiles,
        downloadedBytes,
        downloaded,
        totalFiles,
        totalBytes,
        total
    }
}

const initialState = files => getProgress({files})

const downloadFiles$ = ({files, prefix, toPath, deleteAfterDownload}) => {
    return of(files).pipe(
        switchMap(files => of(...files)),
        mergeMap(file => downloadFile$({file, prefix, toPath, deleteAfterDownload}), CONCURRENT_FILE_DOWNLOAD),
        scan((currentProgress, fileProgress) => getProgress({
            files,
            currentProgress,
            fileProgress
        }), initialState(files))
    )
}

const downloadFile$ = ({file, prefix, toPath, deleteAfterDownload}) => {
    const relativePath = file.metadata.name.substring(prefix.length)
    const toFilePath = prefix.endsWith('/')
        ? path.join(toPath, relativePath)
        : path.join(toPath, path.basename(prefix), relativePath)
    const downloadChunk$ = start => {
        const end = start + CHUNK_SIZE
        const chunk$ = new Subject()
        const startTime = new Date().getTime()
        let next
        file.createReadStream({start, end})
            .on('error', error => chunk$.error(error))
            .on('response', response => {
                const [contentRange, unit, start, end, length] = response.headers['content-range'].match('(.*) (.*)-(.*)/(.*)')
                next = {path: path.basename(toFilePath), start, end: Number(end), length: Number(length)}
            })
            .on('finish', response => {
                chunk$.next({...next, time: new Date().getTime() - startTime})
                chunk$.complete()
            })
            .pipe(fs.createWriteStream(toFilePath, start ? {flags: 'a'} : {}))
        return deleteAfterDownload
            ? concat(chunk$, deleteFile$(file))
            : chunk$
    }

    return createDirs$(path.dirname(toFilePath)).pipe(
        switchMap(() =>
            downloadChunk$(0).pipe(
                expand(({end, length}) => isDownloaded({end, length}) ? EMPTY : downloadChunk$(end + 1))
            )
        )
    )
}

const deleteFile$ = file => {
    return from(file.bucket.deleteFiles({prefix: file.name})).pipe(
        switchMap(() => EMPTY)
    )
}

const createDirs$ = path =>
    from(fs.promises.mkdir(path, {recursive: true}))

const isDownloaded = fileProgress => fileProgress.end >= fileProgress.length - 1

const formatFileSize = bytes =>
    format.fileSize(bytes)

module.exports = {downloadFromCloudStorage$}
