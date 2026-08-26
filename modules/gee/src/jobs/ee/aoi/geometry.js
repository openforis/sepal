import {switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {aoi, color = '#FFFFFF50', fillColor = '#FFFFFF08', width = 2}
}) =>
    toGeometry$(aoi).pipe(
        switchMap(geometry => {
            const table = ee.FeatureCollection([ee.Feature(geometry)])
            return ee.getMap$(table.style({color, fillColor, width}), null, 'create AOI geometry map')
        })
    )

export default job({
    jobName: 'AOI Geometry',
    jobPath: fileName(import.meta.url),
    worker$
})
