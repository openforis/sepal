// Whether a Classification applied to other imagery - the exported classifyImage, as time-series collections and PyEO
// Alerts call it - classifies on the features it trained on, transformed as they were.
//
// The Classification is one Landsat scene's three surface reflectance bands and latitude, trained on nine inline
// points. Its own image, and classifyImage over that same scene built as the Classification builds its input - every
// other band of the scene passed along, raw - are the same features and the same training data, so they must agree:
//
//   - training features: the training samples - each one's class and features together - equal the scene's raw
//     features at those points scaled by the statistics the training data carries (feature_statistics), as computed
//     here from the documented transformation; without normalisation, the raw features themselves, and no statistics
//     carried. This inspects what is trained on, not the features prediction is given;
//   - predictions: what prediction is given is checked through what it predicts - class, and for SVM a class
//     probability, compared pixel by pixel over an area of the scene, values and masks, with pixels valid in both;
//   - footprint: both bounded, the same area;
//   - mask: a scene masked over part of the area is classified nowhere there, and still elsewhere.
//
// Normalising SVM and minimum-distance classifiers are compared beside a non-normalising SVM and a Random Forest.
//
// Reused training data is checked the same way. A provider - a Classification over the same path and row on another
// date, found at run time, so its ranges differ - stores points of its own, and a normalising SVM and a Random Forest
// consumer each reuse it. The consumer's training rows must be the provider's raw features at its own points over its
// own scene, scaled by the CONSUMER's statistics where the consumer normalises and raw where it does not, followed by
// the consumer's own rows: both blocks non-empty, each compared as whole rows, in that order. Prediction, footprint and
// mask are checked for the reusing consumers too.
//
// Reuse samples the consumer's features of the provider's own imagery, whatever the provider selects
// (lib/js/ee/src/classification/features.js): a provider selecting one band of its scene gives the same rows as one
// selecting all three. Over two inputs each - consumer [Stack of its scene as red, nir, swir1; SRTM elevation],
// provider [SRTM; Stack of its scene spelling red as Red] - on the standalone path (getTrainingData$, never the
// collection's classifyImage, which stays one-input), each training row must equal an independent construction: red,
// nir, ndvi calculated of them as the index calculator does, red - nir, latitude, elevation and latitude again, sampled
// at each recipe's points on the grid of its optical band at its scale, scaled by the consumer's statistics where it
// normalises. A provider point outside its scene, where SRTM still has values, is no sample. A provider whose Stack
// holds red beside Red fails the evaluation, naming both.
//
// The feature construction itself (definedFeatures), over constant images: of two provider points, the one where a
// required band is masked is no sample and the other is, an input supplying nothing masked at the other; an index is
// supplied by the input holding all its bands though another, lacking one, holds red beside Red; a band named as a
// configured covariate still combines with another, the covariate generated beside it; and a consumer combining red
// with Red is refused rather than given red - red.
//
// A comparison without samples or jointly valid pixels fails. Read-only: the recipes are held in memory and read
// through a RecipeScope of the run's own, nothing is saved and no asset is written. Authenticates with the service
// account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/classifierNormalisation.mjs

import _ from 'lodash'
import {firstValueFrom, map, of, timeout, zip} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {addCovariates, definedFeatures, featureDefinition, samplingProjection} from '#sepal/ee/classification/features'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'

import {sameRows} from './featureRows.mjs'
import {identical, pixelComparison} from './pixelComparison.mjs'

const COLLECTION = 'LANDSAT/LC08/C02/T1_L2'
const SCENE_INDEX = 'LC08_231062_20230613'
const SCENE = `${COLLECTION}/${SCENE_INDEX}`
const SCENE_BANDS = ['SR_B4', 'SR_B5', 'SR_B6']
const FEATURES = [...SCENE_BANDS, 'latitude']
const READ_TIMEOUT_MS = 300000
const SCALE = 30
// Features are stored as 32-bit floats, latitude among them.
const TOLERANCE = 1e-5

const point = (x, y, value) => ({x, y, class: value})

