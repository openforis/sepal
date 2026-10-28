// What a BAYTS Alerts layer's radar observation says it holds, against what the real producer builds from Sentinel-1.
//
// Schema. For the first and last positions, the description the shared resolver gives the RADAR_OBSERVATION product,
// the Earth Engine catalogue and the image built for the layer's arguments hold the same bands in the same order, all
// scalar: a point-in-time Radar Mosaic's.
//
// Pixels. At a point, each position's sample holds a number for every band, and its date bands name an acquisition:
// among the Sentinel-1 scenes over the point within Radar Mosaic's window around the position's target date - listed
// independently from the scene catalogue - one has the sampled zero-based day of year (UTC) and lies the sampled whole
// number of days from the target, as execution scores it: absolute fractional days, cast to an integer; the sampled
// orbit is that scene's. No scene over the point may lie fewer whole days from the target than the one shown: the
// mosaic keeps the smallest score among the observations valid at a pixel, and at this fixture's point the nearest
// scenes are valid - a pixel an edge or angle mask removes them from would fail here for that reason, and is listed. A
// sample without a number, or no scene over the point, fails the check.
//
// The historical reference is a recipe held in memory, so the masking execution applies over a historical asset is
// not exercised here: no BAYTS Historical asset is accessible to the service account, and it is reported as blocked.
// Each check reports its duration, and the run its total, apart from its verdict. Read-only: nothing is saved and no
// asset is written. Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/baytsAlertsRadarObservation.mjs

