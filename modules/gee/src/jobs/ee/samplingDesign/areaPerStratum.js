import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'

import {exportToCSV$} from '../batch/exportToCSV.js'
import {parseGroups} from '../batch/parse.js'

const worker$ = ({
    requestArgs: {aoi, stratification, band, scale, crs, batch},
    credentials: {sepalUser}
}) => {
    const description = 'area-per-stratum'
    return toGeometry$(aoi).pipe(
        switchMap(geometry =>
            imageFactory(stratification).getImage$().pipe(
                map(eeStratification => reduceRegion(eeStratification, geometry)),
            )
        ),
        switchMap(eeDictionary => batch
            ? exportToCSV$({
                collection: ee.FeatureCollection([ee.Feature(null, eeDictionary)]),
                description,
                selectors: ['groups'],
                sepalUser
            }).pipe(
                map(parseGroups)
            )
            : ee.getInfo$(eeDictionary, description)
        ),
        map(o => o.groups)
    )

    function reduceRegion(eeImage, geometry) {
        const strata = eeImage.select(band)
        return ee.Image.pixelArea()
            .updateMask(strata.mask())
            .addBands(strata)
            .reduceRegion({
                reducer: ee.Reducer.sum()
                    .setOutputs(['area'])
                    .group(1, 'stratum'),
                geometry,
                scale,
                crs,
                maxPixels: 1e13,
            })
    }
}

export default job({
    jobName: 'Calculate area per stratum',
    jobPath: fileName(import.meta.url),
    worker$
})
