import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {lastValueFrom, of} from 'rxjs'

import {stackBandCorrespondence, stackOutputNames} from '#sepal/recipe/type/stack'

// PyEO's baseline gate_index of the Classification's input, computed: the real index definitions (optical/indexes.js)
// over a numeric Earth Engine stand-in - four pixels per band, a masked pixel null, which stays masked through
// arithmetic. Inputs are stored as optical bands are, reflectance ×10000; the gate_index is stored as monitoring's
// indexes are (collection.js): the index ×10000, truncated to int16. A Stack outputs its asset's bands under the names
// its mapping gives them; a recipe's image is selected by output name, as the Stack builds it (stack/stack.js).

const state = {assets: {}, recipes: {}, requests: []}

const PIXELS = [0, 1, 2, 3]

const pixelwise = (values, others, operation) =>
    values.map((value, p) => value === null || others.some(other => other[p] === null) ? null : operation(value, ...others.map(other => other[p])))

class Num {
    constructor(value) {
        this.value = value
    }

    eq(other) {
        return new Num(this.value === other ? 1 : 0)
    }
}

class Image {
    constructor(bands) {
        this.bands = bands
    }

    select(names, renamed) {
        return new Image(Object.fromEntries([names].flat().map((name, i) => {
            assert.ok(name in this.bands, `no band ${name}`)
            return [renamed ? renamed[i] : name, this.bands[name]]
        })))
    }

    selectExisting(names) {
        return new Image(Object.fromEntries(Object.entries(this.bands).filter(([name]) => names.includes(name))))
    }

    selectOrDefault(names, defaultImage) {
        const [defaultValues] = Object.values(defaultImage.bands)
        return new Image(Object.fromEntries(names.map(name => [name, this.bands[name] || defaultValues])))
    }

    bandCount() {
        return new Num(Object.keys(this.bands).length)
    }

    divide(factor) {
        return this.#map(value => value / factor)
    }

    multiply(factor) {
        return this.#map(value => value * factor)
    }

    int16() {
        return this.#map(Math.trunc)
    }

    rename(name) {
        const [values] = Object.values(this.bands)
        return new Image({[name]: values})
    }

    when(condition, image) {
        return condition.value ? image : this
    }

    #map(operation) {
        return new Image(Object.fromEntries(Object.entries(this.bands).map(([name, values]) => [name, pixelwise(values, [], operation)])))
    }
}

const eeImage = source => typeof source === 'number'
    ? new Image({constant: PIXELS.map(() => source)})
    : new Image({})

// An expression over the bands given, evaluated at each pixel.
eeImage.expr = (expression, bandMap) => {
    const names = Object.keys(bandMap)
    const evaluate = new Function(...names, `return ${expression}`)
    const [first, ...rest] = names.map(name => bandMap[name].bands[name])
    return new Image({expression: pixelwise(first, rest, (...values) => evaluate(...values))})
}

mock.module('#sepal/ee/ee', {exports: {default: {Image: eeImage}}})
mock.module('#sepal/ee/imageFactory', {exports: {default: (reference, {selection} = {}) => {
    state.requests.push({id: reference.id, selection})
    if (reference.type === 'ASSET') {
        return {getImage$: () => of(state.assets[reference.id])}
    }
    const {model} = state.recipes[reference.id]
    return {
        getBands$: () => of(stackOutputNames(model)),
        getImage$: () => of(stackImage(model, selection))
    }
}}})

const {baselineGateIndex$} = await import('#sepal/ee/pyeo/baselineGateIndex')

