const ee = require('@google/earthengine')
const {of, concatAll} = require('rxjs')
const log = require('./log')
const auth = require('./gee/auth')

const name = 'Map preview'

const job = (value, credentials) => {
    log.info('Running EE preview')
    const image = ee.Image(value)
    const map = image.getMap({})
    return concatAll([
        auth(credentials),
        of({
            mapId: map.mapid,
            token: map.token
        })
    ])
}

module.exports = {name, job}
