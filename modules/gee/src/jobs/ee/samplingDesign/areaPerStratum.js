const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {aoi, stratification, band, scale, crs, batch},
    credentials: {sepalUser}
}) => {
    const {map, switchMap} = require('rxjs')
    const {toGeometry$} = require('#sepal/ee/aoi')
    const {exportToCSV$} = require('../batch/exportToCSV')
    const {parseGroups} = require('../batch/parse')
    const imageFactory = require('#sepal/ee/imageFactory')
    const ee = require('#sepal/ee/ee')

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

module.exports = job({
    jobName: 'Calculate area per stratum',
    jobPath: __filename,
    worker$
})
