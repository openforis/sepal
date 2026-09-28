// What LandTrendr says its change result holds, against the image Earth Engine builds for it.
//
// Its declaration - band names, order and scalar shape - is compared with the running image's bands when it is asked
// for nothing, for its changes by mode alone as a map layer asks, for every declared band as an export asks, and for
// a subset in an order it does not build them in, which an export must return in that order. Unexpected errors fail
// the run. Schema only: no pixel value is checked.
//
// A small area and a short series keep the fit cheap. Read-only: the recipe is held in memory, nothing is saved and
// no asset is written. Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/landTrendrOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {LANDTRENDR_BANDS} from '#sepal/recipe/type/landTrendr'

const READ_TIMEOUT_MS = 300000

const LANDTRENDR = {
    id: 'landtrendr-verify',
    type: 'LANDTRENDR',
    model: {
        aoi: {type: 'POLYGON', path: [[-60.10, -3.18], [-60.10, -3.14], [-60.06, -3.14], [-60.06, -3.18]]},
        dates: {startYear: 2014, endYear: 2021},
        sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'nbr'},
        options: {corrections: ['SR'], cloudDetection: ['QA'], cloudMasking: 'MODERATE', snowMasking: 'ON', compose: 'MEDIAN'},
        landTrendrOptions: {
            maxSegments: 6,
            spikeThreshold: 0.9,
            vertexCountOvershoot: 3,
            preventOneYearRecovery: false,
            recoveryThreshold: 0.25,
            pvalThreshold: 0.05,
            bestModelProportion: 0.75,
            minObservationsNeeded: 6,
            changeDirection: 'GREATEST',
            minMagnitude: 0
        }
    }
}

const callbackPromise = fn =>
    new Promise((resolve, reject) => fn((result, error) => error ? reject(new Error(error)) : resolve(result)))

const authenticate = async () => {
    await callbackPromise(callback =>
        ee.data.authenticateViaPrivateKey(serviceAccountCredentials, () => callback(true), error => callback(null, error))
    )
    await callbackPromise(callback =>
        ee.initialize(null, null, () => callback(true), error => callback(null, error), null, googleProjectId)
    )
    ee.setMaxRetries(0)
}

let failures = 0

const report = (passed, name, details) => {
    failures += passed ? 0 : 1
    console.info(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(details)}`)
}

const scalarBands = names => names.map(name => ({name, arrayDimensions: 0}))

// A request with no arguments passes none, rather than an empty object: the producer's own default is part of what
// it builds.
const expectBands = async (name, args, expected) => {
    const start = Date.now()
    try {
        const built = await firstValueFrom(ImageFactory(LANDTRENDR, args).getImage$().pipe(
            switchMap(image => ee.getInfo$(typedBands(image), 'built bands')),
            timeout(READ_TIMEOUT_MS)
        ))
        report(_.isEqual(built, expected), name, {ms: Date.now() - start, expected: expected.map(({name}) => name), built})
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

const main = async () => {
    await authenticate()

    const declared = LANDTRENDR_BANDS.map(({name, dataType}) => ({name, arrayDimensions: dataType.arrayDimensions}))
    const names = declared.map(({name}) => name)
    const subset = ['sig', 'dur', 'mag', 'yod']

    await expectBands('LandTrendr asked for nothing', undefined, declared)
    await expectBands('LandTrendr asked for its changes by mode alone', {visualizationType: 'changes'}, declared)
    await expectBands('LandTrendr exported with every declared band', withOutputBands({selection: names}), declared)
    await expectBands('LandTrendr exported with a subset, in the order asked', withOutputBands({selection: subset}), scalarBands(subset))

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