describe('the baseline gate_index of a Stack outputting the spectral bands an index requires', () => {
    it('is NDVI calculated of red and nir, stored as monitoring stores it, masked where red is', async () => {
        const gateIndex = await baselineOf(stackOver({red: [500, 1200, 2000, null], nir: [3000, 3100, 2000, 4000]}, ['red', 'nir']), 'ndvi')

        // (0.30 - 0.05) / (0.30 + 0.05) = 0.7142..., (0.31 - 0.12) / (0.31 + 0.12) = 0.4418..., and 0.
        assert.deepEqual(gateIndex.bands, {gate_index: [7142, 4418, 0, null]})
        assert.deepEqual(state.requests.at(-1), {id: STACK, selection: ['red', 'nir']})
    })

    it('is NDMI calculated of nir and swir1', async () => {
        const gateIndex = await baselineOf(stackOver({nir: [3000, 4300, 1100, 2000], swir1: [1100, 3600, 3000, 600]}, ['nir', 'swir1']), 'ndmi')

        // 0.19 / 0.41 = 0.4634..., 0.07 / 0.79 = 0.0886..., its negation, and 0.14 / 0.26 = 0.5384...
        assert.deepEqual(gateIndex.bands, {gate_index: [4634, 886, -4634, 5384]})
    })

    it('is NBR calculated of nir and swir2, whatever the asset beneath holds besides', async () => {
        const gateIndex = await baselineOf(stackOver({red: [1, 1, 1, 1], nir: [3300, 2500, 1000, 4500], swir2: [1000, 2500, 3300, 700]}, ['nir', 'swir2']), 'nbr')

        // 0.23 / 0.43 = 0.5348..., 0, its negation, and 0.38 / 0.52 = 0.7307...
        assert.deepEqual(gateIndex.bands, {gate_index: [5348, 0, -5348, 7307]})
    })

    it('reads the bands under the names the Stack outputs them by', async () => {
        const stack = stackOver({b4: [1200, 1200, 1200, 1200], b8: [3100, 3100, 3100, 3100]}, ['b4', 'b8'], {b4: 'red', b8: 'nir'})

        assert.deepEqual((await baselineOf(stack, 'ndvi')).bands, {gate_index: [4418, 4418, 4418, 4418]})
    })
})

describe('the baseline gate_index of a Stack providing the index itself', () => {
    it('is that band, already stored as monitoring stores it, never scaled again', async () => {
        const stack = stackOver({red: [500, 500, 500, 500], nir: [3000, 3000, 3000, 3000], ndvi: [6000, 6100, null, -2000]}, ['red', 'nir', 'ndvi'])

        assert.deepEqual((await baselineOf(stack, 'ndvi')).bands, {gate_index: [6000, 6100, null, -2000]})
        assert.deepEqual(state.requests.at(-1), {id: STACK, selection: ['ndvi']})
    })
})

describe('the baseline gate_index of a Stack outputting what the index requires under other names', () => {
    it('is refused, as readiness refuses it', async () => {
        const stack = stackOver({red: [500, 500, 500, 500], nir: [3000, 3000, 3000, 3000]}, ['red', 'nir'], {nir: 'b8'})

        await assert.rejects(baselineOf(stack, 'ndvi'), /provides neither ndvi nor the bands it is calculated of/)
    })
})

describe('the baseline gate_index of an asset input', () => {
    it('is calculated of the whole asset as before', async () => {
        state.assets[ASSET] = new Image({red: [500, 1200, 2000, null], nir: [3000, 3100, 2000, 4000]})

        const gateIndex = await lastValueFrom(baselineGateIndex$({type: 'ASSET', id: ASSET}, 'ndvi'))

        assert.deepEqual(gateIndex.bands, {gate_index: [7142, 4418, 0, null]})
        assert.deepEqual(state.requests.at(-1), {id: ASSET, selection: undefined})
    })
})

const ASSET = 'users/x/optical'
const STACK = 'stack-1'

// A Stack of an asset of `bands`, mapping `mapped` of them to outputs of the same names unless `renamed` names another.
const stackOver = (bands, mapped, renamed = {}) => {
    state.assets[ASSET] = new Image(bands)
    return {
        id: STACK,
        type: 'STACK',
        model: {
            inputImagery: {images: [{imageId: 's-1', type: 'ASSET', id: ASSET}]},
            bandNames: {bandNames: [{imageId: 's-1', bands: mapped.map(band => ({originalName: band, outputName: renamed[band] || band}))}]}
        }
    }
}

const baselineOf = (stack, index) => {
    state.recipes[stack.id] = stack
    return lastValueFrom(baselineGateIndex$({imageId: 'i-1', type: 'RECIPE_REF', id: stack.id}, index))
}

// The Stack's image, its outputs selected by name as stack.js selects them.
const stackImage = (model, selection) => {
    const [{image, bands}] = stackBandCorrespondence(model)
    const selected = selection ? bands.filter(({outputName}) => selection.includes(outputName)) : bands
    return state.assets[image.id].select(selected.map(({originalName}) => originalName), selected.map(({outputName}) => outputName))
}
