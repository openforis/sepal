// What a Radar Mosaic says it holds, against the image Earth Engine builds for it.
//
// Its declaration - band names, order and scalar shape - is compared with what its catalogue answers and with the
// running image's bands, for a point in time and a time scan, under minimal options and under the options a new
// recipe saves: when asked for nothing, for an empty selection, for every declared band as an export asks, and for
// a subset out of order, which must come back in the order asked. A time scan asked for part of its harmonics, or
// none, returns just those. A recipe stating a target date beside a period builds a point in time, and one stating no
// dates is refused as Earth Engine refuses it.
//
// A point in time asked for nothing computes no harmonics. That must not change the public bands, so they are compared
// pixel by pixel - values and masks - with the same bands of an image that does compute them, over a small window at
// the native scale. A time scan's harmonics must hold valid pixels, so a year of observations is used.
//
// Explicit requests for bands the output does not declare, which internal callers make, still build, as does the
// selection BAYTS Historical asks of a time scan. Any unexpected error fails the run. Pixel values are compared only
// where stated. Read-only: the recipes are held in memory, nothing is saved and no asset is written. Authenticates
// with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/radarMosaicOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, forkJoin, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {POINT_IN_TIME, RADAR_MOSAIC_BANDS, TIME_SCAN} from '#sepal/recipe/type/radarMosaic'

const READ_TIMEOUT_MS = 900000

const AOI = {type: 'POLYGON', path: [[-60.10, -3.18], [-60.10, -3.04], [-60.00, -3.04], [-60.00, -3.18]]}
// Inside the AOI, small enough to compare every native pixel.
const WINDOW = [[-60.06, -3.12], [-60.06, -3.10], [-60.04, -3.10], [-60.04, -3.12]]

const MINIMAL = {
    orbits: ['ASCENDING', 'DESCENDING'], orbitNumbers: 'ALL', geometricCorrection: 'ELLIPSOID',
    spatialSpeckleFilter: 'NONE', multitemporalSpeckleFilter: 'NONE', outlierRemoval: 'NONE',
    mask: ['SIDES', 'FIRST_LAST'], minAngle: 30.88, maxAngle: 45.35, minObservations: 1
}

// The options a new Radar Mosaic saves (recipe/radarMosaic/radarMosaicRecipe.js).
const SAVED_DEFAULTS = {
    orbits: ['ASCENDING', 'DESCENDING'], orbitNumbers: 'ALL', geometricCorrection: 'TERRAIN',
    spatialSpeckleFilter: 'LEE_SIGMA', kernelSize: 9, sigma: 0.9, strongScatterers: 'RETAIN',
    strongScattererValues: [0, -5], snicSize: 5, snicCompactness: 0.15, multitemporalSpeckleFilter: 'NONE',
    numberOfImages: 10, outlierRemoval: 'MODERATE', mask: ['SIDES', 'FIRST_LAST'], minAngle: 30.88, maxAngle: 45.35,
    minObservations: 1
}

const TARGET = {targetDate: '2021-06-01'}
const YEAR = {fromDate: '2021-01-01', toDate: '2022-01-01'}

const radar = (dates, options = MINIMAL) => ({id: 'radar-mosaic-verify', type: 'RADAR_MOSAIC', model: {aoi: AOI, dates, options}})

const NO_DATES = /Required argument \(start\) missing/

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

const read$ = (description, value) => ee.getInfo$(value, description).pipe(timeout(READ_TIMEOUT_MS))

const scalarBands = names => names.map(name => ({name, arrayDimensions: 0}))

const declaredNames = configuration => RADAR_MOSAIC_BANDS[configuration].map(({name}) => name)

