const {job} = require('gee/jobs/job')

const worker$ = ctx => {
    const {asset, count, scale, classBand, recipe} = ctx
    const ImageFactory = require('sepal/ee/imageFactory')
    const {forkJoin, switchMap} = require('rxjs')
    const {getRows$} = require('sepal/ee/table')
    return forkJoin({
        image: ImageFactory({type: 'ASSET', id: asset}).getImage$(),
        geometry: ImageFactory(recipe).getGeometry$()
    }).pipe(
        switchMap(({image, geometry}) => {
            const samples = image.stratifiedSample({
                numPoints: parseInt(count),
                classBand: classBand || undefined,
                scale: parseInt(scale),
                region: geometry,
                geometries: true
            })
            return getRows$(samples, 'sample image')
        })
    )
}

module.exports = job({
    jobName: 'Sample image',
    jobPath: __filename,
    args: ctx => [ctx.request.body],
    worker$
})
