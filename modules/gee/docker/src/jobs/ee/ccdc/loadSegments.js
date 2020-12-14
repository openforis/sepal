const {job} = require('root/jobs/job')

const worker$ = ({asset, latLng}) => {
    const {toGeometry} = require('sepal/ee/aoi')
    const ee = require('ee')
    const aoi = {type: 'POINT', ...latLng}
    const geometry = toGeometry(aoi)

    const segmentsForPixel$ = segments =>
        ee.getInfo$(
            segments.reduceRegion({
                reducer: ee.Reducer.first(),
                geometry,
                scale: 1
            }),
            `Get CCDC segments for pixel (${latLng})`
        )

    return segmentsForPixel$(ee.Image(asset))
}

module.exports = job({
    jobName: 'LoadCCDCSegments',
    jobPath: __filename,
    worker$
})
