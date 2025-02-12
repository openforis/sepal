const {catchError, concat, concatMap, defer, ignoreElements, toArray, map, merge, of, switchMap, throwError, EMPTY} = require('rxjs')
const http = require('#sepal/httpClient')
const {promise$, autoRetry} = require('#sepal/rxjs')
const log = require('#sepal/log').getLogger('ee')
const {eeLimiter$} = require('#sepal/ee/eeLimiterService')
const {v4: uuid} = require('uuid')
const {createEEException} = require('#sepal/ee/exception')
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

    const $ = ({description, operationId = uuid(), operation, maxRetries = config.maxRetries}) =>
        defer(() =>
            of(true).pipe(
                switchMap(() =>
                    eeLimiter$(
                        promise$(
                            (resolve, reject) => {
                                const report = Report({description, operationId, username: config.username})
                                try {
                                    // if (sepal.getAuthType() === 'USER' && !ee.data.getAuthToken()) { // When we authenticate, this gives an error
                                    //     throw new Error(`Missing user EE authToken while: ${description}.`)
                                    // }
                                    operation(
                                        result => {
                                            log.debug(report())
                                            resolve(result)
                                        },
                                        error => {
                                            log.debug(report(error))
                                            reject(createEEException(error, description, operationId))
                                        }
                                    )
                                } catch (error) {
                                    log.debug(report(error))
                                    reject(createEEException(error, description, operationId))
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
            description: `list buckets for (${projectId})`,
            operation: (resolve, reject) => ee.data.listBuckets(projectId, (result, error) => error
                ? reject(error)
                : resolve(result)
            ),
            maxRetries
        })

    const getAsset$ = (eeId, maxRetries = 0) => {
        if (eeId.startsWith('gs://')) {
            return $({
                description: `get COHG (${eeId})`,
                operation: (resolve, reject) =>
                    ee.Image.loadGeoTIFF(eeId).getInfo((result, error) =>
                        error
                            ? reject(error)
                            : resolve({...result, id: eeId, properties: {}})),
                maxRetries
            })
        } else {
            return $({
                description: `get asset (${eeId})`,
                operation: (resolve, reject) => ee.data.getAsset(eeId, (result, error) => error
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
                    description: `set asset properties(${eeId})`,
                    operation: (resolve, reject) =>
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
            description: `list assets (${parentEEId})`,
            operation: (resolve, reject) => ee.data.listAssets(parentEEId, {...params, pageToken}, (result, error) => {
                // return reject(Error('dummy error'))
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
                return of({assets: []})
            }),
            switchMap(({nextPageToken, assets}) =>
                nextPageToken
                    ? concat(of(assets), list$(nextPageToken))
                    : of(assets)
            ),
            toArray(),
            map(array => array.flat())
        )
        return list$()
    }

    const listOperations$ = (limit, maxRetries = config.maxRetries) =>
        $({
            description: 'list operations',
            operation: (resolve, reject) => ee.data.listOperations(limit, (result, error) => {
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
            description: `delete asset (${eeId})`,
            operation: (resolve, reject) =>
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
                const headers = {'x-goog-user-project': ee.data.getProject(), Authorization: ee.data.getAuthToken()}
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

    const renameAsset$ = (eeSourceId, eeDestinationId, maxRetries = 0) =>
        $({
            description: `rename asset (${eeSourceId} => ${eeDestinationId})`,
            operation: (resolve, reject) =>
                ee.data.renameAsset(eeSourceId, eeDestinationId, (_, error) =>
                    error
                        ? reject(error)
                        : resolve()
                ),
            maxRetries
        })

    const createImageCollection$ = (eeId, properties = {}, maxRetries) =>
        defer(() => $({
            description: `create image collection (${eeId})`,
            operation: (resolve, reject) => ee.data.createAsset({type: 'ImageCollection'}, eeId, false, properties, (_, error) => error
                ? reject(error)
                : resolve()
            ),
            maxRetries
        }))

    const getInfo$ = (eeObject, description, maxRetries) => {
        const operationId = uuid()
        return $({
            description: `get info (${description})`,
            operation: (resolve, reject) => eeObject.getInfo((result, error) => error
                ? reject(createEEException(error, description, operationId))
                : resolve(result)),
            maxRetries,
            operationId
        })
    }

    const getMap$ = (eeObject, visParams, description, maxRetries) => {
        const operationId = uuid()
        return $({
            description: `get map (${description})`,
            operation: (resolve, reject) => eeObject.getMapId(
                {...visParams, format: 'png'},
                (map, error) => {
                    if (error) {
                        reject(createEEException(error, description, operationId))
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
            maxRetries,
            operationId
        })
    }

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
        deleteAssetRecursive$, createParentFolder$, createFolder$, renameAsset$, createImageCollection$, getInfo$, getMap$, isNull, mosaic, sepal}
}

const Report = ({description, operationId, username}) => {
    const t0 = Date.now()
    const prefix = eeTag(description.trim(), operationId, username)
    log.trace(() => `${prefix} starting`)
    return error => {
        const t1 = Date.now()
        return `${prefix} ${error ? `error: ${error}` : 'completed'} (${t1 - t0}ms)`
    }
}

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
    if (!root) {
        throw Error(`Malformed asset ID: ${id}`)
    }
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
