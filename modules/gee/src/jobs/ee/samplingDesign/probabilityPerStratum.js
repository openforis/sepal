import {forkJoin, map, of, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {fileName} from '#sepal/path'
import {STRATUM_FRAME, stratumFrameQuestionOf} from '#sepal/recipe/samplingDesign/stratumFrame'

import {withDependencyEvidence$} from '../../dependencyEvidence.js'
import {userStorageSerializerService} from '../../service/userStorageSerializer.js'
import {exportToCSV$} from '../batch/exportToCSV.js'
import {parseGroups} from '../batch/parse.js'
import {toAreaWeightedProportions} from './areaWeightedProportions.js'
import {weightedAreaSums} from './weightedAreaSums.js'

// With `evidence`, the probabilities are answered with the evidence of the stratum frame this request read
// (stratumFrame.js) - which pixels belong to which stratum - and nothing about the probability source itself.
const worker$ = ({
    requestArgs: {aoi, stratification, stratificationBand = 'constant', probability, probabilityBand, mode = 'PROBABILITY', targetClass, scale, crs, batch, evidence},
    credentials: {sepalUser}
}) => {
    const description = 'probability-per-stratum'
    const probabilities$ = () => forkJoin({
        eeGeometry: toGeometry$(aoi),
        eeStratification: stratification
            ? imageFactory(stratification, {selection: [stratificationBand]}).getImage$()
            : of(ee.Image(1).rename(stratificationBand)),
        eeProbability: imageFactory(probability, {selection: [probabilityBand]}).getImage$()
    }).pipe(
        switchMap(({eeGeometry, eeStratification, eeProbability}) => {
            const eeDictionary = weightedAreaSums({
                eeGeometry, eeStratification, eeProbability,
                stratificationBand, probabilityBand, mode, targetClass, scale, crs,
                // Unstratified runs over a synthetic constant image, whose degree-scale default projection is
                // not a grid worth preserving.
                stratified: !!stratification
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
    return evidence
        ? withDependencyEvidence$({
            dependency: STRATUM_FRAME,
            question: stratumFrameQuestionOf({aoi, stratification, band: stratification ? stratificationBand : null, crs}),
            calculate$: probabilities$
        }).pipe(
            map(({result, evidence}) => ({probabilityPerStratum: result, stratumFrameEvidence: evidence}))
        )
        : probabilities$()
}

export default job({
    jobName: 'Calculate probability per stratum',
    jobPath: fileName(import.meta.url),
    services: [userStorageSerializerService],
    worker$
})
