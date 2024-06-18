const {catchError, concat, concatMap, defer, ignoreElements, toArray, map, merge, of, switchMap, throwError, EMPTY} = require('rxjs')
const http = require('#sepal/httpClient')
const {promise$, autoRetry} = require('#sepal/rxjs')
const log = require('#sepal/log').getLogger('ee')
const {eeLimiter$} = require('#sepal/ee/eeLimiterService')
const {v4: uuid} = require('uuid')
const {EEException} = require('#sepal/ee/exception')
const {tag} = require('#sepal/tag')
const _ = require('lodash')
const {applyDefaults} = require('../../util')

const DEFAULT_RETRY_CONFIG = {
    maxRetries: 5,
    minRetryDelay: 500,
    retryDelayFactor: 2
}

const eeTag = (operation, operationId, username) => tag('EarthEngine', operation, operationId, username)

module.exports = ee => {
    const config = {
        maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
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
        defer(() =>
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
                autoRetry(
                    applyDefaults(DEFAULT_RETRY_CONFIG, {
                        maxRetries
                    })
                )
            )
        )


    const listBuckets$ = (projectId, maxRetries = 0) => 
        $({
            operation: `list buckets for (${projectId})`,
            ee: (resolve, reject) => ee.data.listBuckets(projectId, (result, error) => error
                ? reject(error)
                : resolve(result)
            ),
            maxRetries
        })        


    const getAsset$ = (eeId, maxRetries = 0) => {
        if (eeId.startsWith('gs://')) {
            return $({
                operation: `get COHG (${eeId})`,
                ee: (resolve, reject) =>
                    ee.Image.loadGeoTIFF(eeId).getInfo((result, error) =>
                        error
                            ? reject(error)
                            : resolve({...result, id: eeId, properties: {}})),
                maxRetries
            })
        } else {
            return $({
                operation: `get asset (${eeId})`,
                ee: (resolve, reject) => ee.data.getAsset(eeId, (result, error) => error
                    ? reject(error)
                    : resolve(result)
                ),
                maxRetries
            })
        }
    }

    const replaceAssetProperties$ = (eeId, properties, maxRetries = 0) =>
        getAsset$(eeId, maxRetries).pipe(
            switchMap(asset => {
                const validProperties = _.pickBy(properties, (value, key) => _.isNumber(value) || isValidPropertyString({value, key}))
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

    const isValidPropertyString = ({value, key}) =>
        _.isString(value) && key !== 'system:index' && new Blob([value]).size <= 1024

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
            catchError(error => {
                log.warn(`Error while trying to list assets for ${parentEEId}`, error)
                return of([])
            }),
            switchMap(({nextPageToken, assets}) =>
                nextPageToken
                    ? concat(assets, list$(nextPageToken))
                    : assets),
            toArray(),
            map(array => array.flat())
        )
        return list$()
    }

    const listOperations$ = (limit, maxRetries = config.maxRetries) =>
        $({
            operation: 'list operations',
            ee: (resolve, reject) => ee.data.listOperations(limit, (result, error) => {
                if (error) {
                    return reject(error)
                } else {
                    return resolve(result.map(({Serializable$values: values}) => values) || [])
                }
            }),
            maxRetries
        })

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

    const createParentFolder$ = (eeId, maxRetries = 0) =>
        of(...getFolders(eeId)).pipe(
            concatMap(folder => {
                const MATCHER = new RegExp('(projects/.*?/assets)/(.*)')
                const [_ignore, parentId, assetId] = folder.match(MATCHER)
                const headers = {Authorization: ee.data.getAuthToken()}
                return http.postJson$(`https://earthengine.googleapis.com/v1/${parentId}`, {
                    headers,
                    query: {assetId},
                    body: {type: 'FOLDER'},
                    retries: maxRetries
                }).pipe(
                    map(({body}) => JSON.parse(body)),
                    catchError(error => {
                        if (error.statusCode !== 400) {
                            throwError(() => error)
                        }
                        return EMPTY
                    })
                )
            }),
            ignoreElements()
        )

    const createFolder$ = (eeId, maxRetries = 0) =>
        createParentFolder$(`${eeId}/`, maxRetries)

    const createImageCollection$ = (eeId, properties = {}, maxRetries) =>
        defer(() => $({
            operation: `create image collection (${eeId})`,
            ee: (resolve, reject) => ee.data.createAsset({type: 'ImageCollection'}, eeId, false, properties, (_, error) => error
                ? reject(error)
                : resolve()
            ),
            maxRetries
        }))

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
                eeObject.getMapId(
                    {...visParams, format: 'png'},
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
        const footprint = ee.Algorithms.If(
            collection.get('system:footprint'),
            collection.get('system:footprint'),
            collection.geometry().bounds()
        )
        return collection
            .select(bandNames)
            .mosaic()
            .set('system:footprint', footprint)
    }

    return {setMaxRetries, setUsername, $, listBuckets$, listAssets$, listOperations$, getAsset$, replaceAssetProperties$, deleteAsset$,
        deleteAssetRecursive$, createParentFolder$, createFolder$, createImageCollection$, getInfo$, getMap$, isNull, mosaic, sepal}
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

const getProjectAssetId = id =>
    id.startsWith('users/')
        ? `projects/earthengine-legacy/assets/${id}`
        : id

const getFolders = id => {
    const projectAssetId = getProjectAssetId(id)
    const root = getRoot(projectAssetId)
    const match = projectAssetId
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
