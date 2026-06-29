import {map, of, switchMap} from 'rxjs'

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
            eeStrata$().pipe(
                map(strata => reduceRegion(strata, geometry)),
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

    // Unstratified (stratification: null): a single constant stratum covering the whole AOI, so the AOI
    // area is returned as [{stratum: 1, area}]. Mirrors probabilityPerStratum.js's constant-stratum path.
    function eeStrata$() {
        return stratification
            ? imageFactory(stratification).getImage$().pipe(
                map(eeImage => eeImage.select(band).rename('stratum'))
            )
            : of(ee.Image(1).rename('stratum'))
    }

    function reduceRegion(strata, geometry) {
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
