// What a Change Alerts layer's collection mosaic says it holds, against what Earth Engine builds for it.
//
// Schema. For every view - monitoring or calibration, latest or median - of an optical and a radar recipe, and for an
// optical recipe over a Masking of its CCDC: the description the shared resolver gives the COLLECTION_MOSAIC product,
// the Earth Engine catalogue and the image built for the described bands hold the same bands in the same order, all
// scalar. Schema only: no pixel value is compared for these.
//
// Pixels. A latest radar mosaic stands at the monitoring end, or for calibration at the monitoring start. At a point,
// each sample holds a number for every band, and its date bands name an acquisition: among the Sentinel-1 scenes over
// the point within Radar Mosaic's window around the target - listed independently from the scene catalogue - one has
// the sampled zero-based day of year (UTC) and lies the sampled whole number of days from the target, its absolute
// fractional distance cast to an integer; the sampled orbit is that scene's. No scene over the point lies fewer whole
// days from the target. A sample without a number, or no scene over the point, fails the check.
//
// Planet is catalogued but reported as blocked for building: the NICFI basemaps are not accessible to the service
// account. A segments asset as the reference is reported as blocked: none is accessible to it. The CCDC references are
// recipes held in memory and read through a RecipeScope of this run's own, so nothing is saved and no recipe service
// is involved. Each check reports its duration, and the run its total. Read-only: no asset is written. Authenticates
// with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/changeAlertsCollectionMosaic.mjs

import _ from 'lodash'
import moment from 'moment'
import {firstValueFrom, of, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'
import {monitoringDates} from '#sepal/recipe/changeAlerts/monitoringDates'
import {resolveImageOutput} from '#sepal/recipe/output/resolveImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {COLLECTION_MOSAIC} from '#sepal/recipe/type/changeAlerts'

const READ_TIMEOUT_MS = 300000
const WINDOW_DAYS = 183
const MILLIS_PER_DAY = 24 * 60 * 60 * 1000

const POINT = [-62.525, -10.025]
const half = 0.005
const AOI = {type: 'POLYGON', path: [
    [POINT[0] - half, POINT[1] - half], [POINT[0] - half, POINT[1] + half],
    [POINT[0] + half, POINT[1] + half], [POINT[0] + half, POINT[1] - half]
]}

const OPTICAL_OPTIONS = {
    corrections: ['SR'], compose: 'MEDOID', filters: [], orbitOverlap: 'KEEP', tileOverlap: 'QUICK_REMOVE',
    brdfMultiplier: 4, holes: 'ALLOW', snowMasking: 'ON', cloudBuffering: 0, includedCloudMasking: ['landsatCFMask'],
    landsatCFMaskCloudMasking: 'MODERATE', landsatCFMaskCloudShadowMasking: 'MODERATE',
    landsatCFMaskCirrusMasking: 'MODERATE', landsatCFMaskDilatedCloud: 'REMOVE'
}

// The radar options a new recipe saves, keeping every observation a pixel has.
const RADAR_OPTIONS = {
    orbits: ['ASCENDING', 'DESCENDING'], orbitNumbers: 'ALL', geometricCorrection: 'ELLIPSOID',
    spatialSpeckleFilter: 'NONE', kernelSize: 9, sigma: 0.9, strongScatterers: 'RETAIN', strongScattererValues: [0, -5],
    snicSize: 5, snicCompactness: 0.15, multitemporalSpeckleFilter: 'NONE', numberOfImages: 10, outlierRemoval: 'NONE',
    mask: ['SIDES', 'FIRST_LAST'], minAngle: 30.88, maxAngle: 45.35, minObservations: 1
}

const PLANET_OPTIONS = {histogramMatching: 'DISABLED', cloudThreshold: 0.15, shadowThreshold: 0.4, cloudBuffer: 0}

const CCDC_OPTIONS = {
    dateFormat: 1, minObservations: 4, chiSquareProbability: 0.9, minNumOfYearsScaler: 1.33, lambda: 20, maxIterations: 10000
}

const ccdc = (id, sources, options) => ({
    id,
    type: 'CCDC',
    model: {aoi: AOI, dates: {startDate: '2020-01-01', endDate: '2022-01-01'}, sources, options, ccdcOptions: CCDC_OPTIONS}
})

const OPTICAL_CCDC = ccdc('ccdc-optical', {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 75, breakpointBands: ['ndvi']}, OPTICAL_OPTIONS)
const RADAR_CCDC = ccdc('ccdc-radar', {dataSets: {SENTINEL_1: ['SENTINEL_1']}, breakpointBands: ['VV']}, RADAR_OPTIONS)
const MASKED_CCDC = {
    id: 'masked-ccdc',
    type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: OPTICAL_CCDC.id}, imageMask: {type: 'ASSET', id: 'USGS/SRTMGL1_003'}}
}

const CATALOGUE = Object.fromEntries([OPTICAL_CCDC, RADAR_CCDC, MASKED_CCDC].map(recipe => [recipe.id, recipe]))

const DATE = {
    monitoringEnd: '2023-03-01', monitoringDuration: 2, monitoringDurationUnit: 'months',
    calibrationDuration: 2, calibrationDurationUnit: 'months'
}

const changeAlerts = (reference, sources, options) => ({
    id: 'change-alerts-verify',
    type: 'CHANGE_ALERTS',
    model: {reference: {type: 'RECIPE_REF', id: reference}, sources, options, date: DATE, changeAlertsOptions: {}}
})

