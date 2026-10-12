// What Classification and Remapping say they provide, against the image Earth Engine builds for them.
//
// Each recipe's shared declaration - names, order and scalar shape - is compared with the running image's bands, for
// classifiers of each family, a legend not stored in value order, and a Remapping with and without legend entries. An
// export's arguments are checked to build and return the requested bands in the requested order. Without legend
// entries, a probability-capable Classification's default output must fail with Earth Engine's refusal to reduce no
// bands, while a request for its class alone still runs.
//
// Remapping's inputs. Execution passes the bands each input includes as its `selection`, which an asset input does
// not read: an asset is built with every band it stores, and only the bands a constraint reads are selected from it.
// So only a missing band a constraint reads fails the image. A band an input lacks is compared, built and at one
// pixel, with what the declaration would say if it refused any included band its input's description lacks: for a
// band a constraint reads, for another band of an input a constraint reads, and for a band of an input no constraint
// reads. A constraint reading a band the asset stores but the input does not include is built and sampled too, and
// the asset input itself built as Remapping builds it.
//
// The input is one Landsat scene, trained on nine inline points. Read-only: recipes are held in memory, nothing is
// saved and no asset is written. Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/classificationOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {assetBandEvidence$, typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {classificationBands} from '#sepal/recipe/type/classification'
import {REMAPPING_BANDS, remappingBands} from '#sepal/recipe/type/remapping'

const SCENE = 'LANDSAT/LC08/C02/T1_L2/LC08_231062_20230613'
const ELEVATION = 'USGS/SRTMGL1_003'
const MISSING_BAND = 'not_a_band'
const MISSING_BAND_FAILURE = /not_a_band.*did not match any bands|did not match any bands.*not_a_band/
const READ_TIMEOUT_MS = 180000
const EMPTY_REDUCTION = /Unable to reduce an image with 0 bands/

const point = (x, y, value) => ({x, y, class: value})

// Water, forest and city around Manaus, all inside the scene.
const REFERENCE_DATA = [
    point(-60.02, -3.13, 2), point(-60.03, -3.14, 2), point(-60.01, -3.135, 2),
    point(-60.30, -2.80, 5), point(-60.31, -2.81, 5), point(-60.29, -2.79, 5),
    point(-60.00, -3.05, 10), point(-60.01, -3.06, 10), point(-59.99, -3.07, 10)
]

const CLASSIFIERS = {
    RANDOM_FOREST: {type: 'RANDOM_FOREST', numberOfTrees: 5, variablesPerSplit: null, minLeafPopulation: 1, bagFraction: 0.5, maxNodes: null, seed: 1},
    SVM: {type: 'SVM', decisionProcedure: 'Voting', svmType: 'C_SVC', kernelType: 'LINEAR', shrinking: true, cost: 1, normalize: 'NO'},
    NAIVE_BAYES: {type: 'NAIVE_BAYES', lambda: 0.000001},
    MINIMUM_DISTANCE: {type: 'MINIMUM_DISTANCE', metric: 'euclidean', normalize: 'NO'}
}

const legend = values => ({entries: values.map(value => ({id: `entry-${value}`, value, label: `class ${value}`, color: '#000000'}))})

const classification = ({classifier = 'RANDOM_FOREST', values = [2, 5, 10]} = {}) => ({
    id: 'classification-verify',
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [{
            imageId: 'image-1',
            type: 'ASSET',
            id: SCENE,
            bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['SR_B4', 'SR_B5', 'SR_B6']}]
        }]},
        legend: legend(values),
        trainingData: {dataSets: [{dataSetId: 'points', type: 'SAMPLE_CLASSIFICATION', referenceData: REFERENCE_DATA}]},
        auxiliaryImagery: [],
        classifier: CLASSIFIERS[classifier],
        scale: 30
    }
})

