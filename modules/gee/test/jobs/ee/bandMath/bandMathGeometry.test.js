import assert from 'node:assert/strict'
import {beforeEach, it, mock} from 'node:test'
import {format, isDeepStrictEqual} from 'node:util'

import {firstValueFrom, of, throwError} from 'rxjs'

import {callsOf} from '#sepal/testSupport/mock'

// Wiring only: the live verifier checks real Earth Engine values, masks, projections and outside pixels.
const geometry = label => ({label, isUnbounded: () => false, union: other => geometry(`${label}+${other.label}`)})
const FIRST = geometry('reported-first-input')
const SECOND = geometry('second-footprint')
const getGeometry$ = mock.fn()
const imageFactory = mock.fn(({imageId}) => ({
    getImage$: () => of(image([imageId === 'first' ? 'red' : 'nir'])),
    getGeometry$
}))
mock.module('#sepal/ee/imageFactory', {exports: {default: imageFactory}})

const image = (bands = [], clippedTo) => ({
    bands, clippedTo,
    select: (selection, renamed) => image(renamed || (selection === '.*' ? bands : [selection].flat()), clippedTo),
    rename: names => image(names, clippedTo),
    expression: () => image(['expression']),
    reduce: () => image(['reduced']),
    cast: () => image(bands, clippedTo),
    clip: boundary => image(bands, boundary),
    // Deliberately different from the reported boundary: don't replace geometry resolution with image.geometry().
    geometry: () => SECOND
})
const list = values => ({
    map: (fn, dropNulls) => list(values.map(fn).filter(value => !dropNulls || value !== null)),
    size: () => values.length,
    get: index => values[index],
    iterate: (fn, initial) => values.reduce((acc, value) => fn(value, acc), initial)
})
mock.module('#sepal/ee/ee', {exports: {default: {
    Image: value => Array.isArray(value) ? image(value.flat(Infinity).flatMap(({bands}) => bands)) : value || image(),
    List: list,
    Geometry: value => value,
    Algorithms: {If: (condition, yes, no) => condition ? yes : no},
    Dictionary: {fromLists: () => ({})},
    Reducer: {mean: () => ({})}
}}})
const {default: bandMath} = await import('#sepal/ee/bandMath/bandMath')

beforeEach(() => {
    getGeometry$.mock.resetCalls()
    imageFactory.mock.resetCalls()
    getGeometry$.mock.mockImplementation(() => of(FIRST))
})

for (const selection of [undefined, [], ['direct'], ['expression'], ['reducer']]) {
    it(format('clips the built output to the reported geometry, selection=%s', selection), async () => {
        const factory = bandMath(RECIPE, {selection})
        const reported = await firstValueFrom(factory.getGeometry$())
        const built = await firstValueFrom(factory.getImage$())
        assert.equal(reported, FIRST)
        assert.equal(built.clippedTo, reported)
        assert.deepEqual(built.bands, selection?.length ? selection : ['direct', 'expression', 'reducer'])
        assert.ok(callsOf(imageFactory).some(actual => actual.length === 1 && isDeepStrictEqual(actual[0], RECIPE.model.inputImagery.images[0])))
    })
}

it('propagates a geometry resolution failure instead of falling back to other input footprints', async () => {
    const failure = new Error('first input geometry unavailable')
    getGeometry$.mock.mockImplementation(() => throwError(() => failure))
    await assert.rejects(firstValueFrom(bandMath(RECIPE).getImage$()), error => error === failure)
})

it('does not substitute other finite footprints for an unbounded reported boundary', async () => {
    getGeometry$.mock.mockImplementation(() => of({...FIRST, isUnbounded: () => true}))
    const built = await firstValueFrom(bandMath(RECIPE).getImage$())
    assert.equal(built.clippedTo, undefined)
})

it('refuses an unavailable boundary instead of constructing a fallback region', async () => {
    getGeometry$.mock.mockImplementation(() => of(null))
    await assert.rejects(firstValueFrom(bandMath(RECIPE).getImage$()), error => error.message.includes('first input geometry is unavailable'))
})

it('passes an empty resolved geometry to clipping without replacing it', async () => {
    const empty = geometry('empty')
    getGeometry$.mock.mockImplementation(() => of(empty))
    assert.equal((await firstValueFrom(bandMath(RECIPE).getImage$())).clippedTo, empty)
})

it('keeps the existing empty-input completion without trying to resolve a boundary', async () => {
    const empty = {...RECIPE, model: {...RECIPE.model, inputImagery: {images: []}}}
    await assert.equal(await (firstValueFrom(bandMath(empty).getImage$(), {defaultValue: 'empty'})), 'empty')
    assert.equal(imageFactory.mock.callCount(), 0)
    assert.throws(() => bandMath(empty).getGeometry$(), TypeError)
})

const RECIPE = {model: {
    inputImagery: {images: [
        {imageId: 'first', name: 'i1', includedBands: [{name: 'red'}]},
        {imageId: 'second', name: 'i2', includedBands: [{name: 'nir'}]}
    ]},
    calculations: {calculations: [
        {imageId: 'expr', name: 'c1', type: 'EXPRESSION', expression: 'i2.nir * 2', dataType: 'float', includedBands: [{name: 'double'}]},
        {imageId: 'reduce', name: 'c2', type: 'FUNCTION', reducer: 'mean', dataType: 'auto', includedBands: [{name: 'mean'}],
            usedBands: [{imageId: 'first', name: 'red'}, {imageId: 'second', name: 'nir'}]}
    ]},
    outputBands: {outputImages: [
        {imageId: 'second', outputBands: [{name: 'nir', outputName: 'direct'}]},
        {imageId: 'expr', outputBands: [{name: 'double', outputName: 'expression'}]},
        {imageId: 'reduce', outputBands: [{name: 'mean', outputName: 'reducer'}]}
    ]}
}}
