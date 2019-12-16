const ee = require('@google/earthengine')
const {from, throwError} = require('rxjs')
const {catchError, filter} = require('rxjs/operators')
const {SystemException} = require('@sepal/exception')
const {withToken$} = require('@sepal/token')

const ee$ = promiseCallback =>
    withToken$('ee',
        from(new Promise(
            (resolve, reject) => {
                try {
                    promiseCallback(resolve, reject)
                } catch (error) {
                    reject(error)
                }
            })
        ).pipe(
            filter(value => value)
        )
    )

exports.ee$ = ee$

exports.getAsset$ = eeId =>
    ee$((resolve, reject) =>
        ee.data.getAsset(eeId, (result, error) =>
            error
                ? reject(error)
                : resolve(result))
    ).pipe(
        catchError(cause =>
            throwError(new SystemException(cause, 'Failed to get asset', {eeId}))
        )
    )

exports.getInfo$ = eeObject =>
    ee$((resolve, reject) =>
        eeObject.getInfo((result, error) =>
            error
                ? reject(error)
                : resolve(result))
    )

exports.getMap$ = (eeObject, visParams) =>
    ee$((resolve, reject) =>
        eeObject.getMap(visParams, (map, error) =>
            error
                ? reject(error)
                : resolve({
                    mapId: map.mapid,
                    token: map.token
                })
        )
    )
