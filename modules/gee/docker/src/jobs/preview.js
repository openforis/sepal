const log = require('../log')
const job = require('../job')
const geeAuth = require('./geeAuth')

const worker$ = value => {
    const ee = require('@google/earthengine')
    const {from} = require('rxjs')

    log.info(`Running EE preview with value ${value}`)
    
    return from(
        new Promise(resolve => {
            const image = ee.Image(value)
            image.getMap({}, map =>
                resolve({
                    mapId: map.mapid,
                    token: map.token
                })
            )
        })
    )
}

module.exports = job({
    jobName: 'Map preview',
    jobPath: __filename,
    before: [geeAuth],
    worker$
})