// Water, forest and city around Manaus, all inside the scene.
const REFERENCE_DATA = [
    point(-60.02, -3.13, 2), point(-60.03, -3.14, 2), point(-60.01, -3.135, 2),
    point(-60.30, -2.80, 5), point(-60.31, -2.81, 5), point(-60.29, -2.79, 5),
    point(-60.00, -3.05, 10), point(-60.01, -3.06, 10), point(-59.99, -3.07, 10)
]

// Around the points, compared at a coarser scale; the scene is masked east of MASKED_EAST_OF in the mask check.
// A function, as Earth Engine builds no geometry before it is initialized.
const area = () => ee.Geometry.Rectangle([-60.33, -3.16, -59.97, -2.77])
const COMPARED_SCALE = 90
const MASKED_EAST_OF = -60.15

const CLASSIFIERS = {
    'SVM, normalised': {type: 'SVM', decisionProcedure: 'Voting', svmType: 'C_SVC', kernelType: 'LINEAR', shrinking: true, cost: 1, normalize: 'YES'},
    'minimum distance, normalised': {type: 'MINIMUM_DISTANCE', metric: 'euclidean', normalize: 'YES'},
    'SVM, not normalised': {type: 'SVM', decisionProcedure: 'Voting', svmType: 'C_SVC', kernelType: 'LINEAR', shrinking: true, cost: 1, normalize: 'NO'},
    'Random Forest': {type: 'RANDOM_FOREST', numberOfTrees: 5, variablesPerSplit: null, minLeafPopulation: 1, bagFraction: 0.5, maxNodes: null, seed: 1}
}

const NORMALISING = ['SVM, normalised', 'minimum distance, normalised']

// The provider's points: a subset, so its rows can be counted apart from the consumer's.
const PROVIDER_POINTS = REFERENCE_DATA.slice(0, 6)
const PROVIDER = 'classifier-normalisation-provider'

// Consumers reusing a normalising provider's training data.
const REUSING = ['SVM, normalised', 'Random Forest']

const inputOf = id => ({imageId: 'image-1', type: 'ASSET', id, bandSetSpecs: [{type: 'IMAGE_BANDS', included: SCENE_BANDS}]})

const INPUT = inputOf(SCENE)

const classification = (classifier, {id = 'classifier-normalisation-verify', input = INPUT, points = REFERENCE_DATA, reuses = []} = {}) => ({
    id,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [input]},
        legend: {entries: [2, 5, 10].map(value => ({id: `entry-${value}`, value, label: `class ${value}`, color: '#000000'}))},
        trainingData: {dataSets: [
            ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe})),
            {dataSetId: 'points', type: 'SAMPLE_CLASSIFICATION', referenceData: points}
        ]},
        auxiliaryImagery: ['LATITUDE'],
        classifier,
        scale: SCALE
    }
})

// The bands each path is asked for: class, and a class probability where the classifier gives them.
const predictedBands = classifier => classifier.type === 'MINIMUM_DISTANCE' ? ['class'] : ['class', 'probability_5']

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

const read = (description, value) => firstValueFrom(ee.getInfo$(value, description).pipe(timeout(READ_TIMEOUT_MS)))

// The Classification's own image, its training data, and the scene classified through classifyImage with that
// training data - the scene built as the Classification builds its input, masked as `mask` says.
const paths = (recipe, bands, mask) => {
    const own = ImageFactory(recipe, {selection: bands})
    return firstValueFrom(zip(own.getImage$(), own.getTrainingData$(), ImageFactory(INPUT).getImage$()).pipe(
        map(([ownImage, trainingData, scene]) => ({
            ownImage,
            trainingData,
            scene,
            applied: own.classifyImage(mask ? scene.updateMask(mask) : scene, bands, trainingData)
        })),
        timeout(READ_TIMEOUT_MS)
    ))
}

// The scene's raw features as the Classification derives them: its bands and latitude.
const rawFeatures = scene => scene.select(SCENE_BANDS).addBands(ee.Image.pixelLonLat().select('latitude').float())

