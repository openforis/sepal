const {job} = require('#gee/jobs/job')
 
const worker$ = ({aoi}) => {
    const ee = require('#sepal/ee')
    const {toGeometry$} = require('#sepal/ee/aoi')
    const {of, switchMap} = require('rxjs')

    return toGeometry$(aoi).pipe(
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
    jobName: 'AOI Bounds',
    jobPath: __filename,
    worker$
})
