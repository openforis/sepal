// What a BAYTS Historical says it holds, against the image Earth Engine builds for it from real Sentinel-1 imagery,
// and what BAYTS makes of a history with a pass masked.
//
// Fixtures. Small areas around a point: the Netherlands, with both passes; the Amazon, whose ascending pass was
// never acquired; Paraguay in 2024, with no scene of either pass. Each area's scenes are established first, as
// preconditions, with a query independent of the one execution filters with.
//
// Schema. In the Netherlands, for each pass alone, both passes either way round, spatial speckle filtering off and
// QUEGAN and RABASAR multitemporal filtering, the catalogue answers the declared bands in stored orbit order, and
// nothing, an empty selection or a bare selection builds exactly those, scalar. Output bands out of order come back
// as asked, directly and through a Masking; an unbuilt band is refused for that band.
//
// Pass correctness. Each pass of a history of both, with LEE, either way round, without spatial filtering, with
// QUEGAN, with RABASAR and with `orbitNumbers: 'ALL'`, must hold exactly what a freshly built history of that pass
// alone holds, band for band at a point, with a number for every band; each pass's orbit must be among that pass's
// relative orbits over the point.
//
// A pass without scenes. In the Amazon, a history of both passes, with LEE and with QUEGAN, builds every declared
// band: the ascending pass's are masked throughout the area, the descending pass's equal a freshly built
// descending-only history's, and the image stays bounded. Asked for the descending pass alone, or the ascending pass
// alone, it returns those bands in the order asked, the latter masked. A history of the ascending pass alone there,
// and one of both passes in Paraguay, however asked, are refused as having no images. A pass whose scenes leave no
// valid pixel - too few observations - is masked, not refused. BAYTS Alerts over the Amazon history of both passes
// alerts exactly as over a descending-only history, pixel by pixel as below.
//
// Alerts over a masked pass. In the Netherlands, over a monitoring period ending just after an ascending scene, BAYTS
// is run with both passes over the history of both, and over that history with its ascending pass masked, and with
// the descending pass over a descending-only history, with normalization off and on and continuing initial alerts.
// Their alerts, masked the way BAYTS Alerts masks them - by the history's valid bands - are compared pixel by pixel
// on one grid over the area, every band: a masked ascending pass must give exactly the descending-only alerts, with
// no pixel whose mask differs and no difference where both are valid, and a valid one must differ from them. A
// comparison needs pixels valid in both images for every band, or it fails.
//
// Checks are grouped: a pass-correctness or alert failure shows the per-pass construction reading the wrong
// imagery, a missing-pass failure the treatment of a pass without scenes. Each check reports its duration, and the
// run its total, apart from correctness. Any unexpected error fails the run. Read-only: recipes are held in memory,
// nothing is saved and no asset is written. Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/baytsHistoricalOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, map, of, switchMap, timeout, zip} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import {bayts} from '#sepal/ee/bayts/bayts'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'
import {baytsHistoricalBandNames, HISTORICAL_STATISTICS, ORBIT_SUFFIXES} from '#sepal/recipe/type/baytsHistorical'

import {different, identical, pixelComparison} from './pixelComparison.mjs'

const READ_TIMEOUT_MS = 600000
const CONCURRENCY = 8

const HISTORY = {fromDate: '2023-01-01', toDate: '2024-01-01'}
const NETHERLANDS = {point: [5.3, 52.1], dates: HISTORY}
const AMAZON = {point: [-60.05, -3.1], dates: HISTORY}
const PARAGUAY = {point: [-58, -23], dates: {fromDate: '2024-01-01', toDate: '2025-01-01'}}

// Ends two days after an ascending scene of the Netherlands' dominant ascending orbit (161, 2024-03-21).
const MONITORING = {startDate: '2024-01-01', endDate: '2024-03-22'}
const INITIAL_MONITORING = {startDate: '2023-10-01', endDate: '2024-01-01'}

// The options a new recipe saves.
const DEFAULT_OPTIONS = {
    orbitNumbers: 'DOMINANT', geometricCorrection: 'ELLIPSOID', spatialSpeckleFilter: 'LEE', kernelSize: 9, sigma: 0.9,
    strongScatterers: 'RETAIN', strongScattererValues: [0, -5], snicSize: 5, snicCompactness: 0.15,
    multitemporalSpeckleFilter: 'NONE', numberOfImages: 10, outlierRemoval: 'MODERATE', mask: ['SIDES', 'FIRST_LAST'],
    minAngle: 30.88, maxAngle: 45.35, minObservations: 20
}

