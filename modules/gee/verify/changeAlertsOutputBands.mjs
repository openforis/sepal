// What Change Alerts says its changes hold, against the image Earth Engine builds for them.
//
// Its declaration - band names, order and scalar shape - is compared with the running image's bands, and with what its
// catalogue answers, over an optical CCDC reference, a Masking recipe over it and a radar CCDC reference: when asked
// for nothing, as a map layer asks, for every declared band as an export asks, and for a subset in an order it does not
// build them in, which an export must return in that order; and with every confirmation option off, which changes masks
// and never bands. Two refusals are expected and checked for their own reasons: a period without observations, which
// Earth Engine refuses as an empty collection, and a recipe stating no period, which is refused before anything is
// read. Any other error fails the run. Schema only: no pixel value is checked.
//
// The references are recipes held in memory and read through a RecipeScope of this run's own, so nothing is saved and
// no recipe service is involved. Planet sources and segments assets are not covered. A small area and short periods
// keep the runs cheap. Read-only: no asset is written. Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/changeAlertsOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, of, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'
import {CHANGE_ALERT_BANDS} from '#sepal/recipe/type/changeAlerts'

const READ_TIMEOUT_MS = 600000

const AOI = {type: 'POLYGON', path: [[-60.10, -3.18], [-60.10, -3.04], [-60.00, -3.04], [-60.00, -3.18]]}

const OPTICAL_OPTIONS = {corrections: [], cloudDetection: ['QA'], cloudMasking: 'MODERATE'}

const RADAR_OPTIONS = {
    orbits: ['DESCENDING'],
    geometricCorrection: 'ELLIPSOID',
    spatialSpeckleFilter: 'NONE',
    multitemporalSpeckleFilter: 'NONE',
    outlierRemoval: 'NONE',
    orbitNumbers: 'ALL',
    minObservations: 1
}

const CCDC_OPTIONS = {
    dateFormat: 1, minObservations: 4, chiSquareProbability: 0.9, minNumOfYearsScaler: 1.33, lambda: 20, maxIterations: 10000
}

const OPTICAL_CCDC = {
    id: 'ccdc-optical',
    type: 'CCDC',
    model: {
        aoi: AOI,
        dates: {startDate: '2020-01-01', endDate: '2022-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 75, breakpointBands: ['ndvi']},
        options: OPTICAL_OPTIONS,
        ccdcOptions: CCDC_OPTIONS
    }
}

const RADAR_CCDC = {
    id: 'ccdc-radar',
    type: 'CCDC',
    model: {
        aoi: AOI,
        dates: {startDate: '2020-01-01', endDate: '2022-01-01'},
        sources: {dataSets: {SENTINEL_1: ['SENTINEL_1']}, breakpointBands: ['VV']},
        options: RADAR_OPTIONS,
        ccdcOptions: CCDC_OPTIONS
    }
}

const MASKED_CCDC = {
    id: 'masked-ccdc',
    type: 'MASKING',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: OPTICAL_CCDC.id},
        imageMask: {type: 'ASSET', id: 'USGS/SRTMGL1_003'}
    }
}

const CATALOGUE = Object.fromEntries([OPTICAL_CCDC, RADAR_CCDC, MASKED_CCDC].map(recipe => [recipe.id, recipe]))

const PERIOD = {
    monitoringEnd: '2021-12-01',
    monitoringDuration: 1,
    monitoringDurationUnit: 'months',
    calibrationDuration: 3,
    calibrationDurationUnit: 'months'
}

const CONFIRMING = {
    minConfidence: 5, minNumberOfChanges: 3, numberOfObservations: 3,
    mustBeConfirmedInMonitoring: true, mustBeStableBeforeChange: true, mustStayChanged: true
}

const OPTICAL_SOURCES = {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 75}

const changeAlerts = ({
    reference = OPTICAL_CCDC.id, sources = OPTICAL_SOURCES, options = OPTICAL_OPTIONS, date = PERIOD, changeAlertsOptions = CONFIRMING
} = {}) => ({
    id: 'change-alerts-verify',
    type: 'CHANGE_ALERTS',
    model: {reference: {type: 'RECIPE_REF', id: reference}, sources, options, date, changeAlertsOptions}
})