// The training samples beside the scene's raw features at the same points, scaled by the carried statistics where
// there are any - and, for a reused provider, its scene's raw features at its points, scaled by the same statistics:
// each sample a row of its class and features, compared as rows, as the samples carry no geometry to pair them by.
const featureEvidence = ({trainingData, scene}, provider) => {
    const statistics = trainingData.get('feature_statistics')
    return read('features', ee.Dictionary({
        statistics,
        bandOrder: trainingData.get('band_order'),
        trained: rowsOf(trainingData),
        expected: expectedRows(scene, statistics, REFERENCE_DATA),
        ...(provider && {reused: expectedRows(provider.scene, statistics, provider.points)})
    }))
}

const expectedRows = (scene, statistics, points) => {
    const raw = rawFeatures(scene)
    const expected = ee.Image(ee.Algorithms.If(
        ee.Algorithms.IsEqual(statistics, null),
        raw,
        scaled(raw, ee.Dictionary(statistics))
    ))
    const collection = ee.FeatureCollection(points.map(({x, y, class: value}) => ee.Feature(ee.Geometry.Point([x, y]), {class: value})))
    return rowsOf(expected.sampleRegions({collection, properties: ['class'], scale: SCALE}))
}

const ROW = ['class', ...FEATURES]

const rowsOf = samples => samples.reduceColumns({reducer: ee.Reducer.toList(ROW.length), selectors: ROW}).get('list')

// The transformation as the Classification documents it, computed here independently of execution.
const scaled = (image, statistics) => ee.Image(FEATURES.map(band => {
    const min = statistics.getNumber(`${band}_min`)
    const max = statistics.getNumber(`${band}_max`)
    return ee.Image(ee.Algorithms.If(
        min.eq(max),
        image.select(band).divide(max),
        image.select(band).subtract(min).divide(max.subtract(min))
    )).rename(band)
}))

// Two images over the area, band by band, as pixelComparison reads them.
const pixelDifferences = (image, reference) => {
    const region = {geometry: area(), scale: COMPARED_SCALE, maxPixels: 1e8}
    const jointlyValid = image.mask().and(reference.mask())
    return read('pixel differences', ee.Dictionary({
        bands: image.bandNames(),
        referenceBands: reference.bandNames(),
        maskDifferences: image.mask().neq(reference.mask()).reduceRegion({reducer: ee.Reducer.sum().unweighted(), ...region}),
        maxAbsoluteDifference: image.subtract(reference).abs().updateMask(jointlyValid).reduceRegion({reducer: ee.Reducer.max(), ...region}),
        jointlyValid: jointlyValid.reduceRegion({reducer: ee.Reducer.sum().unweighted(), ...region})
    }))
}

const footprints = (image, reference) => read('footprints', ee.Dictionary({
    unbounded: image.geometry().isUnbounded(),
    referenceUnbounded: reference.geometry().isUnbounded(),
    area: image.geometry().area(100),
    referenceArea: reference.geometry().area(100),
    differingArea: image.geometry().symmetricDifference(reference.geometry(), 100).area(100)
}))

// Valid pixels of the class band in the masked and the unmasked part of the area.
const validCounts = image => {
    const longitude = ee.Image.pixelLonLat().select('longitude')
    const valid = image.select('class').mask()
    const count = part => valid.updateMask(part).reduceRegion({reducer: ee.Reducer.sum().unweighted(), geometry: area(), scale: COMPARED_SCALE, maxPixels: 1e8}).get('class')
    return read('valid pixels', ee.Dictionary({masked: count(longitude.gt(MASKED_EAST_OF)), unmasked: count(longitude.lte(MASKED_EAST_OF))}))
}

const verify = async name => {
    const classifier = CLASSIFIERS[name]
    const recipe = classification(classifier)
    const bands = predictedBands(classifier)
    const normalising = NORMALISING.includes(name)
    const {ownImage, applied, ...training} = await paths(recipe, bands)

    const features = await featureEvidence(training)
    report(
        sameRows(features.trained, features.expected, TOLERANCE)
            && Boolean(features.statistics) === normalising
            && _.isEqual(features.bandOrder, FEATURES),
        `${name}: each training sample is the scene's features at its point ${normalising ? 'scaled by the carried statistics' : 'raw, no statistics carried'}`,
        features
    )
    await verifyApplication(name, recipe, bands, {ownImage, applied})
}

