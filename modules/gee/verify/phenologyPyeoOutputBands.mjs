// What Phenology and PyEO Alerts say they provide, against the images Earth Engine builds for them.
//
// Phenology, over a cloudy area where some months have no usable scenes and over a desert where every month has:
//
// - asked for no bands, or an empty selection, it returns every declared band in declared order, all scalar;
// - asked for a subset, it returns exactly that subset in the order asked;
// - a month without scenes is its named band with no valid pixels, not missing and not valid zeros;
// - a month with scenes is unchanged: the same values, mask, pixel type and projection - CRS and affine transform -
//   as its plain median.
//
// PyEO Alerts' change report, from the real algorithm over small synthetic inputs, with the index-drop gate on and
// off, holds exactly the declared bands in declared order, all scalar. The synthetic inputs establish the report's
// schema, not its pixels.
//
// Every comparison needs a sample: a month expected to be empty that has scenes, or a populated month without
// valid pixels to compare, fails the run rather than passing vacuously. Unexpected errors fail it too. Read-only;
// recipes are held in memory. Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/phenologyPyeoOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, map, of, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {toGeometry$} from '#sepal/ee/aoi'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {toUolParams} from '#sepal/ee/pyeo/params'
import {runPyeoChangeAlerts} from '#sepal/ee/pyeo/runPyeoChangeAlerts'
import {getCollection$} from '#sepal/ee/timeSeries/collection'
import {PHENOLOGY_BANDS} from '#sepal/recipe/type/phenology'
import {PYEO_ALERTS_BANDS} from '#sepal/recipe/type/pyeoAlerts'

const READ_TIMEOUT_MS = 300000
const SCALE = 30

const polygon = (west, south, east, north) => ({type: 'POLYGON', path: [[west, south], [west, north], [east, north], [east, south]]})

// In 2022 the Manaus area has no usable Landsat 8 scene for `january` (January-February) and `october`
// (October-November); the Namib desert has scenes every month.
const CLOUDY = {label: 'Manaus', aoi: polygon(-60.10, -3.18, -60.06, -3.14), emptyMonth: 'january', populatedMonth: 'december'}
const DESERT = {label: 'Namib', aoi: polygon(15.0, -24.1, 15.05, -24.05), populatedMonth: 'january'}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']

const declaredBands = bands => bands.map(({name, dataType}) => ({name, arrayDimensions: dataType.arrayDimensions}))

const phenology = aoi => ({
    id: 'phenology-verify',
    type: 'PHENOLOGY',
    model: {
        aoi,
        dates: {fromYear: 2022, toYear: 2022},
        sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'evi'},
        options: {corrections: ['SR'], cloudDetection: ['QA'], cloudMasking: 'MODERATE', snowMasking: 'ON', compose: 'MEDIAN'}
    }
})

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

const evaluate$ = (value, description) => ee.getInfo$(value, description).pipe(timeout(READ_TIMEOUT_MS))

const read = async observable$ => {
    try {
        return {value: await firstValueFrom(observable$)}
    } catch (error) {
        return {error: error.message}
    }
}

let failures = 0

