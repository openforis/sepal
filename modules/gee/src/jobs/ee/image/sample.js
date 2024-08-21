const {job} = require('#gee/jobs/job')
const ee = require('sepal/src/ee')

const worker$ = ctx => {
    const {recipeToSample, count, scale, classBand, recipe, bands} = ctx
    const ImageFactory = require('#sepal/ee/imageFactory')
    const {forkJoin, switchMap} = require('rxjs')
    const {getRows$} = require('#sepal/ee/table')
    return forkJoin({
        image: ImageFactory(recipeToSample).getImage$(),
        geometry: ImageFactory(recipe).getGeometry$()
    }).pipe(
        switchMap(({image, geometry}) => {
            const toSample = classBand 
                ? image
                : image.addBands(ee.Image(0).rename('stratum'))
            const samples = toSample
                .stratifiedSample({
                    numPoints: parseInt(count),
                    classBand: classBand || 'stratum',
                    scale: parseInt(scale),
                    region: geometry,
                    geometries: true,
                    tileScale: 16
                })
            return getRows$(
                bands ? samples.select(bands) : samples.select(image.bandNames()), 
                'sample image'
            )
        })
    )
}

module.exports = job({
    jobName: 'Sample image',
    jobPath: __filename,
    args: ctx => [ctx.request.body],
    worker$
})
