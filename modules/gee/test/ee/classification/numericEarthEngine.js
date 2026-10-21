import assert from 'node:assert/strict'
import {mock} from 'node:test'

import {of} from 'rxjs'

// Classification execution over a numeric Earth Engine stand-in: an image is four pixels per band, division by zero
// gives zero as Earth Engine documents, and a trained classifier records the training rows it is given and the features
// it is applied to, read by its training data's band_order, classifying each pixel as its nearest training sample.
// A feature lacking a property gets null for it, as Earth Engine does. Reductions are counted as the expressions
// constructed, not as Earth Engine evaluations. Inputs read their imagery from `state.imagery` by id, and a reused
// recipe is `state.recipes` by id.

export const state = {}

export const resetState = () =>
    Object.assign(state, {imagery: {}, recipes: {}, trained: [], classified: [], reductions: 0})

export const SVM = {type: 'SVM', svmType: 'C_SVC', kernelType: 'RBF'}
export const MINIMUM_DISTANCE = {type: 'MINIMUM_DISTANCE', metric: 'euclidean'}
export const RANDOM_FOREST = {type: 'RANDOM_FOREST'}

// Classes 1, 1, 2 and 2 at the four pixels; both bands span their range, to [0, 0.25, 0.5, 1] and [0, 0.125, 0.5, 1].
export const IMAGERY = {red: [100, 200, 300, 500], nir: [1000, 2000, 5000, 9000]}
export const STATISTICS = {red_min: 100, red_max: 500, nir_min: 1000, nir_max: 9000}

// The Classification over `imagery`, the pixel values of each of its inputs by id.
export const classificationOf = async (model, imagery = {training: IMAGERY}, options) => {
    Object.entries(imagery).forEach(([id, bands]) => state.imagery[id] = image(bands))
    const {default: classification} = await import('#sepal/ee/classification/classification')
    return classification({model}, options)
}

export const model = ({classifier, images = [input('training')], auxiliaryImagery = [], dataSets = [collected()]}) => ({
    inputImagery: {images},
    auxiliaryImagery,
    legend: {entries: [{value: 1}, {value: 2}]},
    trainingData: {dataSets},
    classifier
})

export const input = (id, bandSetSpecs = [{type: 'IMAGE_BANDS', included: ['red', 'nir']}]) => ({
    imageId: id, type: 'ASSET', id, bandSetSpecs: bandSetSpecs.map((spec, i) => ({id: `s-${i}`, ...spec}))
})

// A point at each pixel.
export const collected = () => ({
    type: 'COLLECTED',
    referenceData: [1, 1, 2, 2].map((value, x) => ({x, y: 0, class: value}))
})

export const image = source => {
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

    divide(other) {
        return new Num(valueOf(other) === 0 ? 0 : this.value / valueOf(other))
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

    map(algorithm, dropNulls) {
        const mapped = this.items.map(item => algorithm(item))
        return new List(dropNulls ? mapped.filter(item => item !== null) : mapped)
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

    static fromLists(keys, values) {
        return new Dictionary(Object.fromEntries([...keys].map((key, i) => [String(key), valueOf(values.items[i])])))
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

class Feature {
    constructor(geometry, properties) {
        this.geometry = geometry
        this.properties = properties
    }

    get(name) {
        return Object.hasOwn(this.properties, String(name)) ? this.properties[String(name)] : null
    }

    getNumber(name) {
        const value = this.get(name)
        if (value === null) {
            throw new Error(`Feature.getNumber: Property '${name}' is not a number.`)
        }
        return new Num(value)
    }

    set(properties) {
        return new Feature(this.geometry, {...this.properties, ...properties})
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
        return new FeatureCollection(collection.items.map(({geometry, properties: plot}) => new Feature(geometry, {
            ...Object.fromEntries(properties.map(name => [name, plot[name]])),
            ...Object.fromEntries(Object.entries(this.bands).map(([name, values]) => [name, values[geometry.pixel]]))
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

    map(algorithm) {
        return new FeatureCollection(this.items.map(item => algorithm(item)), this.properties)
    }

    set(name, value) {
        return new FeatureCollection(this.items, {...this.properties, [name]: value})
    }

    get(name) {
        return this.properties[name]
    }
}

// Each training row is the properties of a feature trained on; its features are those band_order names.
const classifier = () => ({
    train: (trainingData, classProperty) => {
        const bandOrder = [...trainingData.get('band_order')].map(String)
        const rows = trainingData.items.map(({properties}) => properties)
        const samples = rows.map(row => ({
            features: bandOrder.map(name => row[name]),
            class: row[classProperty]
        }))
        state.trained.push({
            bandOrder,
            rows,
            features: samples.map(({features}) => features),
            statistics: trainingData.get('feature_statistics')
        })
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

const isEqual = (a, b) => (valueOf(a) ?? null) === (valueOf(b) ?? null)

mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            Image: image,
            FeatureCollection: items => new FeatureCollection(items),
            Feature: (geometry, properties) => geometry instanceof Feature ? geometry : new Feature(geometry, properties),
            Geometry: {Point: ([x]) => ({pixel: x})},
            Dictionary: Object.assign(values => values instanceof Dictionary ? values : new Dictionary(values), {
                fromLists: Dictionary.fromLists
            }),
            List: Object.assign(items => items instanceof List ? items : new List(items), {
                sequence: (start, end) => new List(Array.from({length: valueOf(end) - start + 1}, (_value, i) => start + i))
            }),
            Number: value => value instanceof Num ? value : new Num(value),
            String: value => new Str(String(value)),
            Reducer: {minMax: () => 'minMax', max: () => 'max'},
            Algorithms: {
                If: (condition, whenTrue, whenFalse) => valueOf(condition) ? whenTrue : whenFalse,
                IsEqual: isEqual
            },
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
