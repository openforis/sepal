import {of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {aoi}
}) =>
    toGeometry$(aoi).pipe(
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

export default job({
    jobName: 'AOI Bounds',
    jobPath: fileName(import.meta.url),
    worker$
})
