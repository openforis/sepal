import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// An SVM or minimum distance Classification trains on features scaled by the per-band range of its own imagery, and
// carries that range on its training data (feature_statistics), so that a scene classified with the training data
// (classifyImage, as time-series collections and PyEO Alerts call it) is scaled as the imagery trained on. Execution
// and the auxiliary covariates are the real ones; Earth Engine is a numeric stand-in: an image is four pixels per band,
// division by zero gives zero as Earth Engine documents, and a trained classifier records the features it trains on
// and is applied to, read by its training data's band_order, classifying each pixel as its nearest training sample.
// Reductions are counted as the expressions constructed, not as Earth Engine evaluations.

const state = {}

const SVM = {type: 'SVM', svmType: 'C_SVC', kernelType: 'RBF'}
const MINIMUM_DISTANCE = {type: 'MINIMUM_DISTANCE', metric: 'euclidean'}
const RANDOM_FOREST = {type: 'RANDOM_FOREST'}

// Classes 1, 1, 2 and 2 at the four pixels; both bands span their range, to [0, 0.25, 0.5, 1] and [0, 0.125, 0.5, 1].
const IMAGERY = {red: [100, 200, 300, 500], nir: [1000, 2000, 5000, 9000]}
const STATISTICS = {red_min: 100, red_max: 500, nir_min: 1000, nir_max: 9000}
const SCALED = [[0, 0], [0.25, 0.125], [0.5, 0.5], [1, 1]]
const RAW = [[100, 1000], [200, 2000], [300, 5000], [500, 9000]]

