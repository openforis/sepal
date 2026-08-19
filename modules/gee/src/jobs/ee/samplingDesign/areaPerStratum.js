import {map, of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {crsGridArgs} from '#sepal/ee/samplingDesign/systematicLatticeMath'
import {fileName} from '#sepal/path'
import {resolveStratificationCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {exportToCSV$} from '../batch/exportToCSV.js'
import {parseGroups} from '../batch/parse.js'

const worker$ = ({
    requestArgs: {aoi, stratification, band, scale, crs, crsTransform, batch},
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
            // Interactive Online path: no retry, so an EE timeout fails fast and the GUI can show the
            // inline Online->Batch guidance instead of retrying past the HTTP request timeout.
            : ee.getInfo$(eeDictionary, description, 0)
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
        // This image mixes pixelArea and strata projections; an unset CRS falls back to WGS84. Evaluate on the
        // same equal-area grid the sampler uses: Stratification Scale in the Sample Arrangement CRS.
        return ee.Image.pixelArea()
            .updateMask(strata.mask())
            .addBands(strata)
            .reduceRegion({
                reducer: ee.Reducer.sum()
                    .setOutputs(['area'])
                    .group(1, 'stratum'),
                geometry,
                // Resolve at the GEE boundary, not in the GUI: non-GUI callers hit this API too, and EE
                // cannot parse the literal EPSG:6933. This is the Stratification grid, so any projected CRS
                // is legal here - the curated catalog constrains sample placement, not class interpretation.
                // crsGridArgs sends scale XOR crsTransform; EE rejects both together.
                ...crsGridArgs({crs: resolveStratificationCrs(crs), scale, crsTransform}),
                maxPixels: 1e13,
            })
    }
}

export default job({
    jobName: 'Calculate area per stratum',
    jobPath: fileName(import.meta.url),
    worker$
})
