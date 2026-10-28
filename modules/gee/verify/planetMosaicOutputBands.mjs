// What a Planet Mosaic says it holds, against the image Earth Engine builds for it.
//
// ALGORITHM, NOT INGESTION. The service account cannot read Planet imagery, so every branch is exercised over synthetic
// collections substituted for asset ids: constant images in the exact schemas Planet Mosaic reads - basemap B, G, R, N;
// Daily UDM1, UDM2 and PSB.SD - run through the real processing (lib/js/ee/src/planet). They establish what the
// processing builds from those schemas, never how real Planet assets are ingested, scaled or masked.
//
// Schema. Its catalogue answers the ten declared bands whatever it is asked, and a request for exactly those builds
// them, in order and scalar, on every branch. A subset out of order comes back in the order asked. Asked for nothing
// or an empty selection, a basemap or histogram-matched branch builds exactly the declared bands, while Daily without
// matching also keeps its working bands - brightness, a duplicate of each spectral band and four date bands - and
// PSB.SD imagery its other bands; an explicit request for one of those still builds. Daily without matching over
// four-band and eight-band imagery together is refused by Earth Engine once a pixel is computed, whatever its band
// metadata says. Histogram matching is checked for schema only: constant images give it no histogram to match, so its
// sampled values are null and establish nothing about pixels or encoding.
//
// Pixels. Over a basemap, each index at a point is its value from the sampled spectral bands, stored per ten thousand;
// a sample without a number for every band, or spectral values no index can be computed from, fails.
//
// Real ingestion is reported apart and never passes by default. PLANET_REAL_NICFI=1 builds the declared bands over the
// fixed NICFI basemaps, and PLANET_REAL_DAILY=<collection id> over a Daily collection; a requested real check fails on
// any error, access included, and on a sample without a number for every declared band. Any unexpected error fails the run. Read-only: recipes are held in memory, nothing is
// saved and no asset is written. Authenticates with the service account:
//
//   docker exec [-e PLANET_REAL_NICFI=1] [-e PLANET_REAL_DAILY=<id>] -w /usr/local/src/sepal/modules/gee gee \
//       node verify/planetMosaicOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {planetMosaicBands} from '#sepal/recipe/type/planetMosaic'

const READ_TIMEOUT_MS = 900000

const AOI = [[-60.10, -3.18], [-60.10, -3.04], [-60.00, -3.04], [-60.00, -3.18]]
const POINT = [-60.05, -3.1]
const DATES = {fromDate: '2022-01-01', toDate: '2022-04-01'}

const Q_BANDS = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8']
const CLEAR = [1, 0, 0, 0, 0, 0, 100, 0]
const SPECTRAL = [500, 700, 600, 3000]

const DECLARED = planetMosaicBands({}).map(({name}) => name)
const DATE_BANDS = ['dayOfYear', 'daysFromTarget', 'targetDayCloseness', 'unixTimeDays']
const INDEXES = DECLARED.slice(4)
const DUPLICATED = names => names.map(name => `${name}_1`)
const FOUR = ['blue', 'green', 'red', 'nir']
const EIGHT = ['aerosol', 'blue', 'green1', 'green', 'yellow', 'red', 'redEdge', 'nir']

// What Daily without histogram matching builds for an empty request: its composite's every band, then the indexes.
const dailyDefault = spectral => [...spectral, 'brightness', ...DUPLICATED(spectral), ...DATE_BANDS, ...INDEXES]

