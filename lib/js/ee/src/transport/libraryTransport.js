import {catchError, defer, EMPTY, map, of, switchMap, throwError} from 'rxjs'
import {v4 as uuid} from 'uuid'

import {eeLimiter$} from '#sepal/ee/eeLimiterService'
import {createEEException} from '#sepal/ee/exception'
import * as http from '#sepal/httpClient'
import {getLogger} from '#sepal/log'
import {autoRetry, promise$} from '#sepal/rxjs'
import {tag} from '#sepal/tag'
import {applyDefaults} from '#sepal/util'

const log = getLogger('ee')

const DEFAULT_RETRY_CONFIG = {
    maxRetries: 5,
    minRetryDelay: 500,
    retryDelayFactor: 2
}

// Sends Earth Engine requests through the client library, as the credentials and project set on the library
// itself. Correct only where one process serves one user at a time, as `task` does.
export class LibraryTransport {
    #ee
    #maxRetries = DEFAULT_RETRY_CONFIG.maxRetries
    #username = null
    #authType = null

    constructor(ee) {
        this.#ee = ee
    }

    setMaxRetries(maxRetries) {
        log.debug(`Setting default max retries to ${maxRetries}`)
        this.#maxRetries = maxRetries
    }

    setUsername(username) {
        log.debug(`Setting username to ${username}`)
        this.#username = username
    }

    getAuthType() {
        return this.#authType
    }

    setAuthType(authType) {
        this.#authType = authType
    }

    $({description, operationId = uuid(), operation, maxRetries = this.#maxRetries}) {
        return defer(() =>
            of(true).pipe(
                switchMap(() =>
                    eeLimiter$(
                        promise$(
                            (resolve, reject) => {
                                const report = Report({description, operationId, username: this.#username})
                                try {
                                    if (this.#authType === 'USER' && !this.#ee.data.getAuthToken()) {
                                        log.error(this.#userTag(), `${description}: Missing authToken`)
                                    }
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
                        ), operationId, this.#username
                    )
                ),
                autoRetry(
                    applyDefaults(DEFAULT_RETRY_CONFIG, {
                        maxRetries
                    })
                )
            )
        )
    }

    getInfo$(eeObject, description, maxRetries) {
        const operationId = uuid()
        return this.$({
            description: `get info (${description})`,
            operation: (resolve, reject) => eeObject.getInfo((result, error) => error
                ? reject(createEEException(error, description, operationId))
                : resolve(result)),
            maxRetries,
            operationId
        })
    }

    getMap$(eeObject, visParams, description, maxRetries) {
        const operationId = uuid()
        return this.$({
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

    getAsset$(eeId, maxRetries = 0) {
        if (eeId.startsWith('gs://')) {
            return this.$({
                description: `get COHG (${eeId})`,
                operation: (resolve, reject) =>
                    this.#ee.Image.loadGeoTIFF(eeId).getInfo((result, error) =>
                        error
                            ? reject(error)
                            : resolve({...result, id: eeId, properties: {}})),
                maxRetries
            })
        } else {
            return this.$({
                description: `get asset (${eeId})`,
                operation: (resolve, reject) => this.#ee.data.getAsset(eeId, (result, error) => error
                    ? reject(error)
                    : resolve(result)
                ),
                maxRetries
            })
        }
    }

    getAssetRecord$(eeId, maxRetries = 0) {
        return this.$({
            description: `get asset (${eeId})`,
            operation: (resolve, reject) => {
                const call = new this.#ee.apiclient.Call((asset, error) => error ? reject(error) : resolve(asset))
                call.handle(call.assets().get(this.#ee.rpc_convert.assetIdToAssetName(eeId), {prettyPrint: false}))
            },
            maxRetries
        })
    }

    listAssetsPage$(parentEEId, pageToken, maxRetries) {
        return this.$({
            description: `list assets (${parentEEId})`,
            operation: (resolve, reject) => this.#ee.data.listAssets(parentEEId, {view: 'BASIC', pageToken}, (result, error) => {
                if (error) {
                    return reject(error)
                } else {
                    const {nextPageToken, assets: serializedAssets} = result.Serializable$values
                    const assets = serializedAssets
                        ? serializedAssets.map(({Serializable$values: {type, id, name, updateTime}}) => ({type, id, name, updateTime}))
                        : []
                    return resolve({nextPageToken, assets})
                }
            }),
            maxRetries
        })
    }

    listBuckets$(projectId, maxRetries = 0) {
        return this.$({
            description: `list buckets for (${projectId})`,
            operation: (resolve, reject) => this.#ee.data.listBuckets(projectId, (result, error) => error
                ? reject(error)
                : resolve(result)
            ),
            maxRetries
        })
    }

    listOperations$(limit, maxRetries = this.#maxRetries) {
        return this.$({
            description: 'list operations',
            operation: (resolve, reject) => this.#ee.data.listOperations(limit, (result, error) => {
                if (error) {
                    return reject(error)
                } else {
                    return resolve(result.map(({Serializable$values: values}) => values) || [])
                }
            }),
            maxRetries
        })
    }

    deleteAsset$(eeId, maxRetries = 0) {
        return this.$({
            description: `delete asset (${eeId})`,
            operation: (resolve, reject) =>
                this.#ee.data.deleteAsset(eeId, (_, error) =>
                    error
                        ? reject(error)
                        : resolve()
                ),
            maxRetries
        })
    }

    renameAsset$(eeSourceId, eeDestinationId, maxRetries = 0) {
        return this.$({
            description: `rename asset (${eeSourceId} => ${eeDestinationId})`,
            operation: (resolve, reject) =>
                this.#ee.data.renameAsset(eeSourceId, eeDestinationId, (_, error) =>
                    error
                        ? reject(error)
                        : resolve()
                ),
            maxRetries
        })
    }

    ensureAssetFolder$(parentId, assetId, maxRetries = 0) {
        const headers = {'x-goog-user-project': this.#ee.data.getProject(), Authorization: this.#ee.data.getAuthToken()}
        return http.postJson$(`https://earthengine.googleapis.com/v1/${parentId}`, {
            headers,
            query: {assetId},
            body: {type: 'FOLDER'},
            responseType: 'json',
            retry: {
                maxRetries
            }
        }).pipe(
            map(({body}) => body),
            catchError(error =>
                error?.statusCode !== 400
                    ? throwError(() => error)
                    : EMPTY
            )
        )
    }

    setAssetProperties$(eeId, properties, maxRetries = 0) {
        return this.$({
            description: `set asset properties(${eeId})`,
            operation: (resolve, reject) =>
                this.#ee.data.setAssetProperties(eeId, properties, (result, error) =>
                    error
                        ? reject(error)
                        : resolve(result)
                ),
            maxRetries
        })
    }

    createImageCollection$(eeId, properties = {}, maxRetries) {
        return defer(() => this.$({
            description: `create image collection (${eeId})`,
            operation: (resolve, reject) => this.#ee.data.createAsset({type: 'ImageCollection'}, eeId, false, properties, (_, error) => error
                ? reject(error)
                : resolve()
            ),
            maxRetries
        }))
    }

    getTaskStatus$(taskId, description, maxRetries) {
        return this.$({
            description,
            operation: (resolve, reject) =>
                this.#ee.data.getTaskStatus(taskId,
                    (status, error) => error ? reject(error) : resolve(status)
                ),
            maxRetries
        }).pipe(
            map(([status]) => status)
        )
    }

