const {job} = require('#gee/jobs/job')

const worker$ = ({aoi}) => {
    const ee = require('#sepal/ee')
    const {toGeometry} = require('#sepal/ee/aoi')
    const {of} = require('rxjs')

    const geometry = toGeometry(aoi)
    if (geometry) {
        const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
        return ee.getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)]), 'get bounds')
    } else {
        return of(null)
    }
}

module.exports = job({
    jobName: 'AOI Bounds',
    jobPath: __filename,
    worker$
})
