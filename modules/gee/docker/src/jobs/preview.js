const log = require('../log')
const job = require('../job')
const eeAuth = require('./eeAuth')
const {getMap$} = require('../rxee/image')
const {toGeometry} = require('../ee/aoi')
const {allScenes} = require('../ee/optical/collection')
const {toMosaic} = require('../ee/optical/mosaic')

const worker$ = value => {
    const ee = require('@google/earthengine')
    const {from} = require('rxjs')

    log.info(`Running EE preview with value ${value}`)

    const model = value.recipe.model
    const region = toGeometry(model.aoi)
    const dataSets = Object.values(model.sources)
        .flat()
        .map(dataSet => {
            return dataSet === 'LANDSAT_TM'
                ? ['LANDSAT_4', 'LANDSAT_5']
                : dataSet === 'LANDSAT_TM_T2'
                    ? ['LANDSAT_4_T2', 'LANDSAT_5_T2']
                    : dataSet
        })
        .flat()
    const reflectance = model.compositeOptions.corrections.includes('SR')
        ? 'SR' : 'TOA'
    const collection = allScenes({region, dataSets, reflectance})
    const image = toMosaic({region, collection})
    const visParams = {bands: ['red', 'green', 'blue'], min: 0, max: 3000, gamma: 1.5}
    return getMap$(image, visParams)
}

module.exports = job({
    jobName: 'Map preview',
    jobPath: __filename,
    before: [eeAuth],
    worker$
})
