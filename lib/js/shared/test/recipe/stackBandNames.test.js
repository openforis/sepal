import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {committedBandNames, unresolvedBands} from '#sepal/recipe/type/stack'

// The names a commit gives a Stack's output bands, from the model before it and the model as the commit leaves it. A
// name without a matching `automaticName` is the user's: kept as given, colliding or not. Automatic names are given in
// Stack order, around the user's and the names other bands already hold, and stay with their band. A name a band held
// before the commit is never given to a band of another source, in that commit or a later one.

describe('a commit naming new bands', () => {
    it('names each after its own band, in Stack order, apart from one another', () => {
        const stack = commit(EMPTY, stackOver([input('i-1', DEM, ['elevation']), input('i-2', LIDAR, ['elevation'])]))

        assert.deepEqual(names(stack), {'i-1-elevation': 'elevation', 'i-2-elevation': 'elevation_1'})
        assert.deepEqual(automaticBands(stack), ['i-1-elevation', 'i-2-elevation'])
    })

    it('names them around the names the user gave', () => {
        const images = [input('i-1', DEM, ['elevation']), input('i-2', LIDAR, ['height'])]
        const before = stackOver([images[1]], [entry('i-2', [explicit('i-2', 'height', 'elevation')])])

        const stack = commit(before, withInputs(before, images))

        assert.deepEqual(names(stack), {'i-1-elevation': 'elevation_1', 'i-2-height': 'elevation'})
        assert.deepEqual(automaticBands(stack), ['i-1-elevation'])
    })

    it('keeps a later band\'s automatic name when an earlier input gains a band of that name', () => {
        const before = commit(EMPTY, stackOver([input('i-1', DEM, ['slope']), input('i-2', LIDAR, ['elevation'])]))

        const stack = commit(before, withInputs(before, [input('i-1', DEM, ['slope', 'elevation']), input('i-2', LIDAR, ['elevation'])]))

        assert.deepEqual(names(stack), {'i-1-slope': 'slope', 'i-1-elevation': 'elevation_1', 'i-2-elevation': 'elevation'})
    })
})

describe('a commit removing bands', () => {
    it('keeps the names of the bands that remain, retiring the removed ones', () => {
        const before = commit(EMPTY, stackOver([input('i-1', DEM, ['elevation']), input('i-2', LIDAR, ['elevation'])]))

        const stack = commit(before, withInputs(before, [input('i-2', LIDAR, ['elevation'])]))

        assert.deepEqual(stack.bandNames.bandNames, [entry('i-2', [automatic('i-2', 'elevation', 'elevation_1')])])
        assert.deepEqual(stack.bandNames.retired, [{name: 'elevation', source: `ASSET:${DEM}`, band: 'elevation'}])
    })

    it('gives a retired name to no band of another source, in a later commit', () => {
        const kept = [input('i-2', LIDAR, ['elevation'])]
        const removed = commit(EMPTY, stackOver([input('i-1', DEM, ['elevation']), ...kept]))
        const before = commit(removed, withInputs(removed, kept))

        const stack = commit(before, withInputs(before, [...kept, input('i-3', SURVEY, ['elevation'])]))

        assert.equal(names(stack)['i-3-elevation'], 'elevation_2')
    })

    it('gives a name it frees to no band of another source, in the same commit', () => {
        const before = commit(EMPTY, stackOver([input('i-1', DEM, ['elevation']), input('i-2', LIDAR, ['elevation'])]))

        const stack = commit(before, withInputs(before, [input('i-2', LIDAR, ['elevation']), input('i-3', SURVEY, ['elevation'])]))

        assert.deepEqual(names(stack), {'i-2-elevation': 'elevation_1', 'i-3-elevation': 'elevation_2'})
    })

    it('keeps a name the user gave one band from another band of its source added as that band is removed', () => {
        const before = commit(EMPTY, stackOver([input('i-1', DEM, ['red'])], [entry('i-1', [explicit('i-1', 'red', 'nir')])]))

        const stack = commit(before, withInputs(before, [input('i-1', DEM, ['nir'])]))

        assert.deepEqual(names(stack), {'i-1-nir': 'nir_1'})
        assert.deepEqual(stack.bandNames.retired, [{name: 'nir', source: `ASSET:${DEM}`, band: 'red'}])
    })

    it('gives a band of the same source its retired name back', () => {
        const kept = [input('i-2', LIDAR, ['elevation'])]
        const removed = commit(EMPTY, stackOver([input('i-1', DEM, ['elevation']), ...kept]))
        const before = commit(removed, withInputs(removed, kept))

        const stack = commit(before, withInputs(before, [...kept, input('i-3', DEM, ['elevation'])]))

        assert.equal(names(stack)['i-3-elevation'], 'elevation')
        assert.deepEqual(stack.bandNames.retired, [])
    })
})

