const {defer, from, throwError} = require('rxjs')
const {catchError} = require('rxjs/operators')
const {SystemException} = require('sepal/exception')
const log = require('sepal/log').getLogger('ee')
const {limiter$} = require('../eeLimiter')
const {v4: uuid} = require('uuid')
const {retry} = require('sepal/rxjs/operators')

const MAX_RETRIES = 3

module.exports = ee => {

    const Report = (id, description) => {
        const t0 = Date.now()
        log.trace(`Earth Engine <${description}> starting [${id}]`)
        return (msg, error) => {
            const t1 = Date.now()
            return `Earth Engine <${description}> ${msg} (${t1 - t0}ms) [${id}]`
        }
    }

    // (operation, promiseCallback, id = uuid().substr(-4)) =>
    const $ = ({description, ee, id = uuid().substr(-4), maxRetries = MAX_RETRIES}) =>
        defer(() =>
            limiter$(
                from(new Promise(
                    (resolve, reject) => {
                        const report = Report(id, description)
                        try {
                            ee(
                                result => {
                                    log.debug(report('completed'))
                                    resolve(result)
                                },
                                error => {
                                    log.debug(report('returned error', error))
                                    reject(error)
                                }
                            )
                        } catch (error) {
                            log.debug(report('threw error', error))
                            reject(error)
                        }
                    })
                ).pipe(
                    retry(maxRetries)
                ), id
            )
        )

    const getAsset$ = (eeId, description) =>
        $({
            description: `get asset ${description ? ` (${description})` : ''}`,
            ee: (resolve, reject) =>
                ee.data.getAsset(eeId, (result, error) =>
                    error
                        ? reject(error)
                        : resolve(result)
                )
        }).pipe(
            catchError(cause =>
                throwError(new SystemException(cause, 'Failed to get asset', {eeId}))
            )
        )

    const getInfo$ = (eeObject, description) =>
        $({
            description: `get info${description ? ` (${description})` : ''}`,
            ee: (resolve, reject) =>
                eeObject.getInfo((result, error) =>
                    error
                        ? reject(error)
                        : resolve(result))
        })

    const getMap$ = (eeObject, visParams, description) =>
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
                )
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