const ASCENDING = ['ASCENDING']
const DESCENDING = ['DESCENDING']
const BOTH = ['ASCENDING', 'DESCENDING']
const NO_IMAGES = /All images have been filtered out/

const box = ([x, y], half = 0.002) => [[x - half, y - half], [x - half, y + half], [x + half, y + half], [x + half, y - half]]
const pointOf = ({point}) => ee.Geometry.Point(point)
const areaOf = ({point}) => ee.Geometry.Polygon([box(point)], null, false)

let historyIds = 0

const historical = (area, options) => ({
    id: `historical-verify-${++historyIds}`,
    type: 'BAYTS_HISTORICAL',
    model: {aoi: {type: 'POLYGON', path: box(area.point)}, dates: area.dates, options: {...DEFAULT_OPTIONS, ...options}}
})

const passBands = pass => HISTORICAL_STATISTICS.map(statistic => `${statistic}_${ORBIT_SUFFIXES[pass]}`)

const main = async () => {
    await authenticate()
    const started = Date.now()
    const scenes = await sceneOrbits()
    await inPool([
        ...fixtureChecks(scenes),
        ...schemaChecks(),
        ...passCorrectnessChecks(scenes),
        ...missingPassChecks(),
        ...alertChecks()
    ], CONCURRENCY)
    summarize(Date.now() - started)
    if (results.some(({passed}) => !passed)) {
        throw new Error(`${results.filter(({passed}) => !passed).length} check(s) failed`)
    }
}

// Each area's relative orbits per pass over its point in its window, read from the scene catalogue.
const sceneOrbits = async () => Object.fromEntries(await Promise.all(
    Object.entries({NETHERLANDS, AMAZON, PARAGUAY}).map(async ([name, area]) => [name, await read('scenes', ee.Dictionary(
        Object.fromEntries(BOTH.map(pass => [pass, ee.ImageCollection('COPERNICUS/S1_GRD')
            .filterBounds(pointOf(area))
            .filterDate(area.dates.fromDate, area.dates.toDate)
            .filter(ee.Filter.eq('orbitProperties_pass', pass))
            .filter(ee.Filter.eq('instrumentMode', 'IW'))
            .aggregate_array('relativeOrbitNumber_start')
            .distinct()]))
    ))])
))

const fixtureChecks = scenes => [
    check('fixture', 'the Netherlands has scenes of both passes', () =>
        judged(scenes.NETHERLANDS.ASCENDING.length && scenes.NETHERLANDS.DESCENDING.length, scenes.NETHERLANDS)),
    check('fixture', 'the Amazon has descending scenes only', () =>
        judged(!scenes.AMAZON.ASCENDING.length && scenes.AMAZON.DESCENDING.length, scenes.AMAZON)),
    check('fixture', 'Paraguay has no scene of either pass', () =>
        judged(!scenes.PARAGUAY.ASCENDING.length && !scenes.PARAGUAY.DESCENDING.length, scenes.PARAGUAY))
]

const schemaChecks = () => {
    const configurations = [
        ['ascending', {orbits: ASCENDING}],
        ['descending', {orbits: DESCENDING}],
        ['both passes', {orbits: BOTH}],
        ['both passes, stored descending first', {orbits: ['DESCENDING', 'ASCENDING']}],
        ['both passes without spatial speckle filtering', {orbits: BOTH, spatialSpeckleFilter: 'NONE'}],
        ['both passes, QUEGAN', {orbits: BOTH, multitemporalSpeckleFilter: 'QUEGAN'}],
        ['both passes, RABASAR', {orbits: BOTH, multitemporalSpeckleFilter: 'RABASAR'}]
    ]
    const both = historical(NETHERLANDS, {orbits: BOTH})
    return [
        ...configurations.flatMap(([label, options]) => {
            const recipe = historical(NETHERLANDS, options)
            const declared = baytsHistoricalBandNames(recipe.model)
            return [
                check('schema', `${label}: catalogue`, async () => {
                    const answered = await firstValueFrom(ImageFactory(recipe).getBands$())
                    return judged(_.isEqual(answered, declared), {answered})
                }),
                ...[['asked for nothing', undefined], ['an empty selection', {selection: []}], ['a bare selection', {selection: [declared[0]]}]]
                    .map(([request, args]) => check('schema', `${label}: ${request}`, () => builtAs(recipe, args, declared)))
            ]
        }),
        check('schema', 'output bands out of order', () =>
            builtAs(both, withOutputBands({selection: ['VH_std_desc', 'VV_mean_asc']}), ['VH_std_desc', 'VV_mean_asc'])),
        check('schema', 'output bands out of order, through a Masking', () => inScope({[both.id]: both}, () =>
            builtAs(maskingOf(both), withOutputBands({selection: ['orbit_desc', 'VV_mean_asc']}), ['orbit_desc', 'VV_mean_asc']))),
        check('schema', 'an output band it does not build', () =>
            refusedAs(both, withOutputBands({selection: ['VV_mean_asc', 'nope']}), /'nope' did not match/))
    ]
}