describe('a commit renaming bands', () => {
    it('moves an automatic band whose name the user gives another band', () => {
        const before = commit(EMPTY, stackOver([input('i-1', DEM, ['elevation']), input('i-2', LIDAR, ['height'])]))

        const stack = commit(before, withBandNames(before, [
            entry('i-1', [automatic('i-1', 'elevation')]),
            entry('i-2', [explicit('i-2', 'height', 'elevation')])
        ]))

        assert.deepEqual(names(stack), {'i-1-elevation': 'elevation_1', 'i-2-height': 'elevation'})
        assert.deepEqual(automaticBands(stack), ['i-1-elevation'])
    })

    it('names a band whose name the user cleared automatically, after its own band', () => {
        const before = commit(EMPTY, stackOver([input('i-1', DEM, ['elevation'])], [entry('i-1', [explicit('i-1', 'elevation', 'elevation')])]))

        const stack = commit(before, withBandNames(before, [entry('i-1', [unnamed('i-1', 'elevation')])]))

        assert.deepEqual(stack.bandNames.bandNames, [entry('i-1', [automatic('i-1', 'elevation')])])
    })

    it('keeps a name changed from the one generated as the user\'s, never moved for another', () => {
        const before = stackOver([input('i-1', DEM, ['red']), input('i-2', LIDAR, ['nir'])], [
            entry('i-1', [{...automatic('i-1', 'red'), outputName: 'chosen'}]),
            entry('i-2', [explicit('i-2', 'nir', 'chosen')])
        ])

        const stack = commit(before, before)

        assert.deepEqual(stack.bandNames.bandNames, [
            entry('i-1', [explicit('i-1', 'red', 'chosen')]),
            entry('i-2', [explicit('i-2', 'nir', 'chosen')])
        ])
    })
})

