const log = require('../log')
const job = require('../job')
const geeAuth = require('./geeAuth')
const {getMap$} = require('../rxee/image')
const {toGeometry} = require('../gee/aoi')
const {allScenes} = require('../gee/optical/collection')
const {toMosaic} = require('../gee/optical/mosaic')

const worker$ = value => {
    const ee = require('@google/earthengine')
    const {from} = require('rxjs')

    log.info(`Running EE preview with value ${value}`)

    const region = toGeometry(value.recipe.model.aoi)
    const collection = allScenes({region})
    const image = toMosaic({region, collection})
    const visParams = {bands: ['B4', 'B3', 'B2'], min: 0, max: 3000, gamma: 1.5}
    return getMap$(image, visParams)
}

module.exports = job({
    jobName: 'Map preview',
    jobPath: __filename,
    before: [geeAuth],
    worker$
})
