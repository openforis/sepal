import {of, switchMap} from 'rxjs'

import {geometryBounds$} from '#gee/jobs/ee/aoi/geometryBounds'
import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {aoi}
}) =>
    toGeometry$(aoi).pipe(
        switchMap(geometry => geometry ? geometryBounds$(geometry) : of(null))
    )

export default job({
    jobName: 'AOI Bounds',
    jobPath: fileName(import.meta.url),
    worker$
})