describe('a Classification normalising its features', () => {
    for (const [name, classifier, outputs] of [
        ['SVM', SVM, ['class', 'probability_1']],
        ['MINIMUM_DISTANCE', MINIMUM_DISTANCE, ['class']]
    ]) {
        it(`${name} classifies a scene of its own imagery on the features it trained on`, async () => {
            const recipe = await classificationOf(model({classifier}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            const classified = recipe.classifyImage(image(IMAGERY), outputs, trainingData)

            assert.deepEqual(state.trained.at(-1).features, SCALED)
            assert.deepEqual(state.classified.map(({features}) => features), outputs.map(() => SCALED))
            assert.deepEqual(classified.bands.class, [1, 1, 2, 2])
            if (outputs.includes('probability_1')) {
                assert.deepEqual(classified.bands.probability_1, [100, 100, 0, 0])
            }
        })

        it(`${name} scales scene values beyond the training range past 0 and 1`, async () => {
            const recipe = await classificationOf(model({classifier}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image({red: [0, 100, 500, 900], nir: [0, 1000, 9000, 17000]}), ['class'], trainingData)

            assert.deepEqual(state.classified[0].features, [[-0.25, -0.125], [0, 0], [1, 1], [2, 2]])
        })

        it(`${name} scales only the features it trained on, leaving other scene bands raw`, async () => {
            const recipe = await classificationOf(model({classifier}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image({...IMAGERY, cloud: [7, 7, 7, 7]}), ['class'], trainingData)

            assert.deepEqual(state.trained[0].bandOrder, ['red', 'nir'])
            assert.deepEqual(state.classified[0].features, SCALED)
            assert.deepEqual(state.classified[0].image.bands.cloud, [7, 7, 7, 7])
        })

        it(`${name} scales indexes, band combinations and auxiliary covariates each by its own range`, async () => {
            const bandSetSpecs = [
                {type: 'IMAGE_BANDS', included: ['red', 'nir', 'ndvi']},
                {type: 'PAIR_WISE_EXPRESSION', included: ['red', 'nir'], operation: 'DIFFERENCE'}
            ]
            const recipe = await classificationOf(model({classifier, images: [input('training', bandSetSpecs)], auxiliaryImagery: ['LATITUDE']}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image(IMAGERY), ['class'], trainingData)

            const [{bandOrder, features: trained}] = state.trained
            assert.deepEqual(bandOrder, ['red', 'nir', 'ndvi', 'red_nir_difference', 'latitude'])
            assert.deepEqual(rangesOf(trained), bandOrder.map(() => [0, 1]))
            assert.deepEqual(state.classified[0].features, trained)
        })

        it(`${name} scales a constant band to 1, and a band constant at 0 to 0`, async () => {
            const constants = {red: IMAGERY.red, cover: [50, 50, 50, 50], water: [0, 0, 0, 0]}
            const images = [input('training', [{type: 'IMAGE_BANDS', included: ['red', 'cover', 'water']}])]
            const recipe = await classificationOf(model({classifier, images}), {training: constants})
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image(constants), ['class'], trainingData)

            const expected = [[0, 1, 0], [0.25, 1, 0], [0.5, 1, 0], [1, 1, 0]]
            assert.deepEqual(state.trained[0].features, expected)
            assert.deepEqual(state.classified[0].features, expected)
        })

        it(`${name} carries its own statistics, not those of a recipe whose training data it reuses`, async () => {
            state.recipes.provider = await classificationOf(
                model({classifier: SVM, images: [input('provider')]}),
                {provider: {red: [0, 1000, 2000, 4000], nir: [0, 100, 200, 400]}}
            )
            const recipe = await classificationOf(model({classifier, dataSets: [{type: 'RECIPE', recipe: 'provider'}, collected()]}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image(IMAGERY), ['class'], trainingData)

            assert.deepEqual({...trainingData.get('feature_statistics')}, STATISTICS)
            assert.deepEqual(state.classified[0].features, SCALED)
        })

        it(`${name} constructs one reduction to classify its own imagery`, async () => {
            const recipe = await classificationOf(model({classifier}), {training: IMAGERY}, {selection: ['class']})

            await firstValueFrom(recipe.getImage$())

            assert.equal(state.reductions, 1)
            assert.deepEqual(state.classified[0].features, SCALED)
        })

        for (const scenes of [1, 3]) {
            it(`${name} constructs no reduction to classify ${scenes} scene(s) with its training data`, async () => {
                const recipe = await classificationOf(model({classifier}))
                const trainingData = await firstValueFrom(recipe.getTrainingData$())

                for (let i = 0; i < scenes; i++) {
                    recipe.classifyImage(image(IMAGERY), ['class'], trainingData)
                }

                assert.equal(state.reductions, 1)
                assert.equal(state.classified.length, scenes)
            })
        }

        it(`${name} scales the imagery of several inputs once`, async () => {
            const images = [
                input('first', [{type: 'IMAGE_BANDS', included: ['red']}]),
                input('second', [{type: 'IMAGE_BANDS', included: ['nir']}])
            ]
            const imagery = {first: {red: IMAGERY.red}, second: {nir: IMAGERY.nir}}
            const recipe = await classificationOf(model({classifier, images}), imagery, {selection: ['class']})

            await firstValueFrom(recipe.getImage$())

            assert.equal(state.reductions, 1)
            assert.deepEqual(state.trained[0].features, SCALED)
            assert.deepEqual(state.classified[0].features, SCALED)
        })
    }
})

describe('a Classification not normalising its features', () => {
    for (const [name, classifier] of [
        ['SVM told not to normalise', {...SVM, normalize: 'NO'}],
        ['RANDOM_FOREST', RANDOM_FOREST]
    ]) {
        it(`${name} trains on and classifies a scene on raw features, carrying no statistics`, async () => {
            const recipe = await classificationOf(model({classifier}))
            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            recipe.classifyImage(image(IMAGERY), ['class'], trainingData)

            assert.deepEqual(state.trained[0].features, RAW)
            assert.deepEqual(state.classified[0].features, RAW)
            assert.equal(trainingData.get('feature_statistics'), undefined)
            assert.equal(state.reductions, 0)
        })

        it(`${name} classifies its own imagery on raw features, constructing no reduction`, async () => {
            const recipe = await classificationOf(model({classifier}), {training: IMAGERY}, {selection: ['class']})

            await firstValueFrom(recipe.getImage$())

            assert.deepEqual(state.classified[0].features, RAW)
            assert.equal(state.reductions, 0)
        })

        it(`${name} carries no statistics of a normalising recipe whose training data it reuses`, async () => {
            state.recipes.provider = await classificationOf(model({classifier: SVM, images: [input('provider')]}), {provider: IMAGERY})
            const recipe = await classificationOf(model({classifier, dataSets: [{type: 'RECIPE', recipe: 'provider'}, collected()]}))

            const trainingData = await firstValueFrom(recipe.getTrainingData$())

            assert.equal(trainingData.get('feature_statistics'), undefined)
        })
    }
})

// The Classification over `imagery`, the pixel values of each of its inputs by id.
const classificationOf = async (model, imagery = {training: IMAGERY}, options) => {
    Object.entries(imagery).forEach(([id, bands]) => state.imagery[id] = image(bands))
    const {default: classification} = await import('#sepal/ee/classification/classification')
    return classification({model}, options)
}

const model = ({classifier, images = [input('training')], auxiliaryImagery = [], dataSets = [collected()]}) => ({
    inputImagery: {images},
    auxiliaryImagery,
    legend: {entries: [{value: 1}, {value: 2}]},
    trainingData: {dataSets},
    classifier
})

const input = (id, bandSetSpecs = [{type: 'IMAGE_BANDS', included: ['red', 'nir']}]) => ({
    imageId: id, type: 'ASSET', id, bandSetSpecs: bandSetSpecs.map((spec, i) => ({id: `s-${i}`, ...spec}))
})

// A point at each pixel.
const collected = () => ({
    type: 'COLLECTED',
    referenceData: [1, 1, 2, 2].map((value, x) => ({x, y: 0, class: value}))
})

const rangesOf = features =>
    features[0].map((_value, band) => {
        const values = features.map(pixel => pixel[band])
        return [Math.min(...values), Math.max(...values)]
    })

const PIXELS = [0, 1, 2, 3]

const valueOf = value => value instanceof Num ? value.value : value

class Num {
    constructor(value) {
        this.value = value
    }

    eq(other) {
        return new Num(this.value === valueOf(other) ? 1 : 0)
    }

    subtract(other) {
        return new Num(this.value - valueOf(other))
    }

    int() {
        return new Num(Math.trunc(this.value))
    }

    format() {
        return String(this.value)
    }
}

class Str {
    constructor(value) {
        this.value = value
    }

    cat(other) {
        return new Str(this.value + String(other))
    }

    toString() {
        return this.value
    }
}

class List {
    constructor(items) {
        this.items = items
    }

    [Symbol.iterator]() {
        return this.items[Symbol.iterator]()
    }

    size() {
        return new Num(this.items.length)
    }

    getNumber(index) {
        return new Num(this.items[valueOf(index)])
    }

    zip(other) {
        return new List(this.items.map((item, i) => new List([item, other.items[i]])))
    }

    iterate(algorithm, first) {
        return this.items.reduce((acc, item) => algorithm(item, acc), first)
    }
}

class Dictionary {
    constructor(values) {
        Object.assign(this, values)
    }

    get(key) {
        return this[String(key)]
    }

    getNumber(key) {
        if (!Object.hasOwn(this, String(key))) {
            throw new Error(`Dictionary.getNumber: Dictionary does not contain key: '${key}'.`)
        }
        return new Num(this[String(key)])
    }
}

// Each band an array of pixel values; a classified probability pixel is an array, one value per class.
class Image {
    constructor(bands, {footprint = 'aoi', properties = {}} = {}) {
        this.bands = bands
        this.footprint = footprint
        this.properties = properties
    }

    bandNames() {
        return new List(Object.keys(this.bands))
    }

    // Earth Engine refuses a selector matching no band.
    select(selectors) {
        return this.#withBands(Object.fromEntries([selectors].flat().map(String).map(name => [name, this.#band(name)])))
    }

    selectExisting(names) {
        return this.#withBands(Object.fromEntries(Object.entries(this.bands).filter(([name]) => names.includes(name))))
    }

    rename(names) {
        const renamed = [names].flat().map(String)
        return this.#withBands(Object.fromEntries(Object.values(this.bands).map((values, i) => [renamed[i], values])))
    }

    // As Earth Engine documents it: overwritten in place, or renamed with a numerical suffix.
    addBands(image, _names, overwrite) {
        return this.#withBands(overwrite
            ? {...this.bands, ...image.bands}
            : concatenated([this, image]))
    }

    combinePairwise(expression, suffix) {
        assert.equal(expression, 'b1 - b2', 'only differences are stood in for')
        const names = Object.keys(this.bands)
        return this.#withBands(Object.fromEntries(names.flatMap((b1, i) => names.slice(i + 1).map(b2 =>
            [`${b1}_${b2}${suffix}`, PIXELS.map(p => this.bands[b1][p] - this.bands[b2][p])]
        ))))
    }

    subtract(value) {
        return this.#map(x => x - valueOf(value))
    }

    divide(value) {
        return this.#map(x => valueOf(value) === 0 ? 0 : x / valueOf(value))
    }

    multiply(value) {
        return this.#map(x => Array.isArray(x) ? x.map(element => element * value) : x * value)
    }

    arrayGet(index) {
        return this.#map(x => x[valueOf(index)])
    }

    mask() {
        return this.#map(() => 1)
    }

    reduce(reducer) {
        assert.equal(reducer, 'max')
        return new Image({max: PIXELS.map(p => Math.max(...Object.values(this.bands).map(values => values[p])))})
    }

    updateMask() {
        return this
    }

    uint8() {
        return this
    }

    float() {
        return this
    }

    reduceRegion({reducer}) {
        assert.equal(reducer, 'minMax')
        state.reductions += 1
        return new Dictionary(Object.fromEntries(Object.entries(this.bands).flatMap(([name, values]) => [
            [`${name}_min`, Math.min(...values)],
            [`${name}_max`, Math.max(...values)]
        ])))
    }

    geometry() {
        return this.footprint
    }

    clip(geometry) {
        return new Image(this.bands, {footprint: geometry, properties: this.properties})
    }

    propertyNames() {
        return new List(Object.keys(this.properties))
    }

    copyProperties(source, names) {
        const copied = Object.fromEntries([...names].map(name => [name, source.properties[name]]))
        return new Image(this.bands, {footprint: this.footprint, properties: {...this.properties, ...copied}})
    }

    sampleRegions({collection, properties}) {
        return new FeatureCollection(collection.items.map(({geometry, properties: plot}) => ({
            geometry,
            properties: {
                ...Object.fromEntries(properties.map(name => [name, plot[name]])),
                ...Object.fromEntries(Object.entries(this.bands).map(([name, values]) => [name, values[geometry.pixel]]))
            }
        })))
    }

    classify({bandOrder, samples, mode}) {
        const features = PIXELS.map(p => bandOrder.map(name => this.#band(name)[p]))
        state.classified.push({image: this, features})
        const classes = classesOf(samples)
        const nearest = features.map(pixel => nearestSample(samples, pixel).class)
        return new Image({
            classification: mode === 'MULTIPROBABILITY'
                ? nearest.map(value => classes.map(c => c === value ? 1 : 0))
                : nearest
        }, {footprint: this.footprint})
    }

    #band(name) {
        if (!Object.hasOwn(this.bands, name)) {
            throw new Error(`Image.select: Pattern '${name}' did not match any bands.`)
        }
        return this.bands[name]
    }

    #map(operation) {
        return this.#withBands(Object.fromEntries(Object.entries(this.bands).map(([name, values]) => [name, values.map(operation)])))
    }

    #withBands(bands) {
        return new Image(bands, {footprint: this.footprint, properties: this.properties})
    }
}

