const {defer} = require('rxjs')
const log = require('sepal/log').getLogger('ee')
const {limiter$} = require('../eeLimiter')
const {v4: uuid} = require('uuid')
const {fromPromise} = require('sepal/rxjs')
const {retry} = require('sepal/rxjs/operators')
const {EEException} = require('sepal/ee/exception')

const MAX_RETRIES = 10

module.exports = ee => {

    const $ = ({operation, operationId = uuid().substr(-4), ee, maxRetries = MAX_RETRIES}) =>
        defer(() =>
            limiter$(
                fromPromise(
                    new Promise(
                        (resolve, reject) => {
                            const report = Report(operation, operationId)
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
                        })
                ).pipe(
                    retry(maxRetries)
                ), operationId
            )
        )

    const getAsset$ = (eeId, maxRetries) =>
        $({
            operation: `get asset '${eeId}'`,
            ee: (resolve, reject) =>
                ee.data.getAsset(eeId, (result, error) =>
                    error
                        ? reject(error)
                        : resolve(result)
                ),
            maxRetries
        })

    const getInfo$ = (eeObject, description, maxRetries) =>
        $({
            operation: `get info${description ? ` (${description})` : ''}`,
            ee: (resolve, reject) =>
                eeObject.getInfo((result, error) =>
                    error
                        ? reject(error)
                        : resolve(result)),
            maxRetries
        })

    const getMap$ = (eeObject, visParams, description, maxRetries) =>
        $({
            operation: `get map ${description ? ` (${description})` : ''}`,
            ee: (resolve, reject) =>
                eeObject.getMap(
                    visParams,
                    (map, error) => {
                        const urlTemplate = map.formatTileUrl(0, 0, 0)
                            .replace(new RegExp('(.*)/0/0/0(.*)'), '$1/{z}/{x}/{y}$2')
                        return error
                            ? reject(error)
                            : resolve({
                                mapId: map.mapid,
                                token: map.token,
                                urlTemplate
                            })
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

    return {$, getAsset$, getInfo$, getMap$, sepal}
}

const Report = (operation, operationId) => {
    const t0 = Date.now()
    const prefix = `Earth Engine <${operation}> [${operationId}]`
    log.trace(`${prefix} starting`)
    return error => {
        const t1 = Date.now()
        return `${prefix} ${error ? `error: ${error}` : 'completed'} (${t1 - t0}ms)`
    }
}

const createEEException = (error, operation, operationId) =>
    new EEException(`Failed to ${operation}: ${error}`, {
        userMessage: {
            message: `Earth Engine: ${error}`,
            key: 'gee.error.earthEngineException',
            args: {earthEngineMessage: error}
        },
        operationId
    })