// A consumer reusing a normalising provider's training data: the provider's rows first, raw features of its own scene
// at its own points scaled by the consumer's statistics, or raw; then the consumer's own.
const verifyReuse = async (name, providerInput, providerSelection = 'selecting its scene\'s bands') => {
    const classifier = CLASSIFIERS[name]
    const recipe = classification(classifier, {reuses: [PROVIDER]})
    const provider = classification(CLASSIFIERS['SVM, normalised'], {id: PROVIDER, input: providerInput, points: PROVIDER_POINTS})
    const bands = predictedBands(classifier)
    const normalising = NORMALISING.includes(name)
    await inScope({[PROVIDER]: provider}, async () => {
        const {ownImage, applied, ...training} = await paths(recipe, bands)
        const providerScene = await firstValueFrom(ImageFactory(providerInput).getImage$().pipe(timeout(READ_TIMEOUT_MS)))
        const features = await featureEvidence(training, {scene: providerScene, points: PROVIDER_POINTS})
        const reused = features.reused || []
        report(
            reused.length > 0 && features.expected?.length > 0
                && features.trained?.length === reused.length + features.expected.length
                && sameRows(features.trained.slice(0, reused.length), reused, TOLERANCE)
                && sameRows(features.trained.slice(reused.length), features.expected, TOLERANCE)
                && Boolean(features.statistics) === normalising
                && _.isEqual(features.bandOrder, FEATURES),
            `${name} reusing a normalising provider ${providerSelection}: its rows are the provider's own features ${normalising ? 'scaled by the consumer\'s statistics' : 'raw'}, then its own`,
            features
        )
        await verifyApplication(`${name} reusing a normalising provider ${providerSelection}`, recipe, bands, {ownImage, applied})
    })
}

const verifyApplication = async (name, recipe, bands, {ownImage, applied}) => {
    const comparison = pixelComparison(await pixelDifferences(applied, ownImage))
    report(identical(comparison), `${name}: classifyImage over the same scene predicts what its own image does, pixel by pixel`, comparison)

    const footprint = await footprints(applied, ownImage)
    report(
        footprint.unbounded === false && footprint.referenceUnbounded === false && footprint.area > 0 && footprint.differingArea <= footprint.area * 1e-6,
        `${name}: classifyImage over the scene keeps the footprint its own image has`,
        footprint
    )

    const {applied: masked} = await paths(recipe, bands, ee.Image.pixelLonLat().select('longitude').lte(MASKED_EAST_OF))
    const valid = await validCounts(masked)
    report(valid.masked === 0 && valid.unmasked > 0, `${name}: a scene masked over part of the area is classified only where it is not`, valid)
}

const inScope = (catalogue, fn) => {
    const scope = new RecipeScope(id => of(catalogue[id]))
    return withRecipeScope(scope, fn).finally(() => scope.close())
}

// Another scene of the same path and row, the least cloudy, so the provider's imagery and ranges are its own.
const providerSceneId = async () => `${COLLECTION}/${await read('provider scene', ee.ImageCollection(COLLECTION)
    .filter(ee.Filter.eq('WRS_PATH', 231))
    .filter(ee.Filter.eq('WRS_ROW', 62))
    .filter(ee.Filter.neq('system:index', SCENE_INDEX))
    .filter(ee.Filter.lt('CLOUD_COVER', 20))
    .sort('CLOUD_COVER')
    .first()
    .get('system:index'))}`

// What a provider selecting one band of its scene is configured with: what it samples for a consumer is the consumer's.
const selectingOne = id => ({...inputOf(id), bandSetSpecs: [{type: 'IMAGE_BANDS', included: [SCENE_BANDS[0]]}]})

const DEM = 'USGS/SRTMGL1_003'
const CONSUMER_STACK = 'classifier-normalisation-consumer-stack'
const PROVIDER_STACK = 'classifier-normalisation-provider-stack'
// Inside the provider's path and row only through SRTM: far outside the scene.
const OUTSIDE = point(-50, -10, 5)
const MULTI_FEATURES = ['red', 'nir', 'ndvi', 'red_nir_difference', 'latitude', 'elevation', 'latitude_1']

