import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'
import {format} from 'node:util'

import {firstValueFrom, of} from 'rxjs'

import {sampledFeatures} from '#sepal/recipe/bandSets'
import {getAvailableIndexes} from '#sepal/recipe/optical/opticalBands'

// The features a Classification's or Regression's points are sampled with are those the shared declaration names
// (#sepal/recipe/bandSets sampledFeatures), which judges whether training data one recipe reuses from another carries
// what it trains on. Execution and the auxiliary covariates (#sepal/ee/auxiliaryImagery) are the real ones; Earth
// Engine is a stand-in that tracks band names only. It stands in combinePairwise and selectExisting at the image, as
// lib/js/ee/src/extensions/image.js defines them, and an index is calculated where the bands it requires are present.

const state = {}

describe('the features training data is sampled with', () => {
    for (const [recipeType, execution, trainingData] of [
        ['Classification', '#sepal/ee/classification/classification', {type: 'COLLECTED', referenceData: [{x: 0, y: 0, class: 1}, {x: 1, y: 1, class: 2}]}],
        ['Regression', '#sepal/ee/regression/regression', {type: 'COLLECTED', referenceData: [{x: 0, y: 0, value: 12.5}, {x: 1, y: 1, value: 3}]}]
    ]) {
        for (const [_case, inputBands, bandSetSpecs, auxiliaryImagery] of [
            ['bands and indexes it includes, skipping what its input lacks',
                ['red', 'nir', 'swir1'], [{type: 'IMAGE_BANDS', included: ['red', 'ndvi', 'blue', 'ndfi']}], []],
            ['band combinations named in its input\'s band order',
                ['nir', 'red', 'swir1'], [{type: 'PAIR_WISE_EXPRESSION', included: ['red', 'nir'], operation: 'NORMALIZED_DIFFERENCE'}], []],
            ['indexes derivable from its input',
                ['red', 'nir', 'swir1'], [{type: 'INDEXES', included: ['ndvi', 'ndmi', 'ndfi']}], []],
            ['latitude', ['red'], [{type: 'IMAGE_BANDS', included: ['red']}], ['LATITUDE']],
            ['terrain', ['red'], [{type: 'IMAGE_BANDS', included: ['red']}], ['TERRAIN']],
            ['surface water', ['red'], [{type: 'IMAGE_BANDS', included: ['red']}], ['WATER']],
            ['a name two band sets provide, once',
                ['red', 'nir'], [{type: 'IMAGE_BANDS', included: ['red', 'ndvi']}, {type: 'INDEXES', included: ['ndvi']}], []],
            ['a band combination named as a band another set includes, once',
                ['red', 'nir', 'red_nir_ratio'],
                [{type: 'IMAGE_BANDS', included: ['red_nir_ratio']}, {type: 'PAIR_WISE_EXPRESSION', included: ['red', 'nir'], operation: 'RATIO'}], []]
        ]) {
            it(format('of a %s are those declared, for %s', recipeType, _case), async () => {
                const model = {...modelOf({bandSetSpecs, auxiliaryImagery}), trainingData: {dataSets: [trainingData]}}
                state.inputBands = inputBands

                const {default: recipeOf} = await import(execution)
                const samples = await firstValueFrom(recipeOf({model}).getTrainingData$())

                const declared = sampledFeatures(model, [describedInput(inputBands)]).sort()
                assert.deepEqual([...state.sampledOver].sort(), declared)
                assert.deepEqual([...samples.properties.band_order].sort(), declared)
            })
        }

        // a_b with c, and a with b_c: the second is suffixed as it is added, which the declaration does not model.
        it(format('of a %s are not declared where its band combinations share a name', recipeType), async () => {
            const bandSetSpecs = [{type: 'PAIR_WISE_EXPRESSION', included: ['a_b', 'c', 'a', 'b_c'], operation: 'RATIO'}]
            const model = {...modelOf({bandSetSpecs, auxiliaryImagery: []}), trainingData: {dataSets: [trainingData]}}
            state.inputBands = ['a_b', 'c', 'a', 'b_c']

            const {default: recipeOf} = await import(execution)
            const samples = await firstValueFrom(recipeOf({model}).getTrainingData$())

            assert.ok(samples.properties.band_order.includes('a_b_c_ratio_1'))
            assert.equal(sampledFeatures(model, [describedInput(state.inputBands)]), null)
        })
    }
})

const INPUT = {type: 'ASSET', id: 'users/x/input'}

