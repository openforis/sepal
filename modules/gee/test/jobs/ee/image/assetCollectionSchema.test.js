import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of, throwError} from 'rxjs'

// What an Asset recipe over a collection says it holds, through the REAL imageFactory, Asset recipe and shared band
// evidence. Only Earth Engine is substituted: a collection is its images, each its bands and date, filtered by date
// as Earth Engine would; a composite holds the bands of the image it is built from first, and is built lazily, so
// an empty one fails only once read. What a composite does to
// dimensionality, and whether one image reproduces a full composite's schema, is checked on live Earth Engine
// (verify/assetCollectionSchema.mjs), not here.

const EARLY = {time: '2020-06-01', bands: [{name: 'VV', dimensions: 0}, {name: 'angle', dimensions: 0}]}
const LATE = {time: '2022-06-01', bands: [{name: 'VV', dimensions: 0}, {name: 'VH', dimensions: 0}, {name: 'angle', dimensions: 0}]}
const COLLECTIONS = {'users/x/radar': [EARLY, LATE]}

let calls = []

const image = bands => new Proxy({bands}, {
    get: (target, key) => {
        if (typeof key === 'symbol' || key === 'then') {
            return undefined
        }
        const operation = {
            bands: () => target.bands,
            bandNames: () => target.bands.map(({name}) => name),
            bandTypes: () => ({get: name => target.bands.find(band => band.name === name)}),
            select: names => image(target.bands.filter(({name}) => [names].flat().includes(name))),
            rename: names => image(target.bands.map((band, index) => ({...band, name: names[index]}))),
            copyProperties: () => {
                calls.push('copyProperties')
                return image(target.bands)
            },
            clip: () => {
                calls.push('clip')
                return image(target.bands)
            }
        }[key]
        if (key === 'bands') {
            return target.bands
        }
        return operation || (() => image(target.bands))
    }
})

// An image whose every read fails with the error an Earth Engine If evaluated to.
const failing = error => new Proxy({}, {
    get: (_target, key) => typeof key === 'symbol' || key === 'then'
        ? undefined
        : () => {
            throw new Error(error)
        }
})

const collection = members => ({
    members,
    filterBounds: () => collection(members),
    filterDate: (from, to) => collection(members.filter(({time}) => time >= from && time < to)),
    filter: () => collection(members),
    map: fn => collection(members.map(fn)),
    select: names => collection(members.map(member => ({...member, bands: member.bands.filter(({name}) => names.includes(name))}))),
    limit: count => collection(members.slice(0, count)),
    merge: other => collection([...members, ...other.members]),
    first: () => image(members[0]?.bands || []),
    size: () => members.length,
    geometry: () => {
        calls.push('collection geometry')
        return {bounds: () => ({})}
    },
    ...Object.fromEntries(['mosaic', 'median', 'mean', 'min', 'max', 'mode']
        .map(reducer => [reducer, () => image(members[0]?.bands || [])])),
    reduce: () => image((members[0]?.bands || []).map(band => ({...band, name: `${band.name}_stdDev`})))
})

const ee = new Proxy({
    ImageCollection: value => typeof value === 'string'
        ? collection(COLLECTIONS[value])
        : collection(value.map(({bands}) => ({bands}))),
    Image: value => Array.isArray(value) ? image([]) : value,
    Algorithms: {If: (valid, whenValid, error) => valid ? whenValid : failing(error)},
    Dictionary: value => value,
    PixelType: band => ({dimensions: () => band.dimensions}),
    Reducer: {stdDev: () => ({})},
    getInfo$: value => of(value)
}, {
    get: (target, key) => target[key]
})

mock.module('#sepal/ee/ee', {exports: {default: ee}})
mock.module('#sepal/ee/aoi', {exports: {toGeometry$: () => of({})}})

const {RecipeScope, withRecipeScope} = await import('#sepal/ee/recipeScope')
const {default: imageFactory} = await import('#sepal/ee/imageFactory')
const {imageBandEvidence$} = await import('#sepal/ee/bandEvidence')

const inOperation = (name, fn) => it(name, async () => {
    const scope = new RecipeScope(id => throwError(() => new Error(`No recipe ${id}`)))
    try {
        await withRecipeScope(scope, fn)
    } finally {
        scope.close()
    }
})

beforeEach(() => {
    calls = []
})

const assetRecipe = ({aoi = {type: 'POLYGON', path: []}, fromDate = '2022-01-01', composite = 'MOSAIC'} = {}) => ({
    id: 'asset-1',
    type: 'ASSET_MOSAIC',
    model: {
        assetDetails: {assetId: 'users/x/radar', type: 'ImageCollection'},
        aoi,
        dates: {type: 'DATE_RANGE', fromDate, toDate: '2023-01-01'},
        composite: {type: composite}
    }
})

const typedBands = bands => bands.map(({name, dimensions}) => ({name, arrayDimensions: dimensions}))

describe('an Asset recipe filtered to a later image of its collection', () => {
    inOperation('is described by that image\'s bands, not the collection\'s first image\'s', async () => {
        const described = await firstValueFrom(imageBandEvidence$(assetRecipe()))

        assert.deepEqual(described, typedBands(LATE.bands))
    })

    inOperation('is named by the same bands', async () => {
        const names = await firstValueFrom(imageFactory(assetRecipe()).getBands$())

        assert.deepEqual(names, LATE.bands.map(({name}) => name))
    })

    inOperation('keeps the names a standard-deviation composite gives them', async () => {
        const described = await firstValueFrom(imageBandEvidence$(assetRecipe({composite: 'SD'})))

        assert.deepEqual(described, typedBands(LATE.bands))
    })
})

describe('an Asset recipe bounded by its collection', () => {
    const bounded = () => assetRecipe({aoi: {type: 'ASSET_BOUNDS'}})

    inOperation('is described without computing the collection\'s geometry, clipping or copying properties', async () => {
        await firstValueFrom(imageBandEvidence$(bounded()))

        assert.deepEqual(calls, [])
    })

    inOperation('still builds its image clipped to the collection\'s bounds', async () => {
        await firstValueFrom(imageFactory(bounded()).getImage$())

        assert.deepEqual(calls, ['collection geometry', 'copyProperties', 'copyProperties', 'clip'])
    })
})

describe('an Asset recipe whose filters leave no image', () => {
    const empty = () => assetRecipe({fromDate: '2022-12-01'})

    // Building the image instead would fail the same way, so what shows the failure is its own is that none of
    // the image's construction ran.
    inOperation('fails to be described, naming why, without building its image instead', async () => {
        await assert.rejects(firstValueFrom(imageBandEvidence$(empty())), /All images have been filtered out/)

        assert.deepEqual(calls, [])
    })

    inOperation('fails to be named the same way', async () => {
        await assert.rejects(firstValueFrom(imageFactory(empty()).getBands$()), /All images have been filtered out/)
    })
})