describe('a commit over a saved Stack', () => {
    it('keeps every name saved without a generated one as the user\'s, however it looks, colliding ones included', () => {
        const saved = [
            entry('i-1', [explicit('i-1', 'elevation', 'elevation_1')]),
            entry('i-2', [explicit('i-2', 'red', 'x')]),
            entry('i-3', [explicit('i-3', 'nir', 'x')])
        ]
        const before = stackOver([input('i-1', DEM, ['elevation']), input('i-2', LIDAR, ['red']), input('i-3', SURVEY, ['nir'])], saved)

        const stack = commit(before, withInputs(before, [
            input('i-1', DEM, ['elevation']), input('i-2', LIDAR, ['red']), input('i-3', SURVEY, ['nir']), input('i-4', DEM, ['elevation'])
        ]))

        assert.deepEqual(stack.bandNames.bandNames, [...saved, entry('i-4', [automatic('i-4', 'elevation')])])
    })

    it('names a band saved blank, and the bands of an input it does not map', () => {
        const before = stackOver([input('i-1', DEM, ['elevation']), input('i-2', LIDAR, ['height'])],
            [entry('i-1', [explicit('i-1', 'elevation', '')])])

        const stack = commit(before, before)

        assert.deepEqual(names(stack), {'i-1-elevation': 'elevation', 'i-2-height': 'height'})
    })

    it('keeps each name with its input, where two inputs share a source', () => {
        const before = stackOver([input('i-1', DEM, ['elevation']), input('i-2', DEM, ['elevation'])], [
            entry('i-1', [explicit('i-1', 'elevation', 'a')]),
            entry('i-2', [explicit('i-2', 'elevation', 'b')])
        ])

        const stack = commit(before, withInputs(before, [input('i-1', DEM, ['elevation']), input('i-2', DEM, ['elevation', 'slope'])]))

        assert.deepEqual(names(stack), {'i-1-elevation': 'a', 'i-2-elevation': 'b', 'i-2-slope': 'slope'})
    })

    it('keeps the names when its inputs are reordered, naming a new band in the new order', () => {
        const before = commit(EMPTY, stackOver([input('i-1', DEM, ['elevation']), input('i-2', LIDAR, ['elevation'])]))

        const stack = commit(before, withInputs(before, [input('i-2', LIDAR, ['elevation', 'slope']), input('i-1', DEM, ['elevation', 'slope'])]))

        assert.deepEqual(names(stack), {
            'i-2-elevation': 'elevation_1', 'i-2-slope': 'slope', 'i-1-elevation': 'elevation', 'i-1-slope': 'slope_1'
        })
    })

    it('keeps the names of the rows a replaced source keeps, retiring those of the rows it drops', () => {
        const before = commit(EMPTY, stackOver([input('i-1', DEM, ['elevation', 'slope'])]))

        const stack = commit(before, withInputs(before, [input('i-1', SURVEY, ['elevation'])]))

        assert.deepEqual(names(stack), {'i-1-elevation': 'elevation'})
        assert.deepEqual(stack.bandNames.retired, [{name: 'slope', source: `ASSET:${DEM}`, band: 'slope'}])
    })

    it('keeps a name saved without its band\'s id, matched by its original name, giving it that id', () => {
        const before = stackOver([input('i-1', DEM, ['elevation', 'slope'])], [
            entry('i-1', [{originalName: 'elevation', outputName: 'dem'}, {originalName: 'slope', outputName: 'slope'}])
        ])

        const stack = commit(before, withInputs(before, [input('i-1', DEM, ['elevation', 'slope']), input('i-2', LIDAR, ['dem'])]))

        assert.deepEqual(stack.bandNames.bandNames[0], entry('i-1', [explicit('i-1', 'elevation', 'dem'), explicit('i-1', 'slope', 'slope')]))
        assert.equal(names(stack)['i-2-dem'], 'dem_1')
    })

    it('keeps an entry whose saved names it cannot tell apart as saved, holding its names, its bands left to name', () => {
        const saved = entry('i-1', [{originalName: 'red', outputName: 'a'}, {originalName: 'red', outputName: 'b'}])
        const before = stackOver([input('i-1', DEM, ['red'])], [saved])
        const model = withInputs(before, [input('i-1', DEM, ['red']), input('i-2', LIDAR, ['a'])])

        const stack = commit(before, model)

        assert.deepEqual(stack.bandNames.bandNames, [saved, entry('i-2', [automatic('i-2', 'a', 'a_1')])])
        assert.deepEqual(unresolvedBands(model), [{imageId: 'i-1', id: 'i-1-red'}])
    })

    it('changes nothing where nothing named changed', () => {
        const before = commit(EMPTY, stackOver([input('i-1', DEM, ['elevation']), input('i-2', LIDAR, ['elevation'])]))

        assert.deepEqual(commit(before, before).bandNames, before.bandNames)
    })
})

const DEM = 'users/x/dem'
const LIDAR = 'users/x/lidar'
const SURVEY = 'users/x/survey'

const EMPTY = {inputImagery: {images: []}, bandNames: {bandNames: []}}

const input = (imageId, id, bands) => ({
    imageId, type: 'ASSET', id, includedBands: bands.map(band => ({id: `${imageId}-${band}`, band}))
})

const stackOver = (images, bandNames = []) => ({inputImagery: {images}, bandNames: {bandNames}})

const entry = (imageId, bands) => ({imageId, bands})

const explicit = (imageId, band, outputName) => ({id: `${imageId}-${band}`, originalName: band, outputName})

const automatic = (imageId, band, outputName = band) => ({...explicit(imageId, band, outputName), automaticName: outputName})

const unnamed = (imageId, band) => ({id: `${imageId}-${band}`, originalName: band})

const withInputs = (model, images) => ({...model, inputImagery: {images}})

const withBandNames = (model, bandNames) => ({...model, bandNames: {...model.bandNames, bandNames}})

// The model as a commit leaves it: as changed, with the names the commit gives.
const commit = (previous, model) => ({...model, bandNames: committedBandNames(previous, model)})

const names = ({bandNames: {bandNames}}) =>
    Object.fromEntries(bandNames.flatMap(({bands}) => bands.map(({id, outputName}) => [id, outputName])))

const automaticBands = ({bandNames: {bandNames}}) => bandNames
    .flatMap(({bands}) => bands.filter(({outputName, automaticName}) => automaticName === outputName).map(({id}) => id))