const report = (passed, name, details) => {
    failures += passed ? 0 : 1
    console.info(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(details)}`)
}

const scalarBands = names => names.map(name => ({name, arrayDimensions: 0}))

const builtBands = (recipe, args) => read(ImageFactory(recipe, args).getImage$().pipe(
    switchMap(image => evaluate$(typedBands(image), 'built bands'))
))

const expectBands = async (name, recipe, args, expected) => {
    const {value, error} = await builtBands(recipe, args)
    report(!error && _.isEqual(value, expected), name, {expected: expected.map(({name}) => name), built: value?.map(({name, arrayDimensions}) => `${name}:${arrayDimensions}`) || error})
}

// The month's scenes exactly as Phenology reads them, and their plain median: what a month with scenes has always been.
const monthOf$ = ({aoi}, month) => {
    const {model} = phenology(aoi)
    const index = MONTHS.indexOf(month) + 1
    return toGeometry$(aoi).pipe(
        switchMap(geometry => getCollection$({
            recipe: {model: {
                dates: {startDate: `${model.dates.fromYear}-01-01`, endDate: `${model.dates.toYear + 1}-01-01`},
                sources: model.sources,
                options: model.options
            }},
            geometry,
            bands: [model.sources.band]
        }).pipe(
            map(collection => {
                const scenes = collection
                    .select(model.sources.band)
                    .filter(ee.Filter.calendarRange(index, index + 1, 'month'))
                return {geometry, scenes, median: scenes.median().rename(month)}
            })
        ))
    )
}

const phenologyMonth$ = ({aoi}, month) =>
    ImageFactory(phenology(aoi), {selection: [month]}).getImage$()

const expectEmptyMonth = async area => {
    const month = area.emptyMonth
    const {value, error} = await read(monthOf$(area, month).pipe(
        switchMap(({geometry, scenes}) => phenologyMonth$(area, month).pipe(
            switchMap(image => evaluate$(ee.Dictionary({
                scenes: scenes.size(),
                bands: typedBands(image),
                valid: image.reduceRegion({reducer: ee.Reducer.count(), geometry, scale: SCALE, maxPixels: 1e8}).get(month)
            }), 'empty month'))
        ))
    ))
    report(
        !error && value.scenes === 0 && _.isEqual(value.bands, scalarBands([month])) && value.valid === 0,
        `${area.label}, ${month} without scenes, is its band with no valid pixels`,
        value || {error}
    )
}

const expectPopulatedMonthUnchanged = async area => {
    const month = area.populatedMonth
    const {value, error} = await read(monthOf$(area, month).pipe(
        switchMap(({geometry, scenes, median}) => phenologyMonth$(area, month).pipe(
            switchMap(image => {
                const region = reducer => ({reducer, geometry, scale: SCALE, maxPixels: 1e8})
                const bothValid = image.mask().and(median.mask())
                const difference = image.subtract(median).abs().updateMask(bothValid)
                return evaluate$(ee.Dictionary({
                    scenes: scenes.size(),
                    comparedPixels: difference.reduceRegion(region(ee.Reducer.count())).get(month),
                    maxDifference: difference.reduceRegion(region(ee.Reducer.max())).get(month),
                    maskDifferences: image.mask().neq(median.mask()).reduceRegion(region(ee.Reducer.sum())).get(month),
                    types: [image.bandTypes().get(month), median.bandTypes().get(month)],
                    projections: [image.projection(), median.projection()]
                }), 'populated month')
            })
        ))
    ))
    const [builtType, medianType] = value?.types || []
    const [builtProjection, medianProjection] = value?.projections || []
    report(
        !error
            && value.scenes > 0
            && value.comparedPixels > 0
            && value.maxDifference === 0
            && value.maskDifferences === 0
            && _.isEqual(builtType, medianType)
            && Boolean(builtProjection?.crs && builtProjection?.transform)
            && _.isEqual(builtProjection, medianProjection),
        `${area.label}, ${month} with scenes, keeps its median's values, mask, type, CRS and transform`,
        value || {error}
    )
}

const pyeoReport = indexGate => {
    const scene = (i, value) => ee.Image.constant([value, 3000]).rename(['classification', 'gate_index']).int16()
        .set('system:time_start', ee.Date('2023-01-01').advance(i * 16, 'day').millis())
    return runPyeoChangeAlerts({
        aoi: ee.Geometry.Point([-60.08, -3.16]).buffer(300),
        classifiedBaseline: ee.Image.constant([1, 5000]).rename(['classification', 'gate_index']).int16(),
        classifiedMonitoringCollection: ee.ImageCollection([scene(0, 2), scene(1, 2), scene(2, 2), scene(3, 1)]),
        ...toUolParams({changeFromClasses: [1], changeToClasses: [2], indexGate})
    })
}

const main = async () => {
    await authenticate()

    const declared = declaredBands(PHENOLOGY_BANDS)
    for (const area of [CLOUDY, DESERT]) {
        const recipe = phenology(area.aoi)
        await expectBands(`${area.label}, Phenology asked for no bands`, recipe, undefined, declared)
        await expectBands(`${area.label}, Phenology asked for an empty selection`, recipe, {selection: []}, declared)
        await expectPopulatedMonthUnchanged(area)
    }
    await expectBands(
        'Manaus, Phenology asked for a subset, in the order asked',
        phenology(CLOUDY.aoi),
        {selection: ['december', 'slope_2', 'background'], outputBands: ['december', 'slope_2', 'background']},
        scalarBands(['december', 'slope_2', 'background'])
    )
    await expectEmptyMonth(CLOUDY)

    for (const indexGate of [undefined, {index: 'ndvi', threshold: 1000}]) {
        const {value, error} = await read(of(pyeoReport(indexGate)).pipe(switchMap(image => evaluate$(typedBands(image), 'pyeo report'))))
        report(
            !error && _.isEqual(value, declaredBands(PYEO_ALERTS_BANDS)),
            `PyEO change report, index-drop gate ${indexGate ? 'on' : 'off'}`,
            {declared: PYEO_ALERTS_BANDS.map(({name}) => name), built: value?.map(({name, arrayDimensions}) => `${name}:${arrayDimensions}`) || error}
        )
    }

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
