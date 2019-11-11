const ee = require('@google/earthengine')
const {Subject, throwError} = require('rxjs')
const {catchError} = require('rxjs/operators')
const {SystemException} = require('@sepal/exception')

const wrap$ = callback => {
    const observable$ = new Subject()
    new Promise(callback)
        .then(value => {
            observable$.next(value)
            observable$.complete()
        })
        .catch(error => observable$.error(error))
    return observable$
}

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
