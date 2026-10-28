// What BAYTS Alerts says its alerts hold, against the image Earth Engine builds for them.
//
// Its declaration - band names, order and scalar shape - is compared with the running image's bands for a run that
// starts from its own initial alerts and for one that continues a previous run's, when asked for nothing, as a map
// layer asks with its confidence filters, for every declared band as an export asks, and for a subset in an order it
// does not build them in, which an export must return in that order. Unexpected errors fail the run. Schema only: no
// pixel value is checked.
//
// The historical reference and the previous alerts are recipes held in memory and handed to the image factory as they
// are, where a saved recipe would hold references to them: the service account reads no saved recipe, and what is
// checked is what the alerts build from them. A small area and short periods keep the runs cheap. Read-only: nothing
// is saved and no asset is written. Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/baytsAlertsOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {BAYTS_ALERT_BANDS} from '#sepal/recipe/type/baytsAlerts'

const READ_TIMEOUT_MS = 600000

const AOI = {type: 'POLYGON', path: [[-62.55, -10.05], [-62.55, -10.00], [-62.50, -10.00], [-62.50, -10.05]]}

// The radar processing options a new BAYTS historical recipe saves.
const OPTIONS = {
    orbits: ['ASCENDING', 'DESCENDING'],
    orbitNumbers: 'DOMINANT',
    geometricCorrection: 'ELLIPSOID',
    spatialSpeckleFilter: 'LEE',
    kernelSize: 9,
    sigma: 0.9,
    strongScatterers: 'RETAIN',
    strongScattererValues: [0, -5],
    snicSize: 5,
    snicCompactness: 0.15,
    multitemporalSpeckleFilter: 'NONE',
    numberOfImages: 10,
    outlierRemoval: 'MODERATE',
    mask: ['SIDES', 'FIRST_LAST'],
    minAngle: 30.88,
    maxAngle: 45.35,
    minObservations: 20
}

const HISTORICAL = {
    id: 'bayts-historical-verify',
    type: 'BAYTS_HISTORICAL',
    model: {aoi: AOI, dates: {fromDate: '2022-01-01', toDate: '2023-01-01'}, options: OPTIONS}
}

const baytsAlerts = ({monitoringEnd, previousAlerts}) => ({
    id: `bayts-alerts-verify-${monitoringEnd}`,
    type: 'BAYTS_ALERTS',
    model: {
        reference: HISTORICAL,
        date: {monitoringEnd, monitoringDuration: 2, monitoringDurationUnit: 'months'},
        options: OPTIONS,
        baytsAlertsOptions: {
            ...(previousAlerts ? {previousAlertsAsset: previousAlerts} : {}),
            normalization: 'DISABLED',
            sensitivity: 1,
            maxDays: 90,
            highConfidenceThreshold: 0.975,
            lowConfidenceThreshold: 0.85,
            minNonForestProbability: 0.6,
            minChangeProbability: 0.5
        }
    }
})

const INITIALIZED = baytsAlerts({monitoringEnd: '2023-03-01'})
const CONTINUED = baytsAlerts({monitoringEnd: '2023-05-01', previousAlerts: INITIALIZED})

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
const expectBands = async (name, recipe, args, expected) => {
    const start = Date.now()
    try {
        const built = await firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
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

    const declared = BAYTS_ALERT_BANDS.map(({name, dataType}) => ({name, arrayDimensions: dataType.arrayDimensions}))
    const names = declared.map(({name}) => name)
    const subset = ['confirmation_date', 'flag', 'change_probability']
    const filtered = {visualizationType: 'alerts', previouslyConfirmed: 'exclude', minConfidence: 'high'}

    for (const [run, recipe] of [['initialized', INITIALIZED], ['continued from previous alerts', CONTINUED]]) {
        await expectBands(`BAYTS Alerts ${run}, asked for nothing`, recipe, undefined, declared)
        await expectBands(`BAYTS Alerts ${run}, as a filtered map layer asks`, recipe, filtered, declared)
        await expectBands(`BAYTS Alerts ${run}, exported with every declared band`, recipe, withOutputBands({selection: names}), declared)
    }
    await expectBands('BAYTS Alerts exported with a subset, in the order asked', INITIALIZED, withOutputBands({selection: subset}), scalarBands(subset))

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