const passCorrectnessChecks = scenes => {
    const fresh = _.memoize(
        (options, pass) => evidence(historical(NETHERLANDS, {...options, orbits: [pass]}), NETHERLANDS),
        (options, pass) => JSON.stringify([options, pass])
    )
    return [
        ['LEE', {}, BOTH],
        ['LEE, stored descending first', {}, ['DESCENDING', 'ASCENDING']],
        ['without spatial speckle filtering', {spatialSpeckleFilter: 'NONE'}, BOTH],
        ['QUEGAN', {multitemporalSpeckleFilter: 'QUEGAN'}, BOTH],
        ['RABASAR', {multitemporalSpeckleFilter: 'RABASAR'}, BOTH],
        ['LEE, every orbit number', {orbitNumbers: 'ALL'}, BOTH]
    ].map(([label, options, orbits]) => check('pass correctness', `${label}: each pass of both equals that pass alone`, async () => {
        const [combined, ascending, descending] = await Promise.all([
            evidence(historical(NETHERLANDS, {...options, orbits}), NETHERLANDS),
            fresh(options, 'ASCENDING'),
            fresh(options, 'DESCENDING')
        ])
        return passCorrectnessJudgement({combined, alone: {ASCENDING: ascending, DESCENDING: descending}, orbits: scenes.NETHERLANDS})
    }))
}

// Every band of each pass of the combined history equals that of the pass alone, all hold numbers, and each pass's
// orbit is one of that pass's relative orbits.
const passCorrectnessJudgement = ({combined, alone, orbits}) => {
    const unusable = [
        ...unusableBands(combined.values, [...passBands('ASCENDING'), ...passBands('DESCENDING')]).map(band => `combined.${band}`),
        ...BOTH.flatMap(pass => unusableBands(alone[pass].values, passBands(pass)).map(band => `${pass}.${band}`))
    ]
    const differing = BOTH.flatMap(pass => passBands(pass)
        .filter(band => combined.values[band] !== alone[pass].values[band])
        .map(band => `${band}: ${combined.values[band]} alone ${alone[pass].values[band]}`))
    const foreignOrbits = BOTH.flatMap(pass => [['combined', combined], ['alone', alone[pass]]]
        .filter(([, {values}]) => !orbits[pass].includes(values[`orbit_${ORBIT_SUFFIXES[pass]}`]))
        .map(([source, {values}]) => `${source} orbit_${ORBIT_SUFFIXES[pass]} ${values[`orbit_${ORBIT_SUFFIXES[pass]}`]}`))
    return judged(!unusable.length && !differing.length && !foreignOrbits.length, {
        unusable, differing, foreignOrbits, orbit_asc: combined.values.orbit_asc, orbit_desc: combined.values.orbit_desc
    })
}