const modelOf = ({bandSetSpecs, auxiliaryImagery}) => ({
    inputImagery: {images: [{imageId: 'i-1', ...INPUT, bandSetSpecs: bandSetSpecs.map((spec, i) => ({id: `s-${i}`, ...spec}))}]},
    auxiliaryImagery,
    legend: {entries: [{value: 1}, {value: 2}]},
    classifier: {type: 'RANDOM_FOREST', normalize: 'NO'}
})

const describedInput = bands => ({
    description: {executionReference: INPUT, output: {bands: bands.map(name => ({name}))}}
})

// Anything not an image or a table is the same inert stand-in, except what would make RxJS take it for a promise or a
// scheduler.
const NOT_AN_EXPRESSION = ['then', 'schedule']
const expression = new Proxy(function () {}, {
    get: (_target, property) => NOT_AN_EXPRESSION.includes(property) || typeof property === 'symbol' ? undefined : expression,
    apply: () => expression
})

// The bands of the assets the covariates read, and those ee.Algorithms.Terrain adds.
const ASSET_BANDS = {
    'USGS/SRTMGL1_003': ['elevation'],
    'JRC/GSW1_0/GlobalSurfaceWater': ['occurrence', 'change_abs', 'change_norm', 'seasonality', 'recurrence', 'transition', 'max_extent']
}
const TERRAIN_BANDS = ['slope', 'aspect', 'hillshade']

class Image {
    constructor(bands) {
        this.bands = bands
    }

    bandNames() {
        return [...this.bands]
    }

    // Earth Engine refuses a selector matching no band.
    select(selectors, newNames) {
        const names = [selectors].flat()
        names.filter(name => !this.bands.includes(name)).forEach(name => {
            throw new Error(`Image.select: Pattern '${name}' did not match any bands.`)
        })
        return new Image(newNames ? [newNames].flat() : names)
    }

    selectExisting(names) {
        return new Image(this.bands.filter(band => names.includes(band)))
    }

    rename(names) {
        return new Image([names].flat())
    }

    // As Earth Engine documents it: overwritten in place, or renamed with a numerical suffix.
    addBands(image, _names, overwrite) {
        return overwrite
            ? new Image([...this.bands, ...image.bands.filter(band => !this.bands.includes(band))])
            : new Image(concatenated([this.bands, image.bands]))
    }

    // Each combination added without overwriting, so a name already given is suffixed.
    combinePairwise(_algorithm, suffix = '') {
        return new Image(concatenated([this.bands.flatMap((b1, i) => this.bands.slice(i + 1).map(b2 => `${b1}_${b2}${suffix}`))]))
    }

    mask() {
        return this
    }

    reduce() {
        return new Image(['max'])
    }

    sampleRegions() {
        state.sampledOver = this.bandNames()
        return new FeatureCollection({})
    }

    geometry() {
        return expression
    }
}

for (const sameBands of ['float', 'unmask', 'multiply', 'divide', 'sin', 'cos', 'eq', 'updateMask', 'clip']) {
    Image.prototype[sameBands] = function () {
        return this
    }
}

class FeatureCollection {
    constructor(properties) {
        this.properties = properties
    }

    flatten() {
        return this
    }

    filterBounds() {
        return this
    }

    set(name, value) {
        return new FeatureCollection({...this.properties, [name]: value})
    }
}

const image = source => {
    if (source instanceof Image) {
        return source
    }
    if (Array.isArray(source)) {
        return new Image(concatenated(source.map(({bands}) => bands)))
    }
    return new Image(source === undefined ? ['constant'] : ASSET_BANDS[source])
}
image.pixelLonLat = () => new Image(['longitude', 'latitude'])

const concatenated = bandLists => bandLists.flat().reduce((acc, band) => [...acc, uniqueName(band, acc)], [])

const uniqueName = (band, taken, n = 0) => {
    const name = n ? `${band}_${n}` : band
    return taken.includes(name) ? uniqueName(band, taken, n + 1) : name
}

mock.module('#sepal/ee/ee', {
    exports: {
        default: new Proxy({
            Image: image,
            FeatureCollection: () => new FeatureCollection({}),
            Algorithms: {Terrain: elevation => elevation.addBands(new Image(TERRAIN_BANDS))}
        }, {get: (target, property) => property in target ? target[property] : expression})
    }
})
mock.module('#sepal/ee/optical/indexes', {
    exports: {
        calculateIndex: (input, name) => new Image(getAvailableIndexes(input.bands).includes(name) ? [name] : [])
    }
})
mock.module('#sepal/ee/imageFactory', {exports: {default: () => ({getImage$: () => of(new Image(state.inputBands))})}})
mock.module('#sepal/ee/recipeRef', {exports: {default: () => assert.fail('read a recipe')}})

beforeEach(() => {
    Object.assign(state, {inputBands: [], sampledOver: null})
})