const stack = (id, scene, outputs) => ({
    id,
    type: 'STACK',
    model: {
        inputImagery: {images: [{imageId: 's-1', type: 'ASSET', id: scene}]},
        bandNames: {bandNames: [{imageId: 's-1', bands: outputs.map(([originalName, outputName]) => ({originalName, outputName}))}]}
    }
})

const stackInput = (id, bandSetSpecs) => ({imageId: `image-${id}`, type: 'RECIPE_REF', id, bandSetSpecs})
const demInput = {imageId: 'image-dem', type: 'ASSET', id: DEM, bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['elevation']}]}

const multiInput = (classifier, {id, inputs, points, reuses = []}) => {
    const recipe = classification(classifier, {id, points, reuses})
    return {...recipe, model: {...recipe.model, inputImagery: {images: inputs}}}
}

// A recipe's features as the consumer defines them, built here independently of execution: of `scene`'s red and nir,
// the index as the calculator computes it - of stored values divided by ten thousand - their difference, latitude, then
// SRTM's elevation and latitude again; sampled at `points` on the grid of `scene`'s red band, scaled by `statistics`.
const expectedMultiRows = (scene, points, statistics) => {
    const image = ee.Image(scene)
    const red = image.select('SR_B4').rename('red')
    const nir = image.select('SR_B5').rename('nir')
    const ndvi = nir.divide(1e4).subtract(red.divide(1e4)).divide(nir.divide(1e4).add(red.divide(1e4))).rename('ndvi')
    const latitude = ee.Image.pixelLonLat().select('latitude').float()
    const raw = ee.Image.cat([
        red, nir, ndvi, red.subtract(nir).rename('red_nir_difference'), latitude.rename('latitude'),
        ee.Image(DEM).select('elevation'), latitude.rename('latitude_1')
    ]).updateMask(image.select('SR_B4').mask())
    const features = ee.Image(ee.Algorithms.If(ee.Algorithms.IsEqual(statistics, null), raw, scaledBands(raw, ee.Dictionary(statistics), MULTI_FEATURES)))
    const collection = ee.FeatureCollection(points.map(({x, y, class: value}) => ee.Feature(ee.Geometry.Point([x, y]), {class: value})))
    return features.sampleRegions({collection, properties: ['class'], scale: SCALE, projection: image.select('SR_B4').projection()})
        .reduceColumns({reducer: ee.Reducer.toList(MULTI_FEATURES.length + 1), selectors: ['class', ...MULTI_FEATURES]}).get('list')
}

const scaledBands = (image, statistics, bands) => ee.Image(bands.map(band => {
    const min = statistics.getNumber(`${band}_min`)
    const max = statistics.getNumber(`${band}_max`)
    return ee.Image(ee.Algorithms.If(
        min.eq(max),
        image.select(band).divide(max),
        image.select(band).subtract(min).divide(max.subtract(min))
    )).rename(band)
}))

