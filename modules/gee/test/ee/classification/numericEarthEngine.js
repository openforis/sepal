import assert from 'node:assert/strict'
import {mock} from 'node:test'

import {of} from 'rxjs'

// Classification execution over a numeric Earth Engine stand-in: an image is four pixels per band, a masked pixel null,
// division by zero gives zero as Earth Engine documents, and a trained classifier records the training rows it is given
// and the features it is applied to, read by its training data's band_order, classifying each pixel as its nearest
// training sample. A feature lacking a property gets null for it, as Earth Engine does; a pixel any band of which is
// masked is no sample, as sampleRegions documents. Each sampling is recorded, with the band its projection is taken of.
// Reductions are counted as the expressions constructed, not as Earth Engine evaluations. What Earth Engine evaluates
// lazily - a branch of If not taken, an image named by a string - fails only where it is used: an image that cannot be
// built is a failure read as such. Indexes are the real ones (optical/indexes.js). Inputs read their imagery from
// `state.imagery` by id, and a reused recipe is `state.recipes` by id.

export const state = {}

export const resetState = () =>
    Object.assign(state, {imagery: {}, recipes: {}, trained: [], classified: [], reductions: 0, samplings: []})

export const SVM = {type: 'SVM', svmType: 'C_SVC', kernelType: 'RBF'}
export const MINIMUM_DISTANCE = {type: 'MINIMUM_DISTANCE', metric: 'euclidean'}
export const RANDOM_FOREST = {type: 'RANDOM_FOREST'}

// Classes 1, 1, 2 and 2 at the four pixels; both bands span their range, to [0, 0.25, 0.5, 1] and [0, 0.125, 0.5, 1].
export const IMAGERY = {red: [100, 200, 300, 500], nir: [1000, 2000, 5000, 9000]}
export const STATISTICS = {red_min: 100, red_max: 500, nir_min: 1000, nir_max: 9000}

// The Classification over `imagery`, the pixel values of each of its inputs by id, its record holding `record` beside.
export const classificationOf = async (model, imagery = {training: IMAGERY}, options, record = {}) => {
    Object.entries(imagery).forEach(([id, bands]) => state.imagery[id] = image(bands))
    const {default: classification} = await import('#sepal/ee/classification/classification')
    return classification({...record, model}, options)
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
    if (source instanceof Image || source?.[FAILED]) {
        return source
    }
    // An image named by a constant fails once loaded; by a computed name, Earth Engine refuses the whole graph.
    if (source instanceof Str) {
        throw new Error('Actual value for parameter \'id\' must be a constant.')
    }
    if (typeof source === 'string') {
        return failed(source)
    }
    if (Array.isArray(source)) {
        return source.find(element => element?.[FAILED]) || new Image(concatenated(source))
    }
    if (typeof source === 'number') {
        return new Image({constant: PIXELS.map(() => source)})
    }
    return new Image(source)
}
image.pixelLonLat = () => new Image({longitude: [5, 6, 7, 8], latitude: [10, 20, 30, 50]})

// An expression of the bands given, evaluated at each pixel; a masked operand masks the pixel.
image.expr = (expression, bandMap) => {
    const names = Object.keys(bandMap)
    const failure = names.map(name => bandMap[name]).find(operand => operand?.[FAILED])
    if (failure) {
        return failure
    }
    const evaluate = new Function(...names, `return ${expression}`)
    return new Image({expression: PIXELS.map(p => {
        const values = names.map(name => bandMap[name].bands[name][p])
        return values.some(value => value === null) ? null : evaluate(...values)
    })})
}

const FAILED = Symbol('failed')

// What Earth Engine would refuse once evaluated: reading or sampling it fails, building on it is another failure.
const failed = message => {
    const failure = new Proxy({}, {
        get: (_target, property) => {
            if (property === FAILED) {
                return true
            }
            if (['bands', 'sampleRegions', 'reduceRegion'].includes(property)) {
                throw new Error(message)
            }
            return typeof property === 'symbol' || property === 'then' ? undefined : () => failure
        }
    })
    return failure
}

const PIXELS = [0, 1, 2, 3]

const valueOf = value => value instanceof Num ? valueOf(value.value) : value instanceof Bool ? value.value : value

// Earth Engine's Boolean, which its Number operations refuse as an operand.
class Bool {
    constructor(value) {
        this.value = value
    }
}

const numeric = (operation, value) => {
    if (value instanceof Bool || value instanceof Num && value.value instanceof Bool) {
        throw new Error(`Number.${operation}: Invalid type. Expected type: Number. Actual type: Boolean.`)
    }
    return valueOf(value)
}

