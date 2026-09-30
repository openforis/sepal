// What a Time Series says its image holds, against the image Earth Engine builds for it from real imagery.
//
// Schema. Over a small area in the Netherlands, with optical and with radar sources, the catalogue answers the
// declared bands without building anything, and the image built when asked for nothing, and for exactly the declared
// bands, holds exactly those, scalar. A recipe configuring nothing is still answered from the declaration.
//
// Pixels. At a point, the count equals the number of images of the recipe's own collection - filtered and masked as
// execution builds it - whose first band holds a value there, counted independently from the collection's pixel
// values rather than by reducing it. A sample without a number, or a collection without an image over the point,
// fails the check.
//
// Recorded, not judged. Execution builds its count whatever is asked for, an unknown band name included, and fails
// with Earth Engine's own error over a period without scenes; what it does is printed beside the checks, and changes
// neither the verdict nor the count of checks. Planet sources are not checked: the service account reads no Planet
// imagery, so they are reported as blocked.
//
// Each check reports its duration, and the run its total, apart from its verdict. Any unexpected error fails the run.
// Read-only: recipes are held in memory, nothing is saved and no asset is written. Authenticates with the service
// account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/timeSeriesOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, map, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {TIME_SERIES_BANDS} from '#sepal/recipe/type/timeSeries'

const READ_TIMEOUT_MS = 300000
const CONCURRENCY = 6

const POINT = [5.3, 52.1]
const GRID = {crs: 'EPSG:4326', scale: 30}
const DECLARED = TIME_SERIES_BANDS.map(({name}) => name)

const OPTICAL = {dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}, cloudPercentageThreshold: 75}
const RADAR = {dataSets: {SENTINEL_1: ['SENTINEL_1']}}

// The options a new recipe saves that its collection reads.
const OPTIONS = {
    corrections: [], includedCloudMasking: ['sepalCloudScore'], sepalCloudScoreMaxCloudProbability: 30, holes: 'PREVENT',
    cloudBuffer: 0, shadowMasking: 'OFF', snowMasking: 'OFF', brdfMultiplier: 4, orbitOverlap: 'KEEP',
    tileOverlap: 'QUICK_REMOVE', orbits: ['ASCENDING', 'DESCENDING'], geometricCorrection: 'ELLIPSOID',
    spatialSpeckleFilter: 'NONE', outlierRemoval: 'NONE', orbitNumbers: 'ALL', kernelSize: 9, sigma: 0.9,
    strongScattererValues: [0, -5], snicSize: 5, snicCompactness: 0.15, multitemporalSpeckleFilter: 'NONE',
    numberOfImages: 10, mask: ['SIDES', 'FIRST_LAST'], minAngle: 30.88, maxAngle: 45.35, minObservations: 1
}

const box = ([x, y], half = 0.005) => [[x - half, y - half], [x - half, y + half], [x + half, y + half], [x + half, y - half]]

const timeSeries = ({sources = OPTICAL, dates = {startDate: '2023-04-01', endDate: '2023-07-01'}} = {}) => ({
    id: 'time-series-verify',
    type: 'TIME_SERIES',
    model: {aoi: {type: 'POLYGON', path: box(POINT)}, dates, sources, options: OPTIONS}
})

const main = async () => {
    await authenticate()
    const started = Date.now()
    await inPool([
        ...[['optical', OPTICAL], ['radar', RADAR]].flatMap(([label, sources]) => [
            check('schema', `${label}: the catalogue`, () => catalogued(timeSeries({sources}))),
            check('schema', `${label}: asked for nothing`, () => builtAs(timeSeries({sources}), undefined)),
            check('schema', `${label}: asked for its declared bands`, () => builtAs(timeSeries({sources}), withOutputBands({selection: DECLARED}))),
            check('pixels', `${label}: the count at a point`, () => countedAtPoint(timeSeries({sources})))
        ]),
        check('schema', 'configuring nothing: the catalogue', () => catalogued({id: 'time-series-verify', type: 'TIME_SERIES', model: {}})),
        record('asked for a band it does not build', () => bandsBuilt(timeSeries(), withOutputBands({selection: ['nope']}))),
        record('over a period without scenes', () => bandsBuilt(timeSeries({
            sources: {dataSets: {LANDSAT: ['LANDSAT_9']}},
            dates: {startDate: '2015-01-01', endDate: '2015-02-01'}
        })))
    ], CONCURRENCY)
    console.info('BLOCKED Planet sources: the service account reads no Planet imagery')
    summarize(Date.now() - started)
    if (results.some(({passed}) => !passed)) {
        throw new Error(`${results.filter(({passed}) => !passed).length} check(s) failed`)
    }
}

const catalogued = async recipe => {
    const answered = await firstValueFrom(ImageFactory(recipe).getBands$().pipe(timeout(READ_TIMEOUT_MS)))
    return judged(_.isEqual(answered, DECLARED), {answered})
}

const builtAs = async (recipe, args) => {
    const bands = await firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
        switchMap(image => read('built bands', typedBands(image)))
    ))
    const names = bands.map(({name}) => name)
    return judged(_.isEqual(names, DECLARED) && bands.every(({arrayDimensions}) => arrayDimensions === 0), {built: bands})
}

const bandsBuilt = (recipe, args) => firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
    switchMap(image => read('built bands', image.bandNames()))
))

// The count against the images of the recipe's own collection whose first band holds a value at the point, read as
// pixel values on the same grid.
const countedAtPoint = async recipe => {
    const point = ee.Geometry.Point(POINT)
    const {count, values} = await firstValueFrom(zipped(
        ImageFactory(recipe).getImage$().pipe(map(image => image.reduceRegion({reducer: ee.Reducer.first(), geometry: point, ...GRID}))),
        getCollection$({recipe, bands: [0]}).pipe(map(collection => collection.select(0).getRegion(point, GRID.scale, GRID.crs)))
    ))
    const header = values[0]
    const observed = values.slice(1).map(row => row[header.length - 1])
    const valid = observed.filter(value => Number.isFinite(value)).length
    return judged(Number.isFinite(count.count) && observed.length > 0 && count.count === valid, {
        count: count.count, images: observed.length, validInFirstBand: valid
    })
}

const zipped = (count$, values$) => count$.pipe(
    switchMap(count => values$.pipe(
        switchMap(values => read('count and pixel values', ee.Dictionary({count, values})))
    ))
)

const read = (description, value) => ee.getInfo$(value, description).pipe(timeout(READ_TIMEOUT_MS))

const judged = (passed, details) => ({passed: Boolean(passed), details})

const results = []

const check = (group, name, run) => async () => {
    const start = Date.now()
    const {passed, details} = await Promise.resolve().then(run).catch(error => judged(false, {error: error.message.split('\n')[0]}))
    const ms = Date.now() - start
    results.push({group, name, passed, ms})
    console.info(`${passed ? 'PASS' : 'FAIL'} [${group}] ${name}: ${JSON.stringify({ms, ...details})}`)
}

const record = (name, run) => async () => {
    const outcome = await Promise.resolve().then(run).then(
        built => ({built}),
        error => ({error: error.message.split('\n')[0]})
    )
    console.info(`RECORDED ${name}: ${JSON.stringify(outcome)}`)
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
