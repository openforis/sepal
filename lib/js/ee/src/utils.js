const ee = require('@google/earthengine')
const {from, throwError} = require('rxjs')
const {catchError} = require('rxjs/operators')
const {SystemException} = require('root/exception')
const log = require('sepalLog')('ee')
const {withLimiter$} = require('root/limiter')

const limiter$ = withLimiter$('ee/limiter')

const ee$ = (operation, promiseCallback) =>
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
                    reject(error)
                }
            })
        )
    )

const getAsset$ = eeId =>
    ee$('get asset', (resolve, reject) =>
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
    ee$('get info', (resolve, reject) =>
        eeObject.getInfo((result, error) =>
            error
                ? reject(error)
                : resolve(result))
    )

const getMap$ = (eeObject, visParams) =>
    ee$('get map', (resolve, reject) =>
        eeObject.getMap(visParams, (map, error) =>
            error
                ? reject(error)
                : resolve({
                    mapId: map.mapid,
                    token: map.token
                })
        )
    )

module.exports = {ee$, getAsset$, getInfo$, getMap$}
