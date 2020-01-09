const fs = require('fs')
const {Subject, EMPTY, from, of} = require('rxjs')
const {expand, map, mergeMap, switchMap, takeWhile, tap} = require('rxjs/operators')
const {cloudStorage} = require('root/cloudStorage')
const path = require('path')

// const CHUNK_SIZE = 100 * 1024 * 1024
const CHUNK_SIZE = 40 * 1024 // 10 KB

const getFileSize$ = file =>
    from(file.getMetadata()).pipe(
        map(response => response[0].size)
    )

const createDirs$ = path =>
    from(fs.promises.mkdir(path, {recursive: true}))

const downloadFile$ = (file, fromPath, toPath) => {
    const relativePath = file.metadata.name.substring(fromPath.length)
    const toFilePath = fromPath.endsWith('/')
        ? path.join(toPath, relativePath)
        : path.join(toPath, path.basename(fromPath), relativePath)
    const downloadChunk$ = start => {
        const end = start + CHUNK_SIZE
        console.log('DOWNLOADING CHUNK ', start, end)
        const chunk$ = new Subject()
        file.createReadStream({start, end})
            .on('error', error => {
                console.log('GOT AN ERROR', error)
            })
            .on('response', response => {
                const [contentRange, unit, start, end, length] = response.headers['content-range'].match('(.*) (.*)-(.*)/(.*)')
                chunk$.next({end: Number(end), length: Number(length)})
            })
            .on('end', () => {
                console.log('DOWNLOAD COMPLETE')
            })
            .pipe(fs.createWriteStream(toFilePath, start ? {flags: 'a'} : {}))
        return chunk$
    }

    return createDirs$(path.dirname(toFilePath)).pipe(
        switchMap(() =>
            downloadChunk$(0).pipe(
                expand(({end, length}) => end < length - 1 ? downloadChunk$(end + 1) : EMPTY),
                takeWhile(({end, length}) => end < length - 1)
            )
        )
    )
}

const downloadFromCloudStorage$ = ({bucketName, fromPath, toPath}) => {
    return from(cloudStorage
        .bucket(`gs://${bucketName}`)
        .getFiles({
            prefix: fromPath,
            autoPaginate: true,
        }))
        .pipe(
            switchMap(files => of(...files[0])),
            mergeMap(file => downloadFile$(file, fromPath, toPath)) // TODO: Should we globally limit concurrency, or just here?
        )

    //
    // const file = cloudStorage
    //     .bucket(`gs://${bucketName}`)
    //     .file(fromPath)
    //
    // return getFileSize$(file).pipe(
    //     switchMap(fileSize => downloadFile$(file, toPath))
    // )
}

module.exports = {downloadFromCloudStorage$}
