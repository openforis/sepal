import {forkJoin, map, of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'

import {exportToCSV$} from '../batch/exportToCSV.js'
import {parseGroups} from '../batch/parse.js'

const worker$ = ({
    requestArgs: {aoi, stratification, stratificationBand = 'constant', probability, probabilityBand, scale, crs, batch},
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
                : ee.getInfo$(eeDictionary, description)
        }),
        map(o => o.groups)
    )

    function reduceRegion({eeGeometry, eeStratification, eeProbability}) {
        return eeProbability.select(probabilityBand)
            .addBands(eeStratification.select(stratificationBand))
            .reduceRegion({
                reducer: ee.Reducer.mean()
                    .setOutputs(['probability'])
                    .group(1, 'stratum'),
                geometry: eeGeometry,
                scale,
                crs,
                maxPixels: 1e13,
            })
    }
}

export default job({
    jobName: 'Calculate probability per stratum',
    jobPath: fileName(import.meta.url),
    worker$
})
