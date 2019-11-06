const {Subject} = require('rxjs')
const ee = require('@google/earthengine')

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
    )

exports.getInfo$ = eeObject =>
    wrap$((resolve, reject) =>
        eeObject.getInfo((result, error) =>
            error
                ? reject(error)
                : resolve(result))
    )

exports.getMap$ = (eeImage, visParams) =>
    wrap$((resolve, reject) =>
        eeImage.getMap(visParams, (map, error) =>
            error
                ? reject(error)
                : resolve({
                    mapId: map.mapid,
                    token: map.token
                })
        )
    )