const remappingRule = (value, from, to) => ({
    id: `entry-${value}`,
    value,
    label: `class ${value}`,
    color: '#000000',
    booleanOperator: 'and',
    constraints: [{id: 'constraint', image: 'image-1', band: 'SR_B5', operator: 'range', from, to, fromInclusive: true, toInclusive: false}]
})

const remapping = (entries, images = [{imageId: 'image-1', type: 'ASSET', id: SCENE, includedBands: [{band: 'SR_B5'}]}]) => ({
    id: 'remapping-verify',
    type: 'REMAPPING',
    model: {
        inputImagery: {images},
        legend: {entries}
    }
})

const sceneIncluding = (...bands) => ({imageId: 'image-1', type: 'ASSET', id: SCENE, includedBands: bands.map(band => ({band}))})

// A rule reading the band of the scene this names.
const ruleReading = band => ({...remappingRule(1, 0, 20000), constraints: [{...remappingRule(1, 0, 20000).constraints[0], band}]})

const INPUT_CASES = [
    {name: 'valid inputs', images: [sceneIncluding('SR_B5')], rule: ruleReading('SR_B5'), executes: true, missing: []},
    {
        name: 'a missing band a constraint reads',
        images: [sceneIncluding(MISSING_BAND)],
        rule: ruleReading(MISSING_BAND),
        executes: false,
        missing: [`${SCENE}:${MISSING_BAND}`]
    },
    {
        name: 'a missing band no constraint reads, of an input one reads',
        images: [sceneIncluding('SR_B5', MISSING_BAND)],
        rule: ruleReading('SR_B5'),
        executes: true,
        missing: [`${SCENE}:${MISSING_BAND}`]
    },
    {
        name: 'a missing band of an input no constraint reads',
        images: [sceneIncluding('SR_B5'), {imageId: 'image-2', type: 'ASSET', id: ELEVATION, includedBands: [{band: MISSING_BAND}]}],
        rule: ruleReading('SR_B5'),
        executes: true,
        missing: [`${ELEVATION}:${MISSING_BAND}`]
    },
    {
        name: 'a band the asset stores but the input does not include, which a constraint reads',
        images: [sceneIncluding('SR_B4')],
        rule: ruleReading('SR_B5'),
        executes: true,
        missing: []
    }
]

// What an executing case builds, and its value at the sampled pixel: the rule's class, its band within the range there.
const EXECUTED_BANDS = [{name: 'class', arrayDimensions: 0}]
const EXECUTED_PIXEL = {class: 1}

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

// The bands of the image a factory builds with these arguments, or the failure to build it.
const built = async (recipe, args) => {
    try {
        return {bands: await firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
            switchMap(image => ee.getInfo$(typedBands(image), 'built bands')),
            timeout(READ_TIMEOUT_MS)
        ))}
    } catch (error) {
        return {error: error.message}
    }
}

// The value of the image a factory builds at one pixel inside the scene, or the failure to compute it.
const sampled = async recipe => {
    try {
        return {value: await firstValueFrom(ImageFactory(recipe).getImage$().pipe(
            switchMap(image => ee.getInfo$(image.reduceRegion({reducer: ee.Reducer.first(), geometry: ee.Geometry.Point([-60.30, -2.80]), scale: 30}), 'sampled pixel')),
            timeout(READ_TIMEOUT_MS)
        ))}
    } catch (error) {
        return {error: error.message}
    }
}

// The included bands each input's band evidence lacks, as the proposed description would refuse them.
const missingIncludedBands = async recipe => (await Promise.all(recipe.model.inputImagery.images.map(async ({id, includedBands}) => {
    const available = new Set((await firstValueFrom(assetBandEvidence$(id).pipe(timeout(READ_TIMEOUT_MS)))).map(({name}) => name))
    return includedBands.filter(({band}) => !available.has(band)).map(({band}) => `${id}:${band}`)
}))).flat()

