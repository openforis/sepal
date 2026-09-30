// What Classification and Remapping say they provide, against the image Earth Engine builds for them.
//
// Each recipe's shared declaration - names, order and scalar shape - is compared with the running image's bands, for
// classifiers of each family, a legend not stored in value order, and a Remapping with and without legend entries. An
// export's arguments are checked to build and return the requested bands in the requested order. Without legend
// entries, a probability-capable Classification's default output must fail with Earth Engine's refusal to reduce no
// bands, while a request for its class alone still runs.
//
// The input is one Landsat scene, trained on nine inline points. Read-only: recipes are held in memory, nothing is
// saved and no asset is written. Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/classificationOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {classificationBands} from '#sepal/recipe/type/classification'
import {remappingBands} from '#sepal/recipe/type/remapping'

const SCENE = 'LANDSAT/LC08/C02/T1_L2/LC08_231062_20230613'
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

const remapping = entries => ({
    id: 'remapping-verify',
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [{imageId: 'image-1', type: 'ASSET', id: SCENE, includedBands: [{band: 'SR_B5'}]}]},
        legend: {entries}
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

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
