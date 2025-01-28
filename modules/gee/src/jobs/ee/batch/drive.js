const {google} = require('googleapis')
const {from, of, throwError, catchError, map, switchMap, tap} = require('rxjs')
const {NotFoundException} = require('#sepal/exception')
const {autoRetry} = require('#sepal/rxjs')
const moment = require('moment')
const log = require('#sepal/log').getLogger('drive')

const drive = ({sepalUser}) => {
    const {googleTokens: {accessToken, accessTokenExpiryDate}} = sepalUser
    const RETRY_CONFIG = {
        maxRetries: 5,
        minRetryDelay: 500,
        retryDelayFactor: 2
    }

    const IS_FILE = 'mimeType != "application/vnd.google-apps.folder"'
    const IS_FOLDER = 'mimeType = "application/vnd.google-apps.folder"'
    const OWNED_BY_ME = '"me" in owners'
    const IS_NOT_THRASHED = 'trashed = false'

    const createFolder$ = ({path}) =>
        getFolderByPath$({path, create: true})
    
    const readFile$ = ({path}) =>
        getFilesByPath$({path}).pipe(
            switchMap(({files: [{id}]}) => readFileById$(id))
        )

    const removeFolder$ = ({path}) =>
        getFolderByPath$({path}).pipe(
            switchMap(({id}) => removeById$({id}))
        )
        
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
    const getFilesByPath$ = ({path, pageToken}) =>
        do$(`Get files by path: ${path}`,
            getFolderByPath$({path}).pipe(
                switchMap(({id}) => getFilesByFolder$({id, pageToken}))
            )
        )

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

    const readFileById$ = id =>
        drive$(`Download file by id: ${id}`, drive =>
            drive.files.get(
                {fileId: id, alt: 'media'}
            )
        )
    
    /**
     * Remove a folder by id
     * @param {string} id Folder id
     * @return {Observable}
     */
    const removeById$ = ({id}) =>
        drive$(`Remove id: ${id}`, drive =>
            drive.files.delete({
                fileId: id
            })
        )
        
    const auth = () => {
        const oAuth2Client = new google.auth.OAuth2()
        const expiration = moment(accessTokenExpiryDate)
        log.debug(() => `Authenticating with token expiring ${expiration.fromNow()} (${expiration})`)
        oAuth2Client.setCredentials({
            access_token: accessToken
        })
        return oAuth2Client
    }

    const drive$ = (message, op) => {
        log.debug(() => message)
        const drive = google.drive({version: 'v3', auth: auth()})
        return from(op(drive)).pipe(
            map(({data}) => data),
            autoRetry(RETRY_CONFIG)
        )

    }

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

    return {createFolder$, readFile$, removeFolder$}
}

module.exports = {drive}