class Num {
    constructor(value) {
        this.value = value
    }

    eq(other) {
        return new Num(this.value === valueOf(other) ? 1 : 0)
    }

    lt(other) {
        return new Num(this.value < valueOf(other) ? 1 : 0)
    }

    gt(other) {
        return new Num(this.value > valueOf(other) ? 1 : 0)
    }

    gte(other) {
        return new Num(this.value >= valueOf(other) ? 1 : 0)
    }

    and(other) {
        return new Num(numeric('and', this) && numeric('and', other) ? 1 : 0)
    }

    or(other) {
        return new Num(numeric('or', this) || numeric('or', other) ? 1 : 0)
    }

    not() {
        return new Num(numeric('not', this) ? 0 : 1)
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

    toLowerCase() {
        return new Str(this.value.toLowerCase())
    }

    equals(other) {
        return new Bool(this.value === String(other))
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

    get(index) {
        return this.items[valueOf(index)]
    }

    contains(item) {
        return new Bool(this.items.map(String).includes(String(item)))
    }

    indexOf(item) {
        return new Num(this.items.map(String).indexOf(String(item)))
    }

    reduce(reducer) {
        assert.equal(reducer, 'sum')
        return new Num(this.items.reduce((sum, item) => sum + valueOf(item), 0))
    }

    removeAll(other) {
        const removed = [...listOf(other)].map(String)
        return new List(this.items.filter(item => !removed.includes(String(item))))
    }

    cat(other) {
        return new List([...this.items, ...listOf(other)])
    }

    distinct() {
        return new List([...new Set(this.items.map(String))])
    }

    join(separator) {
        return new Str(this.items.map(String).join(separator))
    }

    flatten() {
        return new List(this.items.flatMap(item => item instanceof List ? item.items : [item]))
    }
}

const listOf = items => items instanceof List ? items.items : items

class Dictionary {
    constructor(values) {
        Object.assign(this, values)
    }

    static fromLists(keys, values) {
        return new Dictionary(Object.fromEntries([...keys].map((key, i) => [String(key), valueOf(values.items[i])])))
    }

    // Lazily, as Earth Engine: a missing key fails only where what it gives is used.
    get(key, ...defaultValue) {
        if (Object.hasOwn(this, String(key))) {
            return this[String(key)]
        }
        return defaultValue.length ? defaultValue[0] : failed(`Dictionary.get: Dictionary does not contain key: '${key}'.`)
    }

    contains(key) {
        return new Bool(Object.hasOwn(this, String(key)))
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

    // Earth Engine refuses a selector matching no band, once evaluated. A number selects by position.
    select(selectors, renamed) {
        const names = (typeof selectors === 'number' ? [Object.keys(this.bands)[selectors]] : [...listOf([selectors].flat())].flatMap(listOf))
            .map(String)
        const missing = names.find(name => !Object.hasOwn(this.bands, name))
        if (missing !== undefined) {
            return failed(`Image.select: Pattern '${missing}' did not match any bands.`)
        }
        const outputs = renamed ? [...listOf(renamed)].map(String) : names
        return this.#withBands(Object.fromEntries(names.map((name, i) => [outputs[i], this.bands[name]])))
    }

    selectOrDefault(names, defaultImage) {
        const [defaults] = Object.values(defaultImage.bands)
        return this.#withBands(Object.fromEntries(names.map(name => [name, this.bands[name] || defaults])))
    }

    bandCount() {
        return new Num(Object.keys(this.bands).length)
    }

    when(condition, value) {
        return valueOf(condition) ? value : this
    }

    set(name, value) {
        return new Image(this.bands, {footprint: this.footprint, properties: {...this.properties, [name]: valueOf(value)}})
    }

    projection() {
        return {band: Object.keys(this.bands)[0], image: this}
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
        const combine = COMBINATIONS[expression]
        assert.ok(combine, `${expression} is not stood in for`)
        const names = Object.keys(this.bands)
        return this.#withBands(Object.fromEntries(names.flatMap((b1, i) => names.slice(i + 1).map(b2 =>
            [`${b1}_${b2}${suffix}`, PIXELS.map(p => this.bands[b1][p] === null || this.bands[b2][p] === null
                ? null
                : combine(this.bands[b1][p], this.bands[b2][p]))]
        ))))
    }

    subtract(value) {
        return this.#arithmetic(x => x - valueOf(value))
    }

    divide(value) {
        return this.#arithmetic(x => valueOf(value) === 0 ? 0 : x / valueOf(value))
    }

    multiply(value) {
        return this.#arithmetic(x => x * value)
    }

    arrayGet(index) {
        return this.#map(x => x[valueOf(index)])
    }

    mask() {
        return this.#map(value => value === null ? 0 : 1)
    }

    reduce(reducer) {
        assert.equal(reducer, 'max')
        return new Image({max: PIXELS.map(p => Math.max(...Object.values(this.bands).map(values => values[p] ?? 0)))})
    }

    // Masked where the mask's one band is zero or masked. An image of no bands Earth Engine refuses to mask, once
    // evaluated.
    updateMask(mask) {
        if (!Object.keys(this.bands).length) {
            return failed('Image.updateMask: If one image has no bands, the other must also have no bands. Got 0 and 1.')
        }
        const [values] = Object.values(mask.bands)
        return this.#map((value, p) => values[p] ? value : null)
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

    sampleRegions({collection, properties, scale, projection}) {
        state.samplings.push({bands: Object.keys(this.bands), scale, projection: projection?.band ?? null, points: collection.items.length})
        return new FeatureCollection(collection.items
            .filter(({geometry}) => Object.values(this.bands).every(values => values[geometry.pixel] !== null))
            .map(({geometry, properties: plot}) => new Feature(geometry, {
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

    // An arithmetic operation of each value, a masked one staying masked. Earth Engine takes a number for an image of
    // one band, which an image of none refuses once evaluated.
    #arithmetic(operation) {
        if (!Object.keys(this.bands).length) {
            return failed('Image.divide: If one image has no bands, the other must also have no bands. Got 0 and 1.')
        }
        return this.#map(value => value === null ? null : Array.isArray(value) ? value.map(operation) : operation(value))
    }

    #withBands(bands) {
        return new Image(bands, {footprint: this.footprint, properties: this.properties})
    }
}

const COMBINATIONS = {
    'b1 - b2': (b1, b2) => b1 - b2,
    'b1 / b2': (b1, b2) => b2 === 0 ? 0 : b1 / b2,
    '(b1 - b2) / (b1 + b2)': (b1, b2) => b1 + b2 === 0 ? 0 : (b1 - b2) / (b1 + b2)
}

// Images in a collection: filtered, counted, the first taken, or the least of their one band at each pixel.
class ImageCollection {
    constructor(images) {
        this.images = images
    }

    filter(predicate) {
        return new ImageCollection(this.images.filter(predicate))
    }

    size() {
        return new Num(this.images.length)
    }

    first() {
        return this.images[0] ?? failed('ImageCollection.first: Empty collection.')
    }

    aggregate_array(property) {
        return new List(this.images.map(image => image.properties[property]))
    }

    min() {
        const values = this.images.map(image => Object.values(image.bands)[0])
        return new Image({min: PIXELS.map(p => values.some(band => band[p] === null) ? null : Math.min(...values.map(band => band[p])))})
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
            ImageCollection: {fromImages: images => new ImageCollection([...listOf(images)])},
            Filter: {
                listContains: (property, value) => image => {
                    assert.equal(property, 'system:band_names')
                    return Object.keys(image.bands).includes(String(value))
                },
                eq: (property, value) => image => image.properties[property] === valueOf(value)
            },
            Projection: projection => projection,
            FeatureCollection: items => new FeatureCollection(items),
            Feature: (geometry, properties) => geometry instanceof Feature ? geometry : new Feature(geometry, properties),
            Geometry: {Point: ([x]) => ({pixel: x})},
            Dictionary: Object.assign(values => values instanceof Dictionary ? values : new Dictionary(values ?? {}), {
                fromLists: Dictionary.fromLists
            }),
            List: Object.assign(items => items instanceof List ? items : new List(items), {
                sequence: (start, end) => new List(Array.from({length: valueOf(end) - start + 1}, (_value, i) => start + i))
            }),
            Number: value => {
                if (typeof value === 'boolean') {
                    throw new Error(`Invalid argument specified for ee.Number(): ${value}`)
                }
                return value instanceof Num ? value : new Num(value)
            },
            String: value => new Str(String(value)),
            Reducer: {minMax: () => 'minMax', max: () => 'max', sum: () => 'sum'},
            Algorithms: {
                If: (condition, whenTrue, whenFalse) => valueOf(condition) ? whenTrue : whenFalse,
                IsEqual: isEqual
            },
            Classifier: {libsvm: classifier, minimumDistance: classifier, smileRandomForest: classifier}
        }
    }
})
mock.module('#sepal/ee/imageFactory', {exports: {default: ({id}) => ({getImage$: () => of(state.imagery[id])})}})
mock.module('#sepal/ee/recipeRef', {exports: {default: ({id}) => ({getRecipe$: () => of(state.recipes[id])})}})
