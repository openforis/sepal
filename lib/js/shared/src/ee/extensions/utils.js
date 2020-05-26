const {defer, from} = require('rxjs')
const log = require('sepal/log').getLogger('ee')
const {limiter$} = require('../eeLimiter')
const {v4: uuid} = require('uuid')
const {retry} = require('sepal/rxjs/operators')
const {EEException} = require('sepal/ee/exception')

const MAX_RETRIES = 3

module.exports = ee => {

    const $ = ({description, ee, id = uuid().substr(-4), maxRetries = MAX_RETRIES}) =>
        defer(() =>
            limiter$(
                from(new Promise(
                    (resolve, reject) => {
                        try {
                            log.trace(`Earth Engine <${description}> starting [${id}]`)
                            const t0 = Date.now()
                            ee(
                                result => {
                                    const t1 = Date.now()
                                    log.debug(`Earth Engine <${description}> (${t1 - t0}ms) [${id}]`)
                                    resolve(result)
                                },
                                error => reject(new EEException(error, `Failed to ${description}.`))
                            )
                        } catch (error) {
                            reject(new EEException(error, `Failed to ${description}.`))
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
