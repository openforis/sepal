import {forkJoin, map, of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'
import {resolveStratificationCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'

import {exportToCSV$} from '../batch/exportToCSV.js'
import {parseGroups} from '../batch/parse.js'
import {toAreaWeightedProportions} from './areaWeightedProportions.js'

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
        map(o => o.groups),
        map(toAreaWeightedProportions)
    )

    function reduceRegion({eeGeometry, eeStratification, eeProbability}) {
        const band = eeProbability.select(probabilityBand)
        const probabilityImage = mode === 'CATEGORICAL'
            ? band.eq(targetClass)
            : band
        const pixelArea = ee.Image.pixelArea()
        // The group index is derived, not written: a reorder that left a literal behind would group on the wrong
        // band and return plausible, wrong numbers rather than failing.
        const summedBands = ['weighted', 'area']
        const bands = [...summedBands, 'stratum']
        return probabilityImage.multiply(pixelArea).rename(summedBands[0])
            .addBands(pixelArea.rename(summedBands[1]))
            .addBands(eeStratification.select(stratificationBand).rename('stratum'))
            .reduceRegion({
                reducer: ee.Reducer.sum()
                    .repeat(summedBands.length)
                    .setOutputs(summedBands)
                    .group(bands.indexOf('stratum'), 'stratum'),
                geometry: eeGeometry,
                // Proportions keeps its OWN Scale and never inherits a Stratification transform's resolution.
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
