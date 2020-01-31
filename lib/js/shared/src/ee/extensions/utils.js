const {from, throwError} = require('rxjs')
const {catchError} = require('rxjs/operators')
const {SystemException} = require('sepal/exception')
const log = require('sepal/log')('ee')

module.exports = ee => {
    const {limiter$} = require('../eeLimiter')

    const $ = (operation, promiseCallback) =>
        // limiter$(
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
        // )

    const getAsset$ = eeId =>
        $('get asset', (resolve, reject) =>
            ee.data.getAsset(eeId, (result, error) =>
                error
                    ? reject(error)
                    : resolve(result))
        ).pipe(
            catchError(cause =>
                throwError(new SystemException(cause, 'Failed to get asset', {eeId}))
            )
        )

    const getInfo$ = eeObject =>
        $('get info', (resolve, reject) =>
            eeObject.getInfo((result, error) =>
                error
                    ? reject(error)
                    : resolve(result))
        )

    const getMap$ = (eeObject, visParams) =>
        $('get map', (resolve, reject) =>
            eeObject.getMap(visParams, (map, error) =>
                error
                    ? reject(error)
                    : resolve({
                        mapId: map.mapid,
                        token: map.token
                    })
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