const image = source => {
    if (source instanceof Image) {
        return source
    }
    if (Array.isArray(source)) {
        return new Image(concatenated(source))
    }
    if (typeof source === 'number') {
        return new Image({constant: PIXELS.map(() => source)})
    }
    return new Image(source)
}
image.pixelLonLat = () => new Image({longitude: [5, 6, 7, 8], latitude: [10, 20, 30, 50]})

const concatenated = images => images
    .flatMap(({bands}) => Object.entries(bands))
    .reduce((acc, [name, values]) => ({...acc, [uniqueName(name, Object.keys(acc))]: values}), {})

const uniqueName = (band, taken, n = 0) => {
    const name = n ? `${band}_${n}` : band
    return taken.includes(name) ? uniqueName(band, taken, n + 1) : name
}

// Flattening keeps the features, not the properties of the collections flattened.
class FeatureCollection {
    constructor(items, properties = {}) {
        this.items = items
        this.properties = properties
    }

    flatten() {
        return new FeatureCollection(this.items.flatMap(item => item instanceof FeatureCollection ? item.items : [item]))
    }

    filterBounds() {
        return this
    }

    set(name, value) {
        return new FeatureCollection(this.items, {...this.properties, [name]: value})
    }

    get(name) {
        return this.properties[name]
    }
}

