const {defer} = require('rxjs')
const log = require('sepal/log').getLogger('ee')
const {limiter$} = require('../eeLimiter')
const {v4: uuid} = require('uuid')
const {fromPromise} = require('sepal/rxjs')
const {retry} = require('sepal/rxjs/operators')
const {EEException} = require('sepal/ee/exception')

const MAX_RETRIES = 3

module.exports = ee => {

    const Report = (id, description) => {
        const t0 = Date.now()
        log.trace(`Earth Engine <${description}> [${id}] starting`)
        return error => {
            const t1 = Date.now()
            return `Earth Engine <${description}> [${id}] ${error ? `error: ${error}` : 'completed'} (${t1 - t0}ms)`
        }
    }

    // (operation, promiseCallback, id = uuid().substr(-4)) =>
    const $ = ({description, ee, id = uuid().substr(-4), maxRetries = MAX_RETRIES}) =>
        defer(() =>
            limiter$(
                fromPromise(new Promise(
                    (resolve, reject) => {
                        const report = Report(id, description)
                        try {
                            ee(
                                result => {
                                    log.debug(report())
                                    resolve(result)
                                },
                                error => {
                                    log.debug(report(error))
                                    reject(new EEException(error, `Failed to ${description} [${id}].`))
                                }
                            )
                        } catch (error) {
                            log.debug(report(error))
                            reject(new EEException(error, `Failed to ${description} [${id}].`))
                        }
                    })
                ).pipe(
                    retry(maxRetries)
                ), id
            )
        )

    const getAsset$ = (eeId, maxRetries) =>
        $({
            description: `get asset '${eeId}'`,
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
            description: `get info${description ? ` (${description})` : ''}`,
            ee: (resolve, reject) =>
                eeObject.getInfo((result, error) =>
                    error
                        ? reject(error)
                        : resolve(result)),
            maxRetries
        })

    const getMap$ = (eeObject, visParams, description, maxRetries) =>
        $({
            description: `get map ${description ? ` (${description})` : ''}`,
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
