const {defer, of, switchMap} = require('rxjs')
const {promise$, retry} = require('sepal/rxjs')
const log = require('sepal/log').getLogger('ee')
const {eeLimiter$} = require('sepal/ee/eeLimiterService')
const {v4: uuid} = require('uuid')
const {EEException} = require('sepal/ee/exception')
const {tag} = require('sepal/tag')

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
                retry(maxRetries)
            )
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

    const getAsset$ = (eeId, maxRetries) =>
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

    const deleteAsset$ = (eeId, maxRetries) =>
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

    return {setMaxRetries, setUsername, $, getAssetRoots$, getAsset$, deleteAsset$, getInfo$, getMap$, isNull, sepal}
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