const OPTICAL = changeAlerts(OPTICAL_CCDC.id, {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 75}, OPTICAL_OPTIONS)
const OVER_MASKING = changeAlerts(MASKED_CCDC.id, OPTICAL.model.sources, OPTICAL_OPTIONS)
const RADAR = changeAlerts(RADAR_CCDC.id, {band: 'VV', dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}, RADAR_OPTIONS)
const PLANET = changeAlerts(OPTICAL_CCDC.id, {band: 'ndvi', dataSetType: 'PLANET', dataSets: {PLANET: ['NICFI']}, assets: []}, {...OPTICAL_OPTIONS, ...PLANET_OPTIONS})

const VIEWS = ['monitoring', 'calibration'].flatMap(period => ['latest', 'median'].map(mosaicType => ({period, mosaicType})))

// The arguments a layer showing this view sends.
const layerArgs = ({period, mosaicType}) => ({visualizationType: period, mosaicType})

const main = async () => {
    await authenticate()
    const started = Date.now()
    await Promise.all([
        ...VIEWS.flatMap(view => [
            check('schema', `optical ${viewName(view)}: described, catalogued and built alike`, () => schemaAgreement(OPTICAL, view)),
            check('schema', `radar ${viewName(view)}: described, catalogued and built alike`, () => schemaAgreement(RADAR, view))
        ]),
        check('schema', 'optical over Masking, monitoring latest: described, catalogued and built alike',
            () => schemaAgreement(OVER_MASKING, {period: 'monitoring', mosaicType: 'latest'})),
        check('catalogue', 'Planet monitoring latest: described and catalogued alike',
            () => catalogueAgreement(PLANET, {period: 'monitoring', mosaicType: 'latest'})),
        check('pixels', 'radar monitoring latest: the sample names the acquisition nearest the monitoring end',
            () => nearestAcquisition({period: 'monitoring', mosaicType: 'latest'}, monitoringDates(RADAR.model).monitoringEnd)),
        check('pixels', 'radar calibration latest: the sample names the acquisition nearest the monitoring start',
            () => nearestAcquisition({period: 'calibration', mosaicType: 'latest'}, monitoringDates(RADAR.model).monitoringStart))
    ].map(run => run()))
    console.info('BLOCKED building a Planet mosaic: the NICFI basemaps are not accessible to the service account')
    console.info('BLOCKED a segments asset as the reference: none is accessible to the service account')
    summarize(Date.now() - started)
    if (results.some(({passed}) => !passed)) {
        throw new Error(`${results.filter(({passed}) => !passed).length} check(s) failed`)
    }
}

const viewName = ({period, mosaicType}) => `${period} ${mosaicType}`

const schemaAgreement = async (recipe, view) => {
    const described = describedBands(recipe, view)
    const catalogued = await inScope(() => firstValueFrom(ImageFactory(recipe, layerArgs(view)).getBands$().pipe(timeout(READ_TIMEOUT_MS))))
    const built = await read('built bands', recipe, {...layerArgs(view), selection: described}, image => typedBands(image))
    const builtNames = built.map(({name}) => name)
    return judged(
        described.length > 0 && _.isEqual(described, catalogued) && _.isEqual(described, builtNames)
            && built.every(({arrayDimensions}) => arrayDimensions === 0),
        {described, ...(_.isEqual(described, catalogued) ? {} : {catalogued}), ...(_.isEqual(described, builtNames) ? {} : {built: builtNames})}
    )
}

const catalogueAgreement = async (recipe, view) => {
    const described = describedBands(recipe, view)
    const catalogued = await inScope(() => firstValueFrom(ImageFactory(recipe, layerArgs(view)).getBands$().pipe(timeout(READ_TIMEOUT_MS))))
    return judged(described.length > 0 && _.isEqual(described, catalogued), {described, catalogued})
}

// The shared description, read from the recipe alone: its CCDC is not in the graph.
const describedBands = (recipe, {period, mosaicType}) => {
    const {description, diagnostics} = resolveImageOutput({
        graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        observationFor: () => undefined,
        product: {name: COLLECTION_MOSAIC, parameters: {period, mosaicType}},
        productFor: (recipe, name) => recipeType(recipe.type)?.mapProducts?.[name]
    })
    if (!description) {
        throw new Error(`Not described: ${JSON.stringify(diagnostics)}`)
    }
    return description.output.bands.map(({name}) => name)
}

const nearestAcquisition = async (view, targetDate) => {
    const target = moment.utc(targetDate)
    const point = ee.Geometry.Point(POINT)
    const [sample, scenes] = await Promise.all([
        read('sample', RADAR, layerArgs(view), image =>
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
            target: targetDate,
            sample: _.pick(sample, ['dayOfYear', 'daysFromTarget', 'orbit']),
            shown: shown.map(({time, orbit}) => ({acquired: new Date(time).toISOString(), orbit})),
            nearestWholeDays: nearest,
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

const inScope = fn => {
    const scope = new RecipeScope(id => of(CATALOGUE[id]))
    return withRecipeScope(scope, fn).finally(() => scope.close())
}

const read = (description, recipe, args, evaluate) => inScope(() => firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
    switchMap(image => ee.getInfo$(evaluate(image), description)),
    timeout(READ_TIMEOUT_MS)
)))

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
