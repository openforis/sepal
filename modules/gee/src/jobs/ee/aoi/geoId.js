import {forkJoin, map, switchMap} from 'rxjs'

import {geometryBounds$} from '#gee/jobs/ee/aoi/geometryBounds'
import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import {loadGeoIdFeature$} from '#sepal/ee/geoIdFeature'
import {fileName} from '#sepal/path'

// What the area of interest panel needs to know about a GeoID: whether it is a point, and the bounds of the
// area it resolves to. Both come from one lookup, which the operation shares.
const worker$ = ({
    requestArgs: {id, bufferMeters}
}) =>
    toGeometry$({type: 'GEOID', id, bufferMeters}).pipe(
        switchMap(geometry => forkJoin({
            geometryType: loadGeoIdFeature$(id).pipe(map(feature => feature.geometry.type)),
            bounds: geometryBounds$(geometry)
        }))
    )

export default job({
    jobName: 'AOI GeoID',
    jobPath: fileName(import.meta.url),
    worker$
})
