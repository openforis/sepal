const {job} = require('gee/jobs/job')

const worker$ = ({asset, count, scale, classBand}) => {
    const ImageFactory = require('sepal/ee/imageFactory')
    const {switchMap} = require('rxjs')
    const {getRows$} = require('sepal/ee/table')
    return ImageFactory({type: 'ASSET', id: asset}).getImage$().pipe(
        switchMap(image => {
            const samples = image.stratifiedSample({
                numPoints: parseInt(count),
                classBand: classBand || undefined,
                scale: parseInt(scale),
                geometries: true
            })
            return getRows$(samples, 'sample image')
        })
    )
}

module.exports = job({
    jobName: 'Sample image',
    jobPath: __filename,
    args: ctx => [ctx.request.query],
    worker$
})
