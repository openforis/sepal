import {map, of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {stratificationProjection} from '#sepal/ee/samplingDesign/stratificationImage'
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
            eeSelectedBand$().pipe(
                map(selected => reduceRegion(selected, geometry)),
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
    //
    // The BAND is selected here rather than inside the reduction: its own projection is what decides the grid,
    // and Earth Engine refuses projection() on a multi-band image whose bands differ.
    function eeSelectedBand$() {
        return stratification
            ? imageFactory(stratification).getImage$().pipe(
                map(eeImage => eeImage.select(band))
            )
            : of(ee.Image(1))
    }

    function reduceRegion(selected, geometry) {
        const strata = selected.rename('stratum')
        // This image mixes pixelArea and strata projections; an unset CRS falls back to WGS84. Evaluate on the
        // Stratification projection - the same rule the draw itself uses, so an area and the design it feeds
        // can never land on different grids. The projection carries its own scale, so passing a scale
        // alongside would define a second one.
        return ee.Image.pixelArea()
            .updateMask(strata.mask())
            .addBands(strata)
            .reduceRegion({
                reducer: ee.Reducer.sum()
                    .setOutputs(['area'])
                    .group(1, 'stratum'),
                geometry,
                crs: stratificationProjection([selected.projection()], {crs, scale}),
                maxPixels: 1e13,
            })
    }
}

export default job({
    jobName: 'Calculate area per stratum',
    jobPath: fileName(import.meta.url),
    worker$
})
