const {job} = require('root/jobs/job')

const worker$ = ({recipe}) => {
    const ee = require('ee')
    const ImageFactory = require('sepal/ee/imageFactory')
    const {switchMap} = require('rx/operators')

    const {getGeometry$} = ImageFactory(recipe)
    return getGeometry$().pipe(
        switchMap(geometry => {
            const boundsPolygon = ee.List(geometry.bounds().coordinates().get(0))
            return ee.getInfo$(ee.List([boundsPolygon.get(0), boundsPolygon.get(2)]), 'get bounds')
        })
    )
}

module.exports = job({
    jobName: 'Bounds',
    jobPath: __filename,
    worker$
})
