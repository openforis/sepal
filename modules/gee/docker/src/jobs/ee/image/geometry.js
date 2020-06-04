const job = require('root/jobs/job')

const worker$ = ({recipe, color = '#FFFFFF50', fillColor = '#FFFFFF08'}) => {
    const ee = require('ee')
    const ImageFactory = require('sepal/ee/imageFactory')
    const {forkJoin} = require('rx')
    const {map, switchMap} = require('rx/operators')

    const {getGeometry$} = ImageFactory(recipe)
    return getGeometry$().pipe(
        switchMap(geometry => {
            const table = ee.FeatureCollection([ee.Feature(geometry)])
            const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
            return forkJoin({
                bounds: ee.getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)]), 'get bounds'),
                eeMap: ee.getMap$(table.style({color, fillColor}))
            }).pipe(
                map(({bounds, eeMap}) => ({bounds, ...eeMap}))
            )
        })
    )
}

module.exports = job({
    jobName: 'EE geometry',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ctx => [ctx.request.body],
    worker$
})