// A consumer over two inputs reusing a provider over two others, in another order: whole rows, provider's first.
const verifyMultiInputReuse = async (name, providerScene) => {
    const classifier = CLASSIFIERS[name]
    const consumerInputs = [
        stackInput(CONSUMER_STACK, [
            {type: 'IMAGE_BANDS', included: ['red', 'nir', 'ndvi']},
            {type: 'PAIR_WISE_EXPRESSION', included: ['red', 'nir'], operation: 'DIFFERENCE'}
        ]),
        demInput
    ]
    const consumer = multiInput(classifier, {id: 'classifier-normalisation-multi', inputs: consumerInputs, points: REFERENCE_DATA, reuses: [PROVIDER]})
    const provider = multiInput(CLASSIFIERS['SVM, normalised'], {
        id: PROVIDER,
        inputs: [demInput, stackInput(PROVIDER_STACK, [{type: 'IMAGE_BANDS', included: ['Red']}])],
        points: [...PROVIDER_POINTS, OUTSIDE]
    })
    const catalogue = {
        [PROVIDER]: provider,
        [CONSUMER_STACK]: stack(CONSUMER_STACK, SCENE, [['SR_B4', 'red'], ['SR_B5', 'nir'], ['SR_B6', 'swir1']]),
        [PROVIDER_STACK]: stack(PROVIDER_STACK, providerScene, [['SR_B4', 'Red'], ['SR_B5', 'nir'], ['SR_B6', 'swir1']])
    }
    await inScope(catalogue, async () => {
        const trainingData = await firstValueFrom(ImageFactory(consumer).getTrainingData$().pipe(timeout(READ_TIMEOUT_MS)))
        const statistics = trainingData.get('feature_statistics')
        const rows = await read('multi-input rows', ee.Dictionary({
            bandOrder: trainingData.get('band_order'),
            statistics,
            trained: trainingData.reduceColumns({reducer: ee.Reducer.toList(MULTI_FEATURES.length + 1), selectors: ['class', ...MULTI_FEATURES]}).get('list'),
            reused: expectedMultiRows(providerScene, [...PROVIDER_POINTS, OUTSIDE], statistics),
            own: expectedMultiRows(SCENE, REFERENCE_DATA, statistics)
        }))
        const reused = rows.reused || []
        report(
            _.isEqual(rows.bandOrder, MULTI_FEATURES)
                && reused.length === PROVIDER_POINTS.length && rows.own?.length > 0
                && rows.trained?.length === reused.length + rows.own.length
                && sameRows(rows.trained.slice(0, reused.length), reused, TOLERANCE)
                && sameRows(rows.trained.slice(reused.length), rows.own, TOLERANCE)
                && Boolean(rows.statistics) === NORMALISING.includes(name),
            `${name} over two inputs reusing a provider over two others in another order: each row is the consumer's features of the provider's imagery at its points, the point outside its scene none, then its own`,
            rows
        )
    })
}

// A provider whose Stack holds red beside Red: neither is taken, and the evaluation says why.
const verifyCaseCollision = async providerScene => {
    const consumer = classification(CLASSIFIERS['Random Forest'], {id: 'classifier-normalisation-collision', reuses: [PROVIDER]})
    const collidingConsumer = {...consumer, model: {...consumer.model, auxiliaryImagery: [], inputImagery: {images: [
        stackInput(CONSUMER_STACK, [{type: 'IMAGE_BANDS', included: ['red', 'nir']}])
    ]}}}
    const provider = multiInput(CLASSIFIERS['Random Forest'], {
        id: PROVIDER,
        inputs: [stackInput(PROVIDER_STACK, [{type: 'IMAGE_BANDS', included: ['red']}])],
        points: PROVIDER_POINTS
    })
    const catalogue = {
        [PROVIDER]: provider,
        [CONSUMER_STACK]: stack(CONSUMER_STACK, SCENE, [['SR_B4', 'red'], ['SR_B5', 'nir']]),
        [PROVIDER_STACK]: stack(PROVIDER_STACK, providerScene, [['SR_B4', 'red'], ['SR_B3', 'Red'], ['SR_B5', 'nir']])
    }
    await inScope(catalogue, async () => {
        const trainingData = await firstValueFrom(ImageFactory(collidingConsumer).getTrainingData$().pipe(timeout(READ_TIMEOUT_MS)))
        const outcome = await read('colliding rows', trainingData.size()).then(size => ({size}), error => ({error: error.message}))
        report(
            /matches red \(input image 1: red, Red\)/.test(outcome.error || ''),
            'a provider whose input holds red beside Red fails the evaluation, naming both',
            outcome
        )
    })
}

// Constant images of named bands, masked where `masked` - a longitude half-plane, east or west of MASKED_EAST_OF - says.
const constant = (bands, masked = {}) => ee.Image(Object.entries(bands).map(([name, value]) => {
    const image = ee.Image.constant(value).rename(name).float()
    const longitude = ee.Image.pixelLonLat().select('longitude')
    return masked[name] === 'east' ? image.updateMask(longitude.lte(MASKED_EAST_OF))
        : masked[name] === 'west' ? image.updateMask(longitude.gt(MASKED_EAST_OF))
            : image
}))