const missingPassChecks = () => {
    const lee = historical(AMAZON, {orbits: BOTH})
    const quegan = historical(AMAZON, {orbits: BOTH, multitemporalSpeckleFilter: 'QUEGAN'})
    const descendingAlone = _.memoize(options => evidence(historical(AMAZON, {...options, orbits: DESCENDING}), AMAZON), JSON.stringify)
    const availableRequest = [...passBands('DESCENDING')].reverse()
    const missingRequest = [...passBands('ASCENDING')].reverse()
    const expectMissingPass = async (recipe, args, expected, options) => {
        const [built, alone] = await Promise.all([evidence(recipe, AMAZON, args), descendingAlone(options)])
        return missingPassJudgement({built, alone, expected})
    }
    const paraguay = historical(PARAGUAY, {orbits: BOTH})
    const sparse = historical(NETHERLANDS, {orbits: BOTH, minObservations: 1000})
    return [
        check('missing pass', 'LEE: the complete output', () =>
            expectMissingPass(lee, undefined, baytsHistoricalBandNames(lee.model), {})),
        check('missing pass', 'LEE, stored descending first: the complete output', () => {
            const reversed = historical(AMAZON, {orbits: ['DESCENDING', 'ASCENDING']})
            return expectMissingPass(reversed, undefined, baytsHistoricalBandNames(reversed.model), {})
        }),
        check('missing pass', 'LEE: the available pass alone, out of order', () =>
            expectMissingPass(lee, withOutputBands({selection: availableRequest}), availableRequest, {})),
        check('missing pass', 'LEE: the missing pass alone, out of order', () =>
            expectMissingPass(lee, withOutputBands({selection: missingRequest}), missingRequest, {})),
        check('missing pass', 'QUEGAN: the complete output', () =>
            expectMissingPass(quegan, undefined, baytsHistoricalBandNames(quegan.model), {multitemporalSpeckleFilter: 'QUEGAN'})),
        check('missing pass', 'the ascending pass alone, without scenes, is refused', () =>
            refusedAs(historical(AMAZON, {orbits: ASCENDING}), undefined, NO_IMAGES)),
        check('missing pass', 'neither pass with scenes: the complete output is refused', () =>
            refusedAs(paraguay, undefined, NO_IMAGES)),
        check('missing pass', 'neither pass with scenes: one pass asked for is refused', () =>
            refusedAs(paraguay, withOutputBands({selection: passBands('DESCENDING')}), NO_IMAGES)),
        check('missing pass', 'scenes without enough observations: masked, not refused', async () => {
            const built = await evidence(sparse, NETHERLANDS)
            const statistics = BOTH.flatMap(pass => passBands(pass).filter(band => !band.includes('_speckle_')))
            const unmasked = statistics.filter(band => built.masks[band] !== 0)
            return judged(_.isEqual(built.names, baytsHistoricalBandNames(sparse.model)) && !unmasked.length, {names: built.names, unmasked})
        }),
        check('missing pass', 'BAYTS Alerts over both passes alerts as over the descending pass alone', async () => {
            const comparison = pixelComparison(await firstValueFrom(zip(
                baytsAlertsOver(lee, BOTH),
                baytsAlertsOver(historical(AMAZON, {orbits: DESCENDING}), DESCENDING)
            ).pipe(
                switchMap(([both, alone]) => read('alert pixels', pixelDifferences(both, alone, AMAZON)))
            )))
            return judged(identical(comparison), comparison)
        })
    ]
}

// Every band asked for, in order, scalar and in a bounded image; the missing pass's masked throughout the area, the
// available pass's holding numbers equal to the pass alone's.
const missingPassJudgement = ({built, alone, expected}) => {
    const available = expected.filter(band => band.endsWith('_desc'))
    const missing = expected.filter(band => band.endsWith('_asc'))
    const unusable = unusableBands(built.values, available)
    const differing = available.filter(band => built.values[band] !== alone.values[band])
    const valid = missing.filter(band => built.validInArea[band] !== 0)
    return judged(
        _.isEqual(built.names, expected) && built.scalar && !built.unbounded && !unusable.length && !differing.length && !valid.length,
        {names: built.names, unbounded: built.unbounded, unusable, differing, validInArea: valid}
    )
}

const alertChecks = () => {
    const both = historical(NETHERLANDS, {orbits: BOTH})
    const descending = historical(NETHERLANDS, {orbits: DESCENDING})
    const maskAscending = history => history.addBands(history.select(passBands('ASCENDING')).updateMask(0), null, true)
    return [
        ['normalization off', {normalization: 'DISABLED'}],
        ['normalization on', {normalization: 'ENABLED'}],
        ['continuing initial alerts', {normalization: 'DISABLED', continuing: true}]
    ].map(([label, variant]) => check('alerts', `${label}: a masked ascending pass is excluded, a valid one is not`, async () => {
        const {masked, valid} = _.mapValues(await firstValueFrom(zip(historyImage$(both), historyImage$(descending)).pipe(
            switchMap(([bothHistory, descendingHistory]) => {
                const alone = alertsOver(descendingHistory, DESCENDING, variant)
                return read('alert pixels', ee.Dictionary({
                    masked: pixelDifferences(alertsOver(maskAscending(bothHistory), BOTH, variant), alone, NETHERLANDS),
                    valid: pixelDifferences(alertsOver(bothHistory, BOTH, variant), alone, NETHERLANDS)
                }))
            })
        )), pixelComparison)
        return judged(identical(masked) && different(valid), {masked, valid})
    }))
}

const historyImage$ = recipe => ImageFactory(recipe).getImage$()

// BAYTS as BAYTS Alerts runs it, masked as BAYTS Alerts masks it: to where the history holds any valid band.
const alertsOver = (historicalStats, orbits, {normalization, continuing}) => {
    const options = {...DEFAULT_OPTIONS, orbits, normalization, historicalStats}
    const initialAlerts = continuing ? bayts({...options, ...INITIAL_MONITORING}) : undefined
    return bayts({...options, ...MONITORING, initialAlerts})
        .updateMask(historicalStats.mask().reduce(ee.Reducer.max()))
}

