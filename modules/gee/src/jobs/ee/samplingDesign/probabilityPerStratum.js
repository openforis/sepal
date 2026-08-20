import {forkJoin, map, of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'

import {exportToCSV$} from '../batch/exportToCSV.js'
import {parseGroups} from '../batch/parse.js'
import {toAreaWeightedProportions} from './areaWeightedProportions.js'
import {weightedAreaSums} from './weightedAreaSums.js'

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
            const eeDictionary = weightedAreaSums({
                eeGeometry, eeStratification, eeProbability,
                stratificationBand, probabilityBand, mode, targetClass, scale, crs
            })
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
}

export default job({
    jobName: 'Calculate probability per stratum',
    jobPath: fileName(import.meta.url),
    worker$
})