const expectInputs = async ({name, images, rule, executes, missing: expectedMissing}) => {
    const recipe = remapping([rule], images)
    const [build, pixel, missing] = await Promise.all([built(recipe), sampled(recipe), missingIncludedBands(recipe)])
    const executed = _.isEqual(build.bands, EXECUTED_BANDS) && _.isEqual(pixel.value, EXECUTED_PIXEL)
    const refusedByEarthEngine = [build.error, pixel.error].every(error => MISSING_BAND_FAILURE.test(error || ''))
    report(
        (executes ? executed : refusedByEarthEngine)
            && _.isEqual(remappingBands(recipe.model), REMAPPING_BANDS)
            && _.isEqual(missing, expectedMissing),
        `Remapping over ${name}: ${executes ? 'executes' : 'refused by Earth Engine'}, ${missing.length ? 'newly refused' : 'described'} by the proposal`,
        {built: build.bands?.map(({name}) => name) || build.error, pixel: pixel.value || pixel.error, declaredToday: remappingBands(recipe.model).map(({name}) => name), proposalMissing: missing}
    )
}

const asBuilt = bands => bands.map(({name, dataType}) => ({name, arrayDimensions: dataType.arrayDimensions}))

let failures = 0

const report = (passed, name, details) => {
    failures += passed ? 0 : 1
    console.info(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(details)}`)
}

const expectDeclared = async (name, recipe, declared) => {
    const {bands, error} = await built(recipe)
    const expected = asBuilt(declared)
    report(!error && _.isEqual(bands, expected), name, {declared: expected.map(({name}) => name), built: bands || error})
}

const main = async () => {
    await authenticate()

    for (const classifier of Object.keys(CLASSIFIERS)) {
        const recipe = classification({classifier})
        await expectDeclared(`Classification by ${classifier}`, recipe, classificationBands(recipe.model))
    }

    const unsorted = classification({values: [10, 2, 5]})
    await expectDeclared('Classification with a legend not stored in value order', unsorted, classificationBands(unsorted.model))

    const requested = ['probability_2', 'class', 'regression']
    const exported = await built(classification(), withOutputBands({selection: requested}))
    report(
        _.isEqual(exported.bands?.map(({name}) => name), requested),
        'Classification exported with a mixed selection, in the order requested',
        {requested, built: exported.bands?.map(({name}) => name) || exported.error}
    )

    const withoutLegend = classification({values: []})
    const defaultOutput = await built(withoutLegend)
    report(
        EMPTY_REDUCTION.test(defaultOutput.error || ''),
        'Classification without legend entries, default output, refused by Earth Engine',
        {built: defaultOutput.bands || defaultOutput.error}
    )
    const classAlone = await built(withoutLegend, withOutputBands({selection: ['class']}))
    report(
        _.isEqual(classAlone.bands, [{name: 'class', arrayDimensions: 0}]),
        'Classification without legend entries, class alone, still built',
        {built: classAlone.bands || classAlone.error}
    )

    const withEntries = remapping([remappingRule(1, 0, 20000), remappingRule(2, 20000, 70000)])
    await expectDeclared('Remapping', withEntries, remappingBands(withEntries.model))
    const withoutEntries = remapping([])
    await expectDeclared('Remapping without legend entries', withoutEntries, remappingBands(withoutEntries.model))
    for (const inputCase of INPUT_CASES) {
        await expectInputs(inputCase)
    }
    const input = sceneIncluding('SR_B4')
    const asRemappingBuildsIt = await built(input, {selection: input.includedBands.map(({band}) => band)})
    report(
        asRemappingBuildsIt.bands?.length > 1 && asRemappingBuildsIt.bands.some(({name}) => name === 'SR_B5'),
        'An asset input, built as Remapping builds it, keeps every band it stores, not only those it includes',
        {included: ['SR_B4'], built: asRemappingBuildsIt.bands?.map(({name}) => name) || asRemappingBuildsIt.error}
    )

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
