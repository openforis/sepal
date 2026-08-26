import _ from 'lodash'
import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import landTrendr from '#sepal/ee/timeSeries/landTrendr'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {recipe, latLng}
}) => {
    const aoi = {type: 'POINT', ...latLng}
    const segments = landTrendr(_.merge({}, recipe, {model: {aoi}}))

    return toGeometry$(aoi).pipe(
        switchMap(geometry => segments.getSegments$().pipe(
            switchMap(image =>
                ee.getInfo$(
                    image.reduceRegion({
                        reducer: ee.Reducer.first(),
                        geometry,
                        scale: 30,
                        tileScale: 16
                    }),
                    `Get LandTrendr segments for pixel (${latLng})`
                )
            )
        )),
        map(segments => _.mapValues(segments, value => value || []))
    )
}

export default job({
    jobName: 'LoadLandTrendrSegments',
    jobPath: fileName(import.meta.url),
    worker$
})
