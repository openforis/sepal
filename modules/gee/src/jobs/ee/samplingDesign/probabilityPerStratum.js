import {forkJoin, map, of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'
import {resolveStratificationCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {exportToCSV$} from '../batch/exportToCSV.js'
import {parseGroups} from '../batch/parse.js'

const worker$ = ({
    requestArgs: {aoi, stratification, stratificationBand = 'constant', probability, probabilityBand, mode = 'PROBABILITY', targetClass, scale, crs, batch},
    credentials: {sepalUser}
}) => {
    const description = 'probability-per-stratum'
    return forkJoin({
        eeGeometry: toGeometry$(aoi),
        eeStratification: stratification
            ? imageFactory(stratification, {selection: [stratificationBand]}).getImage$()
            : of(ee.Image(1).rename(stratificationBand)),
        eeProbability: imageFactory(probability, {selection: [probabilityBand]}).getImage$()
    }).pipe(
        switchMap(({eeGeometry, eeStratification, eeProbability}) => {
            const eeDictionary = reduceRegion({eeGeometry, eeStratification, eeProbability})
            return batch
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
        }),
        map(o => o.groups)
    )

    function reduceRegion({eeGeometry, eeStratification, eeProbability}) {
        const band = eeProbability.select(probabilityBand)
        // CATEGORICAL: mean of a 0/1 mask = fraction of sampled pixels (cells at `scale`) equal to the
        // target class. This is a PIXEL fraction, not strictly an area fraction - it approximates the
        // area fraction for equal-area projections, but not for arbitrary geographic/non-equal-area ones.
        // PROBABILITY: mean of the band value (probability/fraction image). Both are grouped by stratum
        // into a per-stratum target proportion, so the downstream toProportions pipeline is unchanged.
        const probabilityImage = mode === 'CATEGORICAL'
            ? band.eq(targetClass)
            : band
        return probabilityImage
            .addBands(eeStratification.select(stratificationBand))
            .reduceRegion({
                reducer: ee.Reducer.mean()
                    .setOutputs(['probability'])
                    .group(1, 'stratum'),
                geometry: eeGeometry,
                // Proportions estimates at its own scale in Stratification's CRS; the transform is
                // deliberately not inherited. Resolving here fails closed on an unsupported id rather than
                // silently falling back to the image projection.
                scale,
                crs: resolveStratificationCrs(crs),
                maxPixels: 1e13,
            })
    }
}

export default job({
    jobName: 'Calculate probability per stratum',
    jobPath: fileName(import.meta.url),
    worker$
})