    cancelTask$(taskId, description, maxRetries) {
        return this.$({
            description,
            operation: (resolve, reject) =>
                this.#ee.data.cancelTask(taskId,
                    (_canceled, error) => error ? reject(error) : resolve()
                ),
            maxRetries
        })
    }

    // A submission Earth Engine refuses is deterministic, so it is not retried.
    startTableExport$(task, description) {
        return this.$({
            description,
            operation: (resolve, reject) => task.start(() => resolve(task.id), reject),
            maxRetries: 0
        })
    }

    #userTag() {
        return tag('User', this.#username || 'ANON')
    }
}

// For a process that sends through another transport: whatever still reaches the library's own is sent
// without credentials, so Earth Engine refuses it rather than running it as whoever initialized the library.
export const disableLibraryCredentials = ee => {
    ee.data.clearAuthToken()
    ee.data.setAuthTokenRefresher(null)
    ee.data.setParamAugmenter((params, path) => {
        log.error(`Earth Engine client library sent ${path} without credentials: this process sends through another transport`)
        return params
    })
}

const eeTag = (operation, operationId, username) => tag('EarthEngine', operation, operationId, username)

const Report = ({description, operationId, username}) => {
    const t0 = Date.now()
    const prefix = eeTag(description.trim(), operationId, username)
    log.trace(() => `${prefix} starting`)
    return error => {
        const t1 = Date.now()
        return `${prefix} ${error ? `error: ${error}` : 'completed'} (${t1 - t0}ms)`
    }
}