// One point west of MASKED_EAST_OF and one east of it.
const PROBE_POINTS = [point(-60.30, -2.80, 1), point(-60.00, -3.05, 2)]

// What a provider over `providerImages` supplies a consumer over one constant input selecting `bandSetSpecs`, sampled at
// PROBE_POINTS as reuse samples them: its rows, or the evaluation's error.
const probe = (consumerBands, bandSetSpecs, providerImages, selectors, auxiliaryImagery = []) => {
    const consumerImage = constant(consumerBands)
    const features = addCovariates(consumerImage, bandSetSpecs, auxiliaryImagery)
    const definition = featureDefinition([{image: consumerImage, bandSetSpecs, features}], auxiliaryImagery)
    const supplied = definedFeatures(providerImages, definition, 'probe')
    const collection = ee.FeatureCollection(PROBE_POINTS.map(({x, y, class: value}) => ee.Feature(ee.Geometry.Point([x, y]), {class: value})))
    const samples = supplied.sampleRegions({collection, properties: ['class'], scale: SCALE, projection: samplingProjection(supplied, providerImages, definition)})
    return read('probe rows', samples.reduceColumns({reducer: ee.Reducer.toList(selectors.length + 1), selectors: ['class', ...selectors]}).get('list'))
        .then(rows => ({rows}), error => ({error: error.message}))
}

const verifyFeatureConstruction = async () => {
    const masked = await probe({red: 100, nir: 1000}, [{type: 'IMAGE_BANDS', included: ['red', 'nir']}], [
        constant({red: 120, nir: 1200}, {nir: 'east'}),
        constant({swir: 5}, {swir: 'west'})
    ], ['red', 'nir'])
    report(_.isEqual(masked.rows, [[1, 120, 1200]]), 'a provider point where a required band is masked is no sample, the other is, whatever an unused input masks', masked)

    const ndvi = (1200 / 1e4 - 120 / 1e4) / (1200 / 1e4 + 120 / 1e4)
    const unused = await probe({red: 100, nir: 1000}, [{type: 'IMAGE_BANDS', included: ['ndvi']}], [
        constant({red: 120, nir: 1200}),
        constant({red: 7, Red: 8})
    ], ['ndvi'])
    report(
        unused.rows?.length === 2 && unused.rows.every(([_class, value]) => Math.abs(value - ndvi) < TOLERANCE),
        'an index is supplied by the input holding its bands, whatever another input lacking one holds twice by case',
        unused
    )

    const covariateOperand = await probe({red: 100, latitude: 7}, [{type: 'PAIR_WISE_EXPRESSION', included: ['red', 'latitude'], operation: 'DIFFERENCE'}], [
        constant({red: 120, latitude: 3})
    ], ['red_latitude_difference', 'latitude'], ['LATITUDE'])
    report(
        covariateOperand.rows?.length === 2 && covariateOperand.rows.every(([pointClass, difference, latitude]) =>
            Math.abs(difference - 117) < TOLERANCE && Math.abs(latitude - PROBE_POINTS[pointClass - 1].y) < 0.01),
        'a band named as a configured covariate combines with another, the covariate generated beside it',
        covariateOperand
    )

    const caseless = await probe({red: 100, Red: 20}, [{type: 'PAIR_WISE_EXPRESSION', included: ['red', 'Red'], operation: 'DIFFERENCE'}], [
        constant({red: 120})
    ], ['red_Red_difference'])
    report(/combines red and Red into red_Red_difference, which differ only in case/.test(caseless.error || ''), 'a consumer combining red with Red is refused, not given red - red', caseless)
}

const main = async () => {
    await authenticate()
    for (const name of Object.keys(CLASSIFIERS)) {
        await verify(name)
    }
    const providerScene = await providerSceneId()
    console.info(`Provider scene: ${providerScene}`)
    for (const name of REUSING) {
        await verifyReuse(name, inputOf(providerScene))
        await verifyReuse(name, selectingOne(providerScene), 'selecting one band of its scene')
        await verifyMultiInputReuse(name, providerScene)
    }
    await verifyCaseCollision(providerScene)
    await verifyFeatureConstruction()
    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
