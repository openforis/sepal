const ee = require('@google/earthengine')
const {throwError} = require('rxjs')
const {catchError, switchMap, tap} = require('rxjs/operators')
const {SystemException} = require('@sepal/exception')
const getToken$ = require('@sepal/token')

const wrap$ = callback =>
    getToken$('ee').pipe(
        tap(token => console.log('TOKEN', token)),
        switchMap(() => new Promise(callback))
    )

exports.getAsset$ = eeId =>
    wrap$((resolve, reject) =>
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
    wrap$((resolve, reject) =>
        eeObject.getInfo((result, error) =>
            error
                ? reject(error)
                : resolve(result))
    )

exports.getMap$ = (eeObject, visParams) =>
    wrap$((resolve, reject) =>
        eeObject.getMap(visParams, (map, error) =>
            error
                ? reject(error)
                : resolve({
                    mapId: map.mapid,
                    token: map.token
                })
        )
    )
