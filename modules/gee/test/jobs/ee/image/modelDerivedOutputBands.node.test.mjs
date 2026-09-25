import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// The bands Regression, Unsupervised Classification, Index Change, Class Change, Classification and Remapping build,
// through the REAL imageFactory, asset, covariate, training, classification, clustering, change and remapping code,
// against their shared declarations. Only Earth Engine is substituted: an image is its bands' names and
// dimensionality, and an image operation not modelled here fails. Objects without bands answer anything. Launched
// from a Jest bridge (test/support/nodeWitness.js).

const ASSETS = {
    'users/x/covariates': ['red', 'nir', 'swir1'],
    'users/x/ndvi': ['ndvi', 'ndvi_error'],
    'users/x/classes-before': ['class', 'probability_1', 'probability_2'],
    'users/x/classes-after': ['landcover', 'probability_1', 'probability_2']
}

const scalar = name => ({name, arrayDimensions: 0})

// RxJS takes a value with then() for a promise and one with schedule() for a scheduler; no Earth Engine object is.
const NOT_EARTH_ENGINE = ['then', 'schedule']

const opaque = () => new Proxy(function () {}, {
    get: (_target, key) => typeof key === 'symbol' || NOT_EARTH_ENGINE.includes(key) ? undefined : () => opaque(),
    apply: () => opaque()
})

const eeImage = bands => new Proxy({bands}, {
    get: (target, key) => {
        if (key === 'bands') {
            return target.bands
        }
        if (typeof key === 'symbol' || NOT_EARTH_ENGINE.includes(key)) {
            return undefined
        }
        if (!IMAGE_OPERATIONS[key]) {
            throw new Error(`Earth Engine image operation not modelled here: ${key}`)
        }
        return (...args) => IMAGE_OPERATIONS[key](target.bands, ...args)
    }
})

const named = (bands, names) => bands.filter(({name}) => names.includes(name))

// Earth Engine's own naming: classify() yields one scalar `classification` band, cluster() one scalar band under the
// name it is given, remap() one named `remapped`, reduce() one band per reducer output, and a constant or an
// expression one named `constant`. Arithmetic and comparisons keep their left operand's bands. toArray() makes one
// array band of them all; arrayGet() and arrayLength() leave scalars.
const keep = bands => eeImage(bands)
const toScalars = bands => eeImage(bands.map(band => ({...band, arrayDimensions: 0})))

// A selection by name answers the bands in the order it names them, and refuses one the image does not hold.
const selected = (bands, names) => names.map(name => {
    const band = bands.find(band => band.name === name)
    if (!band) {
        throw new Error(`Image has no band ${name}`)
    }
    return band
})

const IMAGE_OPERATIONS = {
    select: (bands, selection) => eeImage(typeof selection === 'number' ? [bands[selection]] : selected(bands, [selection].flat())),
    selectExisting: (bands, names) => eeImage(named(bands, names)),
    addBands: (bands, other) => eeImage([...bands.filter(({name}) => !named(other.bands, [name]).length), ...other.bands]),
    rename: (bands, names) => {
        const renamed = [names].flat()
        assert.equal(renamed.length, bands.length, `renaming ${bands.length} bands to ${renamed}`)
        return eeImage(bands.map((band, index) => ({...band, name: renamed[index]})))
    },
    classify: () => eeImage([scalar('classification')]),
    cluster: (_bands, _clusterer, outputName = 'cluster') => eeImage([scalar(outputName)]),
    reduce: () => eeImage([scalar('max')]),
    remap: () => eeImage([scalar('remapped')]),
    expression: () => eeImage([scalar('constant')]),
    subtract: keep,
    divide: keep,
    abs: keep,
    where: keep,
    lt: keep,
    lte: keep,
    gt: keep,
    gte: keep,
    eq: keep,
    neq: keep,
    and: keep,
    int8: keep,
    int16: keep,
    uint8: keep,
    multiply: keep,
    add: keep,
    toArray: () => eeImage([{name: 'array', arrayDimensions: 1}]),
    arrayPad: keep,
    arrayMask: keep,
    arrayLength: toScalars,
    arrayGet: toScalars,
    float: bands => eeImage(bands),
    mask: bands => eeImage(bands),
    updateMask: bands => eeImage(bands),
    clip: bands => eeImage(bands),
    bandNames: () => opaque(),
    geometry: () => opaque(),
    sample: () => opaque(),
    sampleRegions: () => opaque(),
    stratifiedSample: () => opaque()
}