const OPTICAL = changeAlerts()
const MASKED = changeAlerts({reference: MASKED_CCDC.id})
const RADAR = changeAlerts({
    reference: RADAR_CCDC.id,
    sources: {band: 'VV', dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}},
    options: RADAR_OPTIONS
})
const UNCONFIRMED = changeAlerts({changeAlertsOptions: {
    minConfidence: 1, minNumberOfChanges: 1, numberOfObservations: 1,
    mustBeConfirmedInMonitoring: false, mustBeStableBeforeChange: false, mustStayChanged: false
}})
// Landsat 8 was not yet in orbit.
const WITHOUT_OBSERVATIONS = changeAlerts({date: {...PERIOD, monitoringEnd: '2010-03-01', calibrationDuration: 1}})
const WITHOUT_PERIOD = changeAlerts({date: _.omit(PERIOD, 'monitoringEnd')})

const EMPTY_COLLECTION = /All images have been filtered out/
const NO_PERIOD = /states no complete monitoring period/

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

const inScope = fn => {
    const scope = new RecipeScope(id => of(CATALOGUE[id]))
    return withRecipeScope(scope, fn).finally(() => scope.close())
}

const builtBands$ = (recipe, args) =>
    ImageFactory(recipe, args).getImage$().pipe(
        switchMap(image => ee.getInfo$(typedBands(image), 'built bands')),
        timeout(READ_TIMEOUT_MS)
    )

const scalarBands = names => names.map(name => ({name, arrayDimensions: 0}))

// A request with no arguments passes none, rather than an empty object: the producer's own default is part of what
// it builds.
const expectBands = async (name, recipe, args, expected) => {
    const start = Date.now()
    try {
        const built = await inScope(() => firstValueFrom(builtBands$(recipe, args)))
        report(_.isEqual(built, expected), name, {ms: Date.now() - start, expected: expected.map(({name}) => name), built})
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

// Passes only when the image is refused for the reason given; building it, or failing for any other, fails.
const expectRefusal = async (name, recipe, reason) => {
    const start = Date.now()
    try {
        const built = await inScope(() => firstValueFrom(builtBands$(recipe)))
        report(false, name, {ms: Date.now() - start, expected: String(reason), built})
    } catch (error) {
        report(reason.test(error.message), name, {ms: Date.now() - start, expected: String(reason), error: error.message})
    }
}

const expectCatalogue = async (name, recipe, expected) => {
    try {
        const answered = await inScope(() => firstValueFrom(ImageFactory(recipe).getBands$()))
        report(_.isEqual(answered, expected), name, {answered})
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

const main = async () => {
    await authenticate()

    const declared = CHANGE_ALERT_BANDS.map(({name, dataType}) => ({name, arrayDimensions: dataType.arrayDimensions}))
    const names = declared.map(({name}) => name)
    const subset = ['calibration_observation_count', 'confidence', 'last_stable_date']

    await expectCatalogue('Change Alerts catalogue', OPTICAL, names)
    await expectCatalogue('Change Alerts catalogue, stating no period', WITHOUT_PERIOD, names)
    for (const [source, recipe] of [['over optical CCDC', OPTICAL], ['over Masking over CCDC', MASKED], ['over radar CCDC', RADAR]]) {
        await expectBands(`Change Alerts ${source}, asked for nothing`, recipe, undefined, declared)
        await expectBands(`Change Alerts ${source}, as a map layer asks`, recipe, {visualizationType: 'changes', mosaicType: 'latest'}, declared)
        await expectBands(`Change Alerts ${source}, exported with every declared band`, recipe, withOutputBands({selection: names}), declared)
    }
    await expectBands('Change Alerts exported with a subset, in the order asked', OPTICAL, withOutputBands({selection: subset}), scalarBands(subset))
    await expectBands('Change Alerts with every confirmation option off', UNCONFIRMED, undefined, declared)
    await expectRefusal('Change Alerts over a period without observations', WITHOUT_OBSERVATIONS, EMPTY_COLLECTION)
    await expectRefusal('Change Alerts stating no period', WITHOUT_PERIOD, NO_PERIOD)

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
