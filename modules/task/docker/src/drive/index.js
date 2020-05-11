const {from, of, throwError} = require('rxjs')
const {catchError, map, switchMap} = require('rxjs/operators')
const {google} = require('googleapis')
const {NotFoundException} = require('sepal/exception')

const drive$ = promise =>
    from(promise).pipe(
        map(({data}) => data)
    )

const createDir$ = (drive, name, parentId) =>
    drive$(
        drive.files.create({
            resource: {
                name,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentId]
            },
            fields: 'id'
        })
    )

const getDir$ = (drive, name, parentId, pageToken) =>
    drive$(
        drive.files.list({
            q: `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name), nextPageToken',
            spaces: 'drive',
            pageToken
        })
    ).pipe(
        switchMap(({files, nextPageToken}) =>
            files.length
                ? of({id: files[0].id}) // handling the first file
                : nextPageToken
                    ? getDir$(drive, name, parentId, nextPageToken)
                    : throwError(new NotFoundException(null, `Directory "${name}" not found ${parentId ? `in parent ${parentId}` : ''}`))
        )
    )

const getOrCreateDir$ = (drive, name, create, parentId) =>
    getDir$(drive, name, parentId).pipe(
        catchError(error =>
            error instanceof NotFoundException && create
                ? createDir$(drive, name, parentId)
                : throwError(error)
        )
    )

const getNestedDir$ = (drive, [dir, ...dirs], create, parentId) =>
    getOrCreateDir$(drive, dir, create, parentId).pipe(
        switchMap(({id}) =>
            dirs.length
                ? getNestedDir$(drive, dirs, create, id)
                : of({id})
        )
    )

const remove$ = (drive, id) =>
    drive$(
        drive.files.delete({
            fileId: id
        })
    )

const getPath$ = (drive, path, {create = false} = {}) =>
    getNestedDir$(drive, path.split('/'), create).pipe(
        catchError(error =>
            error instanceof NotFoundException
                ? throwError(new NotFoundException(error, `Path not found: '${path}'`))
                : throwError(error)
        )
    )

const removePath$ = (drive, path) =>
    getPath$(drive, path).pipe(
        switchMap(({id}) => remove$(drive, id))
    )

const getDrive = auth => {
    const drive = google.drive({
        version: 'v3',
        auth
    })

    return {
        getPath$: (path, options) => getPath$(drive, path, options),
        removePath$: path => removePath$(drive, path),
    }
}

module.exports = {getDrive}