const imageOf = value => {
    if (typeof value === 'string') {
        return eeImage(ASSETS[value].map(scalar))
    }
    if (Array.isArray(value)) {
        return eeImage(value.flatMap(image => image.bands))
    }
    if (value === EE_ARRAY) {
        return eeImage([{name: 'constant', arrayDimensions: 1}])
    }
    return value === undefined || typeof value === 'number' ? eeImage([scalar('constant')]) : value
}

const EE_ARRAY = {}

// A list computed on the server, such as the classes a classifier was trained on, whose members are unknown here.
// Iterating it answers its initial value, as for a list without members.
const serverList = () => ({
    zip: () => serverList(),
    size: () => opaque(),
    iterate: (_fn, initial) => initial
})

// A collection is its images; reducing, averaging or mosaicking it keeps the first one's bands, as Earth Engine names
// them when every image shares one schema. One built on the server is of images unknown here.
const collectionOf = images => ({
    images,
    size: () => opaque(),
    reduce: () => images[0],
    mean: () => images[0],
    toBands: () => eeImage(Array.isArray(images) ? images.flatMap(image => image.bands) : [])
})

const ee = new Proxy({
    getAsset$: id => ASSETS[id] ? of({type: 'Image'}) : throwError(() => new Error(`No asset ${id}`)),
    Image: imageOf,
    ImageCollection: collectionOf,
    // Mosaicking no images at all leaves no bands, as Earth Engine does.
    mosaic: ({images}) => eeImage(images.length ? images[0].bands : []),
    List: Object.assign(() => serverList(), {sequence: () => serverList()}),
    Array: () => EE_ARRAY,
    // Only one branch is evaluated, on the server, from what the images hold: both must build the same bands.
    Algorithms: {
        If: (_condition, whenTrue, whenFalse) => {
            assert.deepEqual(whenFalse.bands, whenTrue.bands, 'both branches build the same bands')
            return whenTrue
        }
    }
}, {
    get: (target, key) => target[key] || opaque()
})

mock.module('#sepal/ee/ee', {exports: {default: ee}})

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: imageFactory} = await import('#sepal/ee/imageFactory')
const {recipeType} = await import('#sepal/recipe/recipeTypeRegistry')
const {withOutputBands} = await import('#sepal/ee/outputBands')

const inOperation = (name, fn) => it(name, async () => {
    const scope = new RecipeScope(id => throwError(() => new Error(`No recipe ${id}`)))
    try {
        await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
})

const covariates = {
    imageId: 'image-1',
    type: 'ASSET',
    id: 'users/x/covariates',
    bandSetSpecs: [{type: 'IMAGE_BANDS', included: ['red', 'nir']}]
}

const REGRESSION = {
    id: 'regression-1',
    type: 'REGRESSION',
    model: {
        inputImagery: {images: [covariates]},
        trainingData: {dataSets: [{type: 'EE_TABLE', referenceData: [{x: 1, y: 2, value: 3.5}]}]},
        classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25},
        scale: 30
    }
}

const UNSUPERVISED_CLASSIFICATION = {
    id: 'clusters-1',
    type: 'UNSUPERVISED_CLASSIFICATION',
    model: {
        inputImagery: {images: [covariates]},
        sampling: {numberOfSamples: 1000, sampleScale: 30},
        clusterer: {type: 'KMEANS', numberOfClusters: 5},
        scale: 30
    }
}

const NDVI = {type: 'ASSET', id: 'users/x/ndvi', band: 'ndvi'}

const rule = (value, operator) => ({
    value,
    booleanOperator: 'and',
    constraints: [{image: 'this-recipe', band: 'difference', operator, value: 0}]
})

const indexChange = ({errorBand, entries = [rule(1, '<'), rule(2, '='), rule(3, '>')]} = {}) => ({
    id: 'index-change-1',
    type: 'INDEX_CHANGE',
    model: {
        fromImage: {...NDVI, ...(errorBand && {errorBand})},
        toImage: {...NDVI, ...(errorBand && {errorBand})},
        legend: {entries},
        options: {minConfidence: 2.5}
    }
})

const LEGEND_ENTRIES = [{value: 1, label: 'Forest'}, {value: 2, label: 'Other'}]

const CLASS_CHANGE = {
    id: 'class-change-1',
    type: 'CLASS_CHANGE',
    model: {
        fromImage: {type: 'ASSET', id: 'users/x/classes-before', band: 'class', legendEntries: LEGEND_ENTRIES},
        toImage: {type: 'ASSET', id: 'users/x/classes-after', band: 'landcover', legendEntries: LEGEND_ENTRIES},
        options: {minConfidence: 0}
    }
}