const classifier = () => ({
    train: (trainingData, classProperty) => {
        const bandOrder = [...trainingData.get('band_order')].map(String)
        const samples = trainingData.items.map(({properties}) => ({
            features: bandOrder.map(name => properties[name]),
            class: properties[classProperty]
        }))
        state.trained.push({bandOrder, features: samples.map(({features}) => features)})
        return trained({bandOrder, samples})
    }
})

const trained = classifier => ({
    ...classifier,
    setOutputMode: mode => trained({...classifier, mode}),
    explain: () => new Dictionary({classes: new List(classesOf(classifier.samples))})
})

const classesOf = samples => [...new Set(samples.map(sample => sample.class))].sort()

const nearestSample = (samples, pixel) =>
    samples.reduce((nearest, sample) => distance(sample, pixel) < distance(nearest, pixel) ? sample : nearest)

const distance = ({features}, pixel) => features.reduce((sum, value, i) => sum + (value - pixel[i]) ** 2, 0)

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            Image: image,
            FeatureCollection: items => new FeatureCollection(items),
            Feature: (geometry, properties) => ({geometry, properties}),
            Geometry: {Point: ([x]) => ({pixel: x})},
            Dictionary: values => values instanceof Dictionary ? values : new Dictionary(values),
            List: Object.assign(items => items instanceof List ? items : new List(items), {
                sequence: (start, end) => new List(Array.from({length: valueOf(end) - start + 1}, (_value, i) => start + i))
            }),
            Number: value => value instanceof Num ? value : new Num(value),
            String: value => new Str(String(value)),
            Reducer: {minMax: () => 'minMax', max: () => 'max'},
            Algorithms: {If: (condition, whenTrue, whenFalse) => valueOf(condition) ? whenTrue : whenFalse},
            Classifier: {libsvm: classifier, minimumDistance: classifier, smileRandomForest: classifier}
        }
    }
})
mock.module('#sepal/ee/optical/indexes', {
    exports: {
        calculateIndex: (input, name) => {
            const {red, nir} = input.bands
            return name === 'ndvi' && red && nir
                ? new Image({ndvi: PIXELS.map(p => (nir[p] / 10000 - red[p] / 10000) / (nir[p] / 10000 + red[p] / 10000))})
                : new Image({})
        }
    }
})
mock.module('#sepal/ee/imageFactory', {exports: {default: ({id}) => ({getImage$: () => of(state.imagery[id])})}})
mock.module('#sepal/ee/recipeRef', {exports: {default: ({id}) => ({getRecipe$: () => of(state.recipes[id])})}})

beforeEach(() => {
    Object.assign(state, {imagery: {}, recipes: {}, trained: [], classified: [], reductions: 0})
})
