import {jest} from '@jest/globals'
import {firstValueFrom, of, throwError} from 'rxjs'

// Wiring only: the live verifier checks real Earth Engine values, masks, projections and outside pixels.
const geometry = label => ({label, isUnbounded: () => false, union: other => geometry(`${label}+${other.label}`)})
const FIRST = geometry('reported-first-input')
const SECOND = geometry('second-footprint')
const getGeometry$ = jest.fn()
const imageFactory = jest.fn(({imageId}) => ({
    getImage$: () => of(image([imageId === 'first' ? 'red' : 'nir'])),
    getGeometry$
}))
jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({default: imageFactory}))

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
jest.unstable_mockModule('#sepal/ee/ee', () => ({default: {
    Image: value => Array.isArray(value) ? image(value.flat(Infinity).flatMap(({bands}) => bands)) : value || image(),
    List: list,
    Geometry: value => value,
    Algorithms: {If: (condition, yes, no) => condition ? yes : no},
    Dictionary: {fromLists: () => ({})},
    Reducer: {mean: () => ({})}
}}))
const {default: bandMath} = await import('#sepal/ee/bandMath/bandMath')

beforeEach(() => {
    jest.clearAllMocks()
    getGeometry$.mockImplementation(() => of(FIRST))
})

it.each([undefined, [], ['direct'], ['expression'], ['reducer']])('clips the built output to the reported geometry, selection=%s', async selection => {
    const factory = bandMath(RECIPE, {selection})
    const reported = await firstValueFrom(factory.getGeometry$())
    const built = await firstValueFrom(factory.getImage$())
    expect(reported).toBe(FIRST)
    expect(built.clippedTo).toBe(reported)
    expect(built.bands).toEqual(selection?.length ? selection : ['direct', 'expression', 'reducer'])
    expect(imageFactory).toHaveBeenCalledWith(RECIPE.model.inputImagery.images[0])
})

it('propagates a geometry resolution failure instead of falling back to other input footprints', async () => {
    const failure = new Error('first input geometry unavailable')
    getGeometry$.mockImplementation(() => throwError(() => failure))
    await expect(firstValueFrom(bandMath(RECIPE).getImage$())).rejects.toBe(failure)
})

it('does not substitute other finite footprints for an unbounded reported boundary', async () => {
    getGeometry$.mockImplementation(() => of({...FIRST, isUnbounded: () => true}))
    const built = await firstValueFrom(bandMath(RECIPE).getImage$())
    expect(built.clippedTo).toBeUndefined()
})

it('refuses an unavailable boundary instead of constructing a fallback region', async () => {
    getGeometry$.mockImplementation(() => of(null))
    await expect(firstValueFrom(bandMath(RECIPE).getImage$())).rejects.toThrow('first input geometry is unavailable')
})

it('passes an empty resolved geometry to clipping without replacing it', async () => {
    const empty = geometry('empty')
    getGeometry$.mockImplementation(() => of(empty))
    expect((await firstValueFrom(bandMath(RECIPE).getImage$())).clippedTo).toBe(empty)
})

it('keeps the existing empty-input completion without trying to resolve a boundary', async () => {
    const empty = {...RECIPE, model: {...RECIPE.model, inputImagery: {images: []}}}
    await expect(firstValueFrom(bandMath(empty).getImage$(), {defaultValue: 'empty'})).resolves.toBe('empty')
    expect(imageFactory).not.toHaveBeenCalled()
    expect(() => bandMath(empty).getGeometry$()).toThrow(TypeError)
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