const expectCatalogue = async (name, recipe, args, expected) => {
    try {
        const answered = await firstValueFrom(ImageFactory(recipe, args).getBands$())
        report(_.isEqual(answered, expected), name, {answered})
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

// A request with no arguments passes none, rather than an empty object: the producer's own default is part of what
// it builds.
const expectBands = async (name, recipe, args, expected) => {
    const start = Date.now()
    try {
        const built = await firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
            switchMap(image => read$('built bands', typedBands(image)))
        ))
        report(_.isEqual(built, expected), name, {ms: Date.now() - start, expected: expected.map(({name}) => name), built: built.map(({name}) => name)})
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

const expectRefusal = async (name, recipe, reason) => {
    try {
        const built = await firstValueFrom(ImageFactory(recipe).getImage$().pipe(
            switchMap(image => read$('built bands', image.bandNames()))
        ))
        report(false, name, {expected: String(reason), built})
    } catch (error) {
        report(reason.test(error.message), name, {expected: String(reason), error: error.message})
    }
}

// The public bands of a point in time asked for nothing, against the same bands of an image that computes both
// polarisations' harmonics, as asking for nothing did: masks and values at every native pixel of the window.
const expectUnchangedByHarmonics = async (name, recipe) => {
    const start = Date.now()
    const bands = declaredNames(POINT_IN_TIME)
    try {
        const {asked, harmonic} = await firstValueFrom(forkJoin({
            asked: ImageFactory(recipe).getImage$(),
            harmonic: ImageFactory(recipe, {selection: [...bands, 'VV_phase', 'VH_phase']}).getImage$()
        }))
        const a = asked.select(bands)
        const b = harmonic.select(bands)
        const differences = a.mask().neq(b.mask()).rename(bands.map(band => `${band}_mask`))
            .addBands(a.subtract(b).abs().updateMask(a.mask().and(b.mask())).rename(bands.map(band => `${band}_value`)))
            .addBands(a.mask().gt(0).rename(bands.map(band => `${band}_valid`)))
        const stats = await firstValueFrom(read$('pixel comparison', differences.reduceRegion({
            reducer: ee.Reducer.max().combine(ee.Reducer.count(), '', true),
            geometry: ee.Geometry.Polygon(WINDOW),
            scale: 10,
            maxPixels: 1e9
        })))
        const unchanged = bands.every(band =>
            stats[`${band}_mask_max`] === 0 && stats[`${band}_value_max`] === 0 && stats[`${band}_valid_max`] === 1)
        report(unchanged, name, {
            ms: Date.now() - start,
            byBand: Object.fromEntries(bands.map(band => [band, {
                masksDiffer: stats[`${band}_mask_max`], maxValueDifference: stats[`${band}_value_max`], pixels: stats[`${band}_valid_count`]
            }]))
        })
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

const expectHarmonicsValid = async (name, recipe) => {
    const harmonics = declaredNames(TIME_SCAN).filter(band => /_(phase|amp|res|const|t)$/.test(band))
    try {
        const counts = await firstValueFrom(ImageFactory(recipe, {selection: harmonics}).getImage$().pipe(
            switchMap(image => read$('harmonic pixels', image.reduceRegion({
                reducer: ee.Reducer.count(), geometry: ee.Geometry.Polygon(AOI.path), scale: 200, maxPixels: 1e9
            })))
        ))
        report(harmonics.every(band => counts[band] > 0), name, {counts})
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

const main = async () => {
    await authenticate()

    const pointInTime = scalarBands(declaredNames(POINT_IN_TIME))
    const timeScan = scalarBands(declaredNames(TIME_SCAN))

    await expectCatalogue('catalogue, point in time', radar(TARGET), undefined, declaredNames(POINT_IN_TIME))
    await expectCatalogue('catalogue, time scan asked for a subset', radar(YEAR), {selection: ['VV_min']}, declaredNames(TIME_SCAN))
    await expectCatalogue('catalogue, target date beside a period', radar({...TARGET, ...YEAR}), undefined, declaredNames(POINT_IN_TIME))
    await expectCatalogue('catalogue, no dates', radar({}), undefined, declaredNames(TIME_SCAN))

    for (const [label, options] of [['minimal options', MINIMAL], ['saved defaults', SAVED_DEFAULTS]]) {
        for (const [configuration, dates, declared] of [['point in time', TARGET, pointInTime], ['time scan', YEAR, timeScan]]) {
            const recipe = radar(dates, options)
            await expectBands(`${configuration}, ${label}, asked for nothing`, recipe, undefined, declared)
            await expectBands(`${configuration}, ${label}, empty selection`, recipe, {selection: []}, declared)
            await expectBands(`${configuration}, ${label}, every declared band`, recipe, withOutputBands({selection: declared.map(({name}) => name)}), declared)
        }
        await expectUnchangedByHarmonics(`point in time, ${label}, public pixels without harmonics`, radar(TARGET, options))
    }

    const subset = (recipe, names) => expectBands(`${recipe.model.dates.targetDate ? 'point in time' : 'time scan'}, subset ${names.join(',')}`, recipe, withOutputBands({selection: names}), scalarBands(names))
    await subset(radar(TARGET), ['daysFromTarget', 'orbit', 'VV'])
    await subset(radar(YEAR), ['orbit', 'VH_amp', 'VV_min'])
    await subset(radar(YEAR), ['VH_const', 'VV_phase'])
    await subset(radar(YEAR), ['VV_min', 'NDCV'])

    await expectBands('target date beside a period, asked for nothing', radar({...TARGET, ...YEAR}), undefined, pointInTime)
    await expectRefusal('no dates', radar({}), NO_DATES)
    await expectHarmonicsValid('time scan harmonics hold valid pixels', radar(YEAR))

    const explicit = ['unixTimeDays', 'angle', 'quality', 'VV_phase']
    await expectBands('point in time, explicit undeclared request', radar(TARGET), {selection: explicit}, scalarBands(explicit))
    const historical = ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit']
    await expectBands('time scan, as BAYTS Historical asks', radar(YEAR), {selection: historical}, scalarBands(historical))

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