const baytsAlertsOver = (reference, orbits) => ImageFactory({
    id: `bayts-alerts-verify-${reference.id}`,
    type: 'BAYTS_ALERTS',
    model: {
        reference,
        date: {monitoringEnd: MONITORING.endDate, monitoringDuration: 2, monitoringDurationUnit: 'months'},
        options: {...DEFAULT_OPTIONS, orbits},
        baytsAlertsOptions: {
            normalization: 'DISABLED', sensitivity: 1, maxDays: 90, highConfidenceThreshold: 0.975,
            lowConfidenceThreshold: 0.85, minNonForestProbability: 0.6, minChangeProbability: 0.5
        }
    }
}).getImage$()

// Two alert images on one grid over the area, band by band: how many pixels are valid in one and not the other, the
// largest absolute difference where both are valid, and how many pixels are valid in both.
const pixelDifferences = (image, reference, area) => {
    const region = {geometry: areaOf(area), crs: 'EPSG:4326', scale: 20, maxPixels: 1e8}
    const jointlyValid = image.mask().and(reference.mask())
    return ee.Dictionary({
        bands: image.bandNames(),
        referenceBands: reference.bandNames(),
        maskDifferences: image.mask().neq(reference.mask()).reduceRegion({reducer: ee.Reducer.sum().unweighted(), ...region}),
        maxAbsoluteDifference: image.subtract(reference).abs().updateMask(jointlyValid)
            .reduceRegion({reducer: ee.Reducer.max(), ...region}),
        jointlyValid: jointlyValid.reduceRegion({reducer: ee.Reducer.sum().unweighted(), ...region})
    })
}

// What a history holds: its bands, each band's value and mask at the area's point, whether each band is valid
// anywhere in the area, and whether the image is bounded.
const evidence = (recipe, area, args) => firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
    switchMap(image => read('evidence', ee.Dictionary({
        bands: typedBands(image),
        values: image.reduceRegion({reducer: ee.Reducer.first(), geometry: pointOf(area), scale: 20}),
        masks: image.mask().reduceRegion({reducer: ee.Reducer.first(), geometry: pointOf(area), scale: 20}),
        validInArea: image.mask().reduceRegion({reducer: ee.Reducer.max(), geometry: areaOf(area), scale: 20}),
        unbounded: image.geometry().isUnbounded()
    }))),
    map(({bands, ...rest}) => ({
        names: bands.map(({name}) => name),
        scalar: bands.every(({arrayDimensions}) => arrayDimensions === 0),
        ...rest
    }))
))

const builtAs = async (recipe, args, expected) => {
    const bands = await firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
        switchMap(image => read('built bands', typedBands(image)))
    ))
    const names = bands.map(({name}) => name)
    return judged(_.isEqual(names, expected) && bands.every(({arrayDimensions}) => arrayDimensions === 0), {expected, built: names})
}

const refusedAs = async (recipe, args, cause) => {
    try {
        const names = (await firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
            switchMap(image => read('built bands', image.bandNames()))
        )))
        return judged(false, {expected: String(cause), built: names})
    } catch (error) {
        return judged(cause.test(error.message), {expected: String(cause), error: error.message.split('\n')[0]})
    }
}

const maskingOf = recipe => ({
    id: 'masking-verify',
    type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: recipe.id}, imageMask: {type: 'RECIPE_REF', id: recipe.id}}
})

const inScope = (recipes, fn) => {
    const scope = new RecipeScope(id => of(recipes[id]))
    return withRecipeScope(scope, fn).finally(() => scope.close())
}

// The bands a sample holds no finite number for: missing, masked or not a number.
const unusableBands = (values, bands) => bands.filter(band => !Number.isFinite(values?.[band]))

const read = (description, value) => firstValueFrom(ee.getInfo$(value, description).pipe(timeout(READ_TIMEOUT_MS)))

const judged = (passed, details) => ({passed: Boolean(passed), details})

const results = []

const check = (group, name, run) => async () => {
    const start = Date.now()
    const {passed, details} = await Promise.resolve().then(run).catch(error => judged(false, {error: error.message.split('\n')[0]}))
    const ms = Date.now() - start
    results.push({group, name, passed, ms})
    console.info(`${passed ? 'PASS' : 'FAIL'} [${group}] ${name}: ${JSON.stringify({ms, ...details})}`)
}

const inPool = (tasks, size) => {
    let next = 0
    const worker = async () => {
        while (next < tasks.length) {
            await tasks[next++]()
        }
    }
    return Promise.all(_.times(size, worker))
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