// Built once authenticated, as every Earth Engine object must be.
const syntheticCollections = () => ({
    'synthetic/basemaps': ['2022-01-01', '2022-02-01', '2022-03-01'].map(date => image(date, SPECTRAL, ['B', 'G', 'R', 'N'])),
    'synthetic/udm1': ['2022-01-05', '2022-01-15'].map(date => image(date, [...SPECTRAL, 0], ['B1', 'B2', 'B3', 'B4', 'udm1'])),
    'synthetic/udm2': ['2022-01-06', '2022-01-16'].map(date => image(date, [...SPECTRAL, ...CLEAR], ['B1', 'B2', 'B3', 'B4', ...Q_BANDS])),
    'synthetic/psbsd': ['2022-01-07', '2022-01-17'].map(date =>
        image(date, [400, 500, 650, 700, 750, 600, 1500, 3000, ...CLEAR], ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', ...Q_BANDS]))
})

const planet = (sources, {histogramMatching = 'DISABLED', dates = DATES} = {}) => ({
    id: 'planet-verify',
    type: 'PLANET_MOSAIC',
    model: {
        aoi: {type: 'POLYGON', path: AOI},
        dates,
        sources,
        options: {histogramMatching, cloudThreshold: 0.15, shadowThreshold: 0.4, cloudBuffer: 0}
    }
})

const BASEMAPS = planet({source: 'BASEMAPS', assets: ['synthetic/basemaps']})

// Each branch, and what it builds for an empty request.
const BRANCHES = [
    ['basemaps', BASEMAPS, DECLARED],
    ['basemaps stating histogram matching, which only Daily applies',
        planet({source: 'BASEMAPS', assets: ['synthetic/basemaps']}, {histogramMatching: 'ENABLED'}), DECLARED],
    ['Daily UDM1', planet({source: 'DAILY', assets: ['synthetic/udm1']}), dailyDefault(FOUR)],
    ['Daily UDM2', planet({source: 'DAILY', assets: ['synthetic/udm2']}), dailyDefault(FOUR)],
    ['Daily UDM2 around a target date',
        planet({source: 'DAILY', assets: ['synthetic/udm2']}, {dates: {...DATES, targetDate: '2022-01-10'}}), dailyDefault(FOUR)],
    ['Daily PSB.SD', planet({source: 'DAILY', assets: ['synthetic/psbsd']}), dailyDefault(EIGHT)]
]

const MATCHED = [
    ['histogram-matched Daily UDM2', planet({source: 'DAILY', assets: ['synthetic/udm2']}, {histogramMatching: 'ENABLED'})],
    ['histogram-matched Daily UDM2 and PSB.SD',
        planet({source: 'DAILY', assets: ['synthetic/udm2', 'synthetic/psbsd']}, {histogramMatching: 'ENABLED'})]
]

const MIXED = planet({source: 'DAILY', assets: ['synthetic/udm2', 'synthetic/psbsd']})

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

// Synthetic ids resolve to their collections; every other id is read from Earth Engine as usual.
const substituteSyntheticCollections = () => {
    const synthetic = syntheticCollections()
    const ImageCollection = ee.ImageCollection
    function SyntheticOrReal(...args) {
        const [id] = args
        if (typeof id === 'string' && synthetic[id]) {
            return new ImageCollection(synthetic[id])
        }
        return this instanceof SyntheticOrReal ? new ImageCollection(...args) : ImageCollection(...args)
    }
    Object.setPrototypeOf(SyntheticOrReal, ImageCollection)
    SyntheticOrReal.prototype = ImageCollection.prototype
    ee.ImageCollection = SyntheticOrReal
}

let failures = 0

const report = (passed, name, details) => {
    failures += passed ? 0 : 1
    console.info(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(details)}`)
}

const read$ = (description, value) => ee.getInfo$(value, description).pipe(timeout(READ_TIMEOUT_MS))

const built = (recipe, args) => firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
    switchMap(image => read$('built bands', typedBands(image)))
))

const sampled = (recipe, args) => firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
    switchMap(image => read$('pixel', image.reduceRegion({
        reducer: ee.Reducer.first(), geometry: ee.Geometry.Point(POINT), scale: 30
    })))
))

const expectBuilt = async (name, recipe, args, expected) => {
    const start = Date.now()
    try {
        const bands = await built(recipe, args)
        const names = bands.map(({name}) => name)
        report(_.isEqual(names, expected) && bands.every(({arrayDimensions}) => arrayDimensions === 0), name, {
            ms: Date.now() - start, expected, built: names
        })
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

const expectCatalogue = async (name, recipe) => {
    try {
        const answers = await Promise.all([undefined, {selection: []}, {selection: ['red']}].map(args =>
            firstValueFrom(ImageFactory(recipe, args).getBands$())
        ))
        report(answers.every(answer => _.isEqual(answer, DECLARED)), name, {answers: _.uniqWith(answers, _.isEqual)})
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

const expectBranch = async (label, recipe, emptyRequest) => {
    await expectCatalogue(`${label}: catalogue, however asked`, recipe)
    await expectBuilt(`${label}: every declared band, asked for`, recipe, {selection: DECLARED}, DECLARED)
    await expectBuilt(`${label}: asked for nothing`, recipe, undefined, emptyRequest)
    await expectBuilt(`${label}: an empty selection`, recipe, {selection: []}, emptyRequest)
}

const expectRefusedPixels = async (name, recipe, args) => {
    const expected = /Expected a homogeneous image collection/
    try {
        const values = await sampled(recipe, args)
        report(false, name, {expected: String(expected), sampled: values})
    } catch (error) {
        report(expected.test(error.message), name, {expected: String(expected), error: error.message.split('\n')[0]})
    }
}

const expectMatchedSchema = async (label, recipe) => {
    await expectBuilt(`${label}: every declared band, asked for (schema only)`, recipe, {selection: DECLARED}, DECLARED)
    await expectBuilt(`${label}: asked for nothing (schema only)`, recipe, undefined, DECLARED)
    await expectBuilt(`${label}: an empty selection (schema only)`, recipe, {selection: []}, DECLARED)
    try {
        const values = await sampled(recipe, {selection: DECLARED})
        const nulls = Object.values(values).every(value => value === null)
        console.info(`NOTE ${label}: sampled values ${nulls ? 'all null - no pixel or encoding evidence' : 'not null - still no round-trip evidence from synthetic imagery'}`)
    } catch (error) {
        report(false, `${label}: sampling`, {error: error.message})
    }
}

// Each stored index against the index computed from the sampled spectral bands.
const expectStoredIndexes = async name => {
    try {
        const values = await sampled(BASEMAPS, {selection: DECLARED})
        const judgement = storedIndexJudgement(values)
        report(judgement.passed, name, {values, ...judgement})
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

// A sample passes only with a number for every declared band, an expected value computable for every index, and
// every stored index within one of it.
const storedIndexJudgement = values => {
    const unusable = unusableBands(values, DECLARED)
    if (unusable.length) {
        return {passed: false, unusable}
    }
    const {blue, green, red, nir} = _.mapValues(_.pick(values, FOUR), value => value / 10000)
    const kernel = Math.exp(-((nir - red) ** 2) / (2 * 0.2 ** 2))
    const computed = {
        ndvi: (nir - red) / (nir + red),
        ndwi: (green - nir) / (green + nir),
        evi: 2.5 * ((nir - red) / (nir + 6 * red - 7.5 * blue + 1)),
        evi2: 2.5 * (nir - red) / (nir + 2.4 * red + 1),
        savi: (nir - red) * 1.5 / (nir + red + 0.5),
        kndvi: (1 - kernel) / (1 + kernel)
    }
    const uncomputable = unusableBands(computed, INDEXES)
    if (uncomputable.length) {
        return {passed: false, uncomputable}
    }
    const off = INDEXES.filter(index => Math.abs(values[index] - computed[index] * 10000) > 1)
    return {passed: !off.length, off}
}

const realCheck = async (name, recipe) => {
    const start = Date.now()
    try {
        const values = await sampled(recipe, {selection: DECLARED})
        const unusable = unusableBands(values, DECLARED)
        report(!unusable.length, name, {ms: Date.now() - start, sampled: values, unusable})
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

// The bands a sample holds no finite number for: missing, masked or not a number.
const unusableBands = (values, bands) =>
    bands.filter(band => !Number.isFinite(values?.[band]))

const main = async () => {
    await authenticate()
    substituteSyntheticCollections()
    const realNicfi = process.env.PLANET_REAL_NICFI === '1'
    const realDaily = process.env.PLANET_REAL_DAILY

    console.info('Schema (synthetic collections: algorithm, not ingestion)')
    for (const [label, recipe, emptyRequest] of BRANCHES) {
        await expectBranch(label, recipe, emptyRequest)
    }
    await expectBuilt('a subset out of order', BASEMAPS, {selection: ['kndvi', 'red', 'ndvi']}, ['kndvi', 'red', 'ndvi'])
    await expectBuilt('a working band Daily keeps, asked for', BRANCHES[3][1], {selection: ['dayOfYear']}, ['dayOfYear'])
    await expectBuilt('a PSB.SD band, asked for', BRANCHES[5][1], {selection: ['redEdge', 'red']}, ['redEdge', 'red'])
    await expectCatalogue('Daily UDM2 and PSB.SD without matching: catalogue, however asked', MIXED)
    await expectRefusedPixels('Daily UDM2 and PSB.SD without matching, a pixel of every declared band', MIXED, {selection: DECLARED})
    await expectRefusedPixels('Daily UDM2 and PSB.SD without matching, a pixel of one band', MIXED, {selection: ['red']})
    for (const [label, recipe] of MATCHED) {
        await expectMatchedSchema(label, recipe)
    }

    console.info('Pixels (synthetic collections: algorithm, not ingestion)')
    await expectStoredIndexes('each index stored per ten thousand of its value over the sampled spectral bands')

    console.info('Real ingestion')
    if (realNicfi) {
        await realCheck('NICFI basemaps, every declared band', planet({source: 'NICFI'}))
    } else {
        console.info('BLOCKED NICFI basemaps: not covered unless requested with PLANET_REAL_NICFI=1')
    }
    if (realDaily) {
        await realCheck(`Daily ${realDaily}, every declared band`, planet({source: 'DAILY', assets: [realDaily]}))
    } else {
        console.info('BLOCKED Planet Daily: not covered unless requested with PLANET_REAL_DAILY=<collection id>')
    }

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

function image(date, values, names) {
    const footprint = ee.Geometry.Polygon([AOI])
    return ee.Image.constant(values).rename(names).int16().clip(footprint).set(
        'system:time_start', ee.Date(date).millis(),
        'system:time_end', ee.Date(date).advance(1, 'day').millis()
    )
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