const legend = values => ({entries: values.map(value => ({value, label: `class ${value}`, color: '#000000'}))})

const classification = ({classifier = 'RANDOM_FOREST', values = [1, 2]} = {}) => ({
    id: 'classification-1',
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [covariates]},
        legend: legend(values),
        trainingData: {dataSets: [{type: 'SAMPLE_CLASSIFICATION', referenceData: [{x: 1, y: 2, class: 1}]}]},
        classifier: {type: classifier, normalize: 'NO', decisionTree: '1) root 9 0 1 (1)'},
        scale: 30
    }
})

const remapping = ({values = [1, 2]} = {}) => ({
    id: 'remapping-1',
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [{...covariates, includedBands: [{band: 'red'}]}]},
        legend: {entries: legend(values).entries.map(entry => ({
            ...entry,
            booleanOperator: 'and',
            constraints: [{image: 'image-1', band: 'red', operator: '>', value: 0}]
        }))}
    }
})

const declared = recipe => recipeType(recipe.type).imageOutput.describe({recipe}).bands

for (const [type, recipe] of [
    ['Regression', REGRESSION],
    ['Unsupervised Classification', UNSUPERVISED_CLASSIFICATION],
    ['Index Change with a legend', indexChange()],
    ['Index Change with error bands', indexChange({errorBand: 'ndvi_error'})],
    ['Index Change without a legend', indexChange({entries: []})],
    ['Class Change', CLASS_CHANGE],
    ['Classification by a random forest', classification()],
    ['Classification by a support vector machine', classification({classifier: 'SVM'})],
    ['Classification by a minimum distance classifier', classification({classifier: 'MINIMUM_DISTANCE'})],
    ['Classification by a decision tree', classification({classifier: 'DECISION_TREE'})],
    ['Classification with a legend not stored in value order', classification({values: [10, 2, 5]})],
    ['Remapping', remapping()],
    ['Remapping without legend entries', remapping({values: []})]
]) {
    describe(type, () => {
        inOperation('builds exactly the bands it declares, with the dimensionality it declares', async () => {
            const built = await firstValueFrom(imageFactory(recipe).getImage$())

            assert.deepEqual(
                built.bands,
                declared(recipe).map(({name, dataType}) => ({name, arrayDimensions: dataType.arrayDimensions}))
            )
        })

        inOperation('says it can be asked for exactly the bands it declares', async () => {
            const catalogue = await firstValueFrom(imageFactory(recipe).getBands$())

            assert.deepEqual(catalogue, declared(recipe).map(({name}) => name))
        })
    })
}

// Exports name the bands they want twice, as the selection to build and as the bands to return in order.
describe('Classification built for an export', () => {
    const names = image => image.bands.map(({name}) => name)

    inOperation('builds the bands selected and returns them in the order selected', async () => {
        const built = await firstValueFrom(
            imageFactory(classification(), withOutputBands({selection: ['probability_2', 'class', 'regression']})).getImage$()
        )

        assert.deepEqual(names(built), ['probability_2', 'class', 'regression'])
    })

    inOperation('builds a selection that names no output order in the order it always has', async () => {
        const built = await firstValueFrom(
            imageFactory(classification(), {selection: ['probability_2', 'class', 'regression']}).getImage$()
        )

        assert.deepEqual(names(built), ['class', 'regression', 'probability_2'])
    })
})

// CCDC fits the regression and per-class probabilities of the classification it is given, as that classification
// names them.
describe('CCDC over a Classification', () => {
    const classes = classification({values: [10, 2, 5]})
    const ccdc = {
        id: 'ccdc-1',
        type: 'CCDC',
        model: {
            dates: {startDate: '2000-01-01', endDate: '2020-01-01'},
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi'], classification: classes.id},
            options: {corrections: ['SR']},
            ccdcOptions: {dateFormat: 1}
        }
    }

    it('can be asked for the regression and probabilities the classification declares, in its legend order, and not its class', async () => {
        const scope = new RecipeScope(id => id === classes.id ? of(classes) : throwError(() => new Error(`No recipe ${id}`)))
        try {
            const catalogue = await withRecipeScope(scope, () => firstValueFrom(imageFactory(ccdc).getBands$()))

            assert.deepEqual(
                catalogue.filter(band => band.endsWith('_coefs') && /^(regression|probability_|class)/.test(band)),
                ['regression_coefs', 'probability_10_coefs', 'probability_2_coefs', 'probability_5_coefs']
            )
        } finally {
            scope.close()
        }
    })
})
