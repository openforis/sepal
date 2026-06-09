import {of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {recipe}
}) => {

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

export default job({
    jobName: 'Bounds',
    jobPath: fileName(import.meta.url),
    worker$
})
