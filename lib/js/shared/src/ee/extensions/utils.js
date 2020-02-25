const {from, throwError} = require('rxjs')
const {catchError} = require('rxjs/operators')
const {SystemException} = require('sepal/exception')
const log = require('sepal/log').getLogger('ee')
const {limiter$} = require('../eeLimiter')

module.exports = ee => {

    const $ = (operation, promiseCallback) =>
        limiter$(
            from(new Promise(
                (resolve, reject) => {
                    try {
                        log.trace(`Earth Engine <${operation}> starting`)
                        const t0 = Date.now()
                        promiseCallback(result => {
                            const t1 = Date.now()
                            log.debug(`Earth Engine <${operation}> (${t1 - t0}ms)`)
                            resolve(result)
                        }, reject)
                    } catch (error) {
                        log.error(`Earth Engine catched error while <${operation}>`)
                        reject(error)
                    }
                })
            )
        )

    const getAsset$ = (eeId, description) =>
        $(`get asset ${description ? ` (${description})` : ''}`, (resolve, reject) =>
            ee.data.getAsset(eeId, (result, error) =>
                error
                    ? reject(error)
                    : resolve(result))
        ).pipe(
            catchError(cause =>
                throwError(new SystemException(cause, 'Failed to get asset', {eeId}))
            )
        )

    const getInfo$ = (eeObject, description) =>
        $(`get info ${description ? ` (${description})` : ''}`, (resolve, reject) =>
            eeObject.getInfo((result, error) =>
                error
                    ? reject(error)
                    : resolve(result))
        )

    const getMap$ = (eeObject, visParams, description) =>
        $(`get map ${description ? ` (${description})` : ''}`, (resolve, reject) =>
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
        )

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