import _ from 'lodash'
import moment from 'moment'
import {firstValueFrom, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {RADAR_OBSERVATION} from '#sepal/recipe/type/baytsAlerts'

const READ_TIMEOUT_MS = 300000
const WINDOW_DAYS = 183
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000

const POINT = [-62.525, -10.025]
const half = 0.005
const AOI = {type: 'POLYGON', path: [
    [POINT[0] - half, POINT[1] - half], [POINT[0] - half, POINT[1] + half],
    [POINT[0] + half, POINT[1] + half], [POINT[0] + half, POINT[1] - half]
]}

// The radar options a new recipe saves.
const OPTIONS = {
    orbits: ['ASCENDING', 'DESCENDING'], orbitNumbers: 'DOMINANT', geometricCorrection: 'ELLIPSOID',
    spatialSpeckleFilter: 'LEE', kernelSize: 9, sigma: 0.9, strongScatterers: 'RETAIN', strongScattererValues: [0, -5],
    snicSize: 5, snicCompactness: 0.15, multitemporalSpeckleFilter: 'NONE', numberOfImages: 10,
    outlierRemoval: 'MODERATE', mask: ['SIDES', 'FIRST_LAST'], minAngle: 30.88, maxAngle: 45.35, minObservations: 20
}

const DATE = {monitoringEnd: '2023-03-01', monitoringDuration: 2, monitoringDurationUnit: 'months'}
const TARGETS = {first: '2023-01-01', last: '2023-03-01'}

const HISTORICAL = {
    id: 'bayts-historical-verify',
    type: 'BAYTS_HISTORICAL',
    model: {aoi: AOI, dates: {fromDate: '2022-01-01', toDate: '2023-01-01'}, options: OPTIONS}
}

const alerts = reference => ({
    id: 'bayts-alerts-verify',
    type: 'BAYTS_ALERTS',
    model: {
        reference,
        date: DATE,
        options: OPTIONS,
        baytsAlertsOptions: {
            normalization: 'DISABLED', sensitivity: 1, maxDays: 90, highConfidenceThreshold: 0.975,
            lowConfidenceThreshold: 0.85, minNonForestProbability: 0.6, minChangeProbability: 0.5
        }
    }
})

// The arguments a layer at this position sends.
const layerArgs = position => ({visualizationType: position, previouslyConfirmed: 'exclude', minConfidence: 'high'})

const main = async () => {
    await authenticate()
    const started = Date.now()
    await Promise.all(['first', 'last'].flatMap(position => [
        check('schema', `${position}: described, catalogued and built alike`, () => schemaAgreement(position)),
        check('pixels', `${position}: the sample names the acquisition nearest its target`, () => nearestAcquisition(position))
    ].map(run => run())))
    console.info('BLOCKED masking over a historical asset: no BAYTS Historical asset is accessible to the service account')
    summarize(Date.now() - started)
    if (results.some(({passed}) => !passed)) {
        throw new Error(`${results.filter(({passed}) => !passed).length} check(s) failed`)
    }
}

// The shared description is read over an asset reference, which describing never reads; execution needs one it can.
const schemaAgreement = async position => {
    const described = describedBands(alerts({type: 'ASSET', id: 'users/x/historical'}), position)
    const catalogued = await firstValueFrom(ImageFactory(alerts(HISTORICAL), layerArgs(position)).getBands$().pipe(timeout(READ_TIMEOUT_MS)))
    const built = await read('built bands', ImageFactory(alerts(HISTORICAL), layerArgs(position)), image => typedBands(image))
    const builtNames = built.map(({name}) => name)
    return judged(
        described.length > 0 && _.isEqual(described, catalogued) && _.isEqual(described, builtNames)
            && built.every(({arrayDimensions}) => arrayDimensions === 0),
        {described, catalogued, built: builtNames}
    )
}

const describedBands = (recipe, position) => {
    const {description, diagnostics} = resolveImageOutput({
        graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: () => undefined,
        product: {name: RADAR_OBSERVATION, parameters: {position}},
        productFor: (recipe, name) => recipeType(recipe.type)?.mapProducts?.[name]
    })
    if (!description) {
        throw new Error(`Not described: ${JSON.stringify(diagnostics)}`)
    }
    return description.output.bands.map(({name}) => name)
}

const nearestAcquisition = async position => {
    const target = moment.utc(TARGETS[position])
    const point = ee.Geometry.Point(POINT)
    const [sample, scenes] = await Promise.all([
        read('sample', ImageFactory(alerts(HISTORICAL), layerArgs(position)), image =>
            image.reduceRegion({reducer: ee.Reducer.first(), geometry: point, scale: 10})),
        acquisitions(point, target)
    ])
    const unusable = ['VV', 'VH', 'ratio_VV_VH', 'orbit', 'dayOfYear', 'daysFromTarget'].filter(band => !Number.isFinite(sample?.[band]))
    if (unusable.length || !scenes.length) {
        return judged(false, {unusable, scenes: scenes.length})
    }
    const scored = scenes.map(({time, orbit}) => ({
        time,
        orbit,
        dayOfYear: moment.utc(time).dayOfYear() - 1,
        wholeDays: Math.trunc(Math.abs(time - target.valueOf()) / MILLIS_PER_DAY)
    }))
    const shown = scored.filter(({dayOfYear, wholeDays}) => dayOfYear === sample.dayOfYear && wholeDays === sample.daysFromTarget)
    const nearest = _.minBy(scored, 'wholeDays').wholeDays
    return judged(
        shown.length > 0 && sample.daysFromTarget === nearest && shown.some(({orbit}) => orbit === sample.orbit),
        {
            target: TARGETS[position],
            sample: _.pick(sample, ['dayOfYear', 'daysFromTarget', 'orbit']),
            shown: shown.map(({time, orbit}) => ({acquired: new Date(time).toISOString(), orbit})),
            nearestWholeDays: nearest,
            nearer: scored.filter(({wholeDays}) => wholeDays < sample.daysFromTarget)
                .map(({time, orbit}) => ({acquired: new Date(time).toISOString(), orbit})),
            scenes: scenes.length
        }
    )
}

// The Sentinel-1 scenes over a point within Radar Mosaic's window around a target, as the scene catalogue lists them.
const acquisitions = async (point, target) => {
    const collection = ee.ImageCollection('COPERNICUS/S1_GRD')
        .filterBounds(point)
        .filterDate(target.clone().subtract(WINDOW_DAYS, 'days').format('YYYY-MM-DD'), target.clone().add(WINDOW_DAYS, 'days').format('YYYY-MM-DD'))
        .filter(ee.Filter.eq('instrumentMode', 'IW'))
        .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
        .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
    const {times, orbits} = await firstValueFrom(ee.getInfo$(ee.Dictionary({
        times: collection.aggregate_array('system:time_start'),
        orbits: collection.aggregate_array('relativeOrbitNumber_start')
    }), 'acquisitions').pipe(timeout(READ_TIMEOUT_MS)))
    return times.map((time, i) => ({time, orbit: orbits[i]}))
}

const read = (description, producer, evaluate) => firstValueFrom(producer.getImage$().pipe(
    switchMap(image => ee.getInfo$(evaluate(image), description)),
    timeout(READ_TIMEOUT_MS)
))

const judged = (passed, details) => ({passed: Boolean(passed), details})

const results = []

const check = (group, name, run) => async () => {
    const start = Date.now()
    const {passed, details} = await Promise.resolve().then(run).catch(error => judged(false, {error: error.message.split('\n')[0]}))
    const ms = Date.now() - start
    results.push({group, name, passed, ms})
    console.info(`${passed ? 'PASS' : 'FAIL'} [${group}] ${name}: ${JSON.stringify({ms, ...details})}`)
}

const summarize = ms => {
    console.info('Summary')
    _.forEach(_.groupBy(results, 'group'), (groupResults, group) => {
        const failed = groupResults.filter(({passed}) => !passed).length
        console.info(`  ${group}: ${groupResults.length - failed} passed, ${failed} failed`)
    })
    const slowest = _.maxBy(results, 'ms')
    console.info(`Duration: ${Math.round(ms / 1000)} s; slowest check ${Math.round(slowest.ms / 1000)} s (${slowest.name})`)
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

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
