const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {recipe}
}) => {
    const ee = require('#sepal/ee/ee')
    const ImageFactory = require('#sepal/ee/imageFactory')
    const {of} = require('rxjs')
    const {switchMap} = require('rxjs')

    const {getGeometry$} = ImageFactory(recipe)
    return getGeometry$().pipe(
        switchMap(geometry => {
            if (geometry) {
                const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
                const bounds = ee.Algorithms.If(
                    geometry.isUnbounded(),
                    [[-180, -90], [180, 90]],
                    [boundsPolygon.get(0), boundsPolygon.get(2)]
                )
                return ee.getInfo$(bounds, 'get bounds')
            } else {
                return of(null)
            }
        })
    )
}

module.exports = job({
    jobName: 'Bounds',
    jobPath: __filename,
    worker$
})
