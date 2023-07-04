const {job} = require('#gee/jobs/job')

const worker$ = ({recipe}) => {
    const ee = require('#sepal/ee')
    const ImageFactory = require('#sepal/ee/imageFactory')
    const {of} = require('rxjs')
    const {switchMap} = require('rxjs')

    const {getGeometry$} = ImageFactory(recipe)
    return getGeometry$().pipe(
        switchMap(geometry => {
            if (geometry) {
                const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
                return ee.getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)]), 'get bounds')
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
