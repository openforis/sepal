const {catchError, concat, defer, map, merge, of, switchMap, throwError, toArray} = require('rxjs')
const {promise$, retry} = require('#sepal/rxjs')
const log = require('#sepal/log').getLogger('ee')
const {eeLimiter$} = require('#sepal/ee/eeLimiterService')
const {v4: uuid} = require('uuid')
const {EEException} = require('#sepal/ee/exception')
const {tag} = require('#sepal/tag')
const _ = require('lodash')

const DEFAULT_MAX_RETRIES = 5

const eeTag = (operation, operationId, username) => tag('EarthEngine', operation, operationId, username)

module.exports = ee => {
    const config = {
        maxRetries: DEFAULT_MAX_RETRIES,
        username: null
    }

    const setMaxRetries = maxRetries => {
        log.debug(`Setting default max retries to ${maxRetries}`)
        config.maxRetries = maxRetries
    }

    const setUsername = username => {
        log.debug(`Setting username to ${username}`)
        config.username = username
    }

    const $ = ({operation, operationId = uuid(), ee, maxRetries = config.maxRetries}) =>
        of(true).pipe(
            switchMap(() =>
                eeLimiter$(
                    promise$(
                        (resolve, reject) => {
                            const report = Report({operation, operationId, username: config.username})
                            try {
                                ee(
                                    result => {
                                        log.debug(report())
                                        resolve(result)
                                    },
                                    error => {
                                        log.debug(report(error))
                                        reject(createEEException(error, operation, operationId))
                                    }
                                )
                            } catch (error) {
                                log.debug(report(error))
                                reject(createEEException(error, operation, operationId))
                            }
                        }
                    ), operationId, config.username
                )
            ),
            retry(maxRetries)
        )

    const getAssetRoots$ = maxRetries =>
        $({
            operation: 'get asset roots',
            ee: (resolve, reject) =>
                ee.data.getAssetRoots(
                    (assetRoots, error) =>
                        error
                            ? reject(error)
                            : resolve(assetRoots.map(({id}) => id))
                ),
            maxRetries
        })

    const getAsset$ = (eeId, maxRetries = 0) =>
        $({
            operation: `get asset (${eeId})`,
            ee: (resolve, reject) =>
                ee.data.getAsset(eeId, (result, error) =>
                    error
                        ? reject(error)
                        : resolve(result)
                ),
            maxRetries
        })

    const replaceAssetProperties$ = (eeId, properties, maxRetries = 0) =>
        getAsset$(eeId, maxRetries).pipe(
            switchMap(asset => {
                const validProperties = _.pickBy(properties, (value, key) => (_.isNumber(value) || _.isString(value)) && key !== 'system:index')
                const currentKeys = Object.keys(asset.properties)
                const newKeys = Object.keys(validProperties)
                currentKeys.forEach(key => newKeys.includes(key) || (validProperties[key] = undefined))
                return $({
                    operation: `set asset properties(${eeId})`,
                    ee: (resolve, reject) =>
                        ee.data.setAssetProperties(eeId, validProperties, (result, error) =>
                            error
                                ? reject(error)
                                : resolve(result)
                        ),
                    maxRetries
                })
            })
        )

    const listAssets$ = (parentEEId, maxRetries) => {
        const params = {view: 'BASIC'}
        const TYPE_MAP = {
            'FOLDER': 'Folder',
            'IMAGE': 'Image',
            'IMAGE_COLLECTION': 'ImageCollection',
            'TABLE': 'Table'
        }
        const list$ = pageToken => $({
            operation: `list assets (${parentEEId})`,
            ee: (resolve, reject) => ee.data.listAssets(parentEEId, {...params, pageToken}, (result, error) => {
                if (error) {
                    return reject(error)
                } else {
                    const {nextPageToken, assets: serializedAssets} = result.Serializable$values
                    const assets = serializedAssets
                        ? serializedAssets.map(({Serializable$values: {type, id, name}}) => ({type: TYPE_MAP[type], id, name}))
                        : []
                    return resolve({nextPageToken, assets})
                }
            }),
            maxRetries
        }).pipe(
            switchMap(({nextPageToken, assets}) =>
                nextPageToken
                    ? concat(assets, list$(nextPageToken))
                    : assets),
            toArray(),
            map(array => array.flat())
        )
        return list$()
    }

    const deleteChildrenRecursive$ = (eeId, includeTypes, maxRetries) =>
        getAsset$(eeId, maxRetries).pipe(
            catchError(() => of({})),
            switchMap(({type}) =>
                type && includeTypes.length && !includeTypes.includes(type)
                    ? throwError(() => new Error(`Only ${includeTypes} can be removed. Found: ${type}`))
                    : ['Folder', 'ImageCollection'].includes(type)
                        ? listAssets$(eeId, maxRetries).pipe(
                            switchMap(childAssets =>
                                childAssets.length
                                    ? merge(...childAssets
                                        .map(({id}) => deleteAssetRecursive$(id, includeTypes, maxRetries))
                                    )
                                    : of()
                            )
                        )
                        : of()
            )
        )

    const deleteAssetRecursive$ = (eeId, includeTypes = [], maxRetries = 0) =>
        concat(
            deleteChildrenRecursive$(eeId, includeTypes, maxRetries),
            deleteAsset$(eeId, maxRetries)
        )

    const deleteAsset$ = (eeId, maxRetries = 0) =>
        $({
            operation: `delete asset (${eeId})`,
            ee: (resolve, reject) =>
                ee.data.deleteAsset(eeId, (_, error) =>
                    error
                        ? reject(error)
                        : resolve()
                ),
            maxRetries
        })

    const createAssetFolders$ = (eeId, maxRetries) => {
        const folders = getFolders(eeId)
        return concat(...folders.map(folder => {
            return defer(() => $({
                operation: `create asset folder(${folder})`,
                ee: (resolve, reject) => ee.data.createFolder(folder, false, (_, error) => error
                    ? reject(error)
                    : resolve()
                ),
                maxRetries
            }))
        }))
    }

    const createImageCollection$ = (eeId, properties = {}, maxRetries) => {
        return defer(() => $({
            operation: `create image collection (${eeId})`,
            ee: (resolve, reject) => ee.data.createAsset({type: 'ImageCollection'}, eeId, false, properties, (_, error) =>
                error
                    ? reject(error)
                    : resolve()
            ),
            maxRetries
        }))
    }

    const getInfo$ = (eeObject, description, maxRetries) =>
        $({
            operation: `get info (${description})`,
            ee: (resolve, reject) =>
                eeObject.getInfo((result, error) =>
                    error
                        ? reject(error)
                        : resolve(result)),
            maxRetries
        })

    const getMap$ = (eeObject, visParams, description, maxRetries) =>
        $({
            operation: `get map (${description})`,
            ee: (resolve, reject) =>
                eeObject.getMap(
                    visParams,
                    (map, error) => {
                        if (error) {
                            reject(error)
                        } else {
                            const urlTemplate = map.formatTileUrl(0, 0, 0)
                                .replace(new RegExp('(.*)/0/0/0(.*)'), '$1/{z}/{x}/{y}$2')
                            resolve({
                                mapId: map.mapid,
                                token: map.token,
                                urlTemplate,
                                visParams
                            })
                        }
                    }
                ),
            maxRetries
        })

    const sepal = {
        getAuthType() {
            return this.authType
        },
        setAuthType(authType) {
            this.authType = authType
        }
    }

    const isNull = o =>
        ee.List([o]).map(o => o, true).size().eq(0)

    const mosaic = collection => {
        const bandNames = collection
            .merge(ee.ImageCollection([ee.Image([])]))
            .first()
            .bandNames()
        return collection
            .select(bandNames)
            .mosaic()
    }

    return {setMaxRetries, setUsername, $, getAssetRoots$, listAssets$, getAsset$, replaceAssetProperties$, deleteAsset$, deleteAssetRecursive$, createAssetFolders$, createImageCollection$, getInfo$, getMap$, isNull, mosaic, sepal}
}

const Report = ({operation, operationId, username}) => {
    const t0 = Date.now()
    const prefix = eeTag(operation.trim(), operationId, username)
    log.trace(() => `${prefix} starting`)
    return error => {
        const t1 = Date.now()
        return `${prefix} ${error ? `error: ${error}` : 'completed'} (${t1 - t0}ms)`
    }
}

const createEEException = (error, operation, operationId) =>
    new EEException(`Failed to ${operation}: ${error}`, {
        cause: error,
        userMessage: {
            message: `Earth Engine: ${error}`,
            key: 'gee.error.earthEngineException',
            args: {earthEngineMessage: error}
        },
        operationId
    })
    
const getRoot = id => {
    var match = id.match(/^(projects\/.*?\/assets)\/.*/)
        || id.match(/^(users\/.*?)\/.*/)
    return match && match[1]
}

const getFolders = id => {
    const root = getRoot(id)
    const match = id
        .slice(root.length)
        .match(/^(\/.*)\/.*/)
    const names = match
        ? match[1].split('/').filter(name => name)
        : []
    return names.reduce(
        (acc, name) => acc.length
            ? [...acc, `${acc[acc.length - 1]}/${name}`]
            : [`${root}/${name}`],
        []
    )
}
