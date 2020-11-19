const {job} = require('root/jobs/job')

const worker$ = ({asset, count, scale, classBand}) => {
    const ee = require('ee')
    const {getRows$} = require('sepal/ee/table')
    const image = ee.Image(asset)
    const samples = image.stratifiedSample({
        numPoints: parseInt(count),
        classBand: classBand || undefined,
        scale: parseInt(scale),
        geometries: true
    })
    return getRows$(samples, 'sample image')
}

module.exports = job({
    jobName: 'Sample image',
    jobPath: __filename,
    args: ctx => [ctx.request.query],
    worker$
})
