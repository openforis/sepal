import {jest} from '@jest/globals'
import {EMPTY, lastValueFrom, of} from 'rxjs'

// Resolved geometries are given an identity a descriptor could never be mistaken for.
const resolvedById = {}
const resolved = id => resolvedById[id] || (resolvedById[id] = {resolvedFrom: id})

const captured = {}

// The geometry the resolved feature collection already carries. The export owns it before any tile work
// starts, so the collection owner should never have to rediscover it.
const featureCollectionGeometry = {featureCollectionGeometry: true}

// Tile ids drive how far the export runs: none ends it right after tile(), one carries it into a real
// tile/date chunk.
let tileIds = []

// Minimal ee stand-in. Feature/FeatureCollection tag their input, so an assertion can name the exact
// shape tile() was handed. getInfo$ answers the tile-id lookup from `tileIds`, which is what decides
// whether the export stops right after tile() or carries on into a chunk.
const ee = {
    Feature: geometry => ({__feature: geometry}),
    // geometry() is non-enumerable so an exact toEqual on the collection shape still matches.
    FeatureCollection: value => {
        const collection = {__featureCollection: value}
        Object.defineProperty(collection, 'geometry', {value: () => featureCollectionGeometry})
        return collection
    },
    Number: value => ({multiply: () => value}),
    Date: value => value,
    getInfo$: (_value, description) => of(
        String(description).startsWith('time-series image ids')
            ? tileIds
            : true
    )
}

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: ee}))
jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({
    default: ({id}) => ({
        getGeometry$: () => (captured.resolutions = (captured.resolutions || 0) + 1, of(resolved(id)))
    })
}))
jest.unstable_mockModule('#sepal/ee/tile', () => ({
    default: (featureCollection, sizeInDegrees) => {
        captured.tile = {featureCollection, sizeInDegrees}
        return {
            aggregate_array: () => 'tileIds',
            filterMetadata: () => ({first: () => ({geometry: () => 'tileGeometry'})})
        }
    }
}))
// Returning EMPTY ends the chunk without needing any image-processing fixture.
jest.unstable_mockModule('#sepal/ee/timeSeries/collection', () => ({
    getCollection$: args => (captured.getCollection = args, EMPTY)
}))
jest.unstable_mockModule('#sepal/ee/optical/collection', () => ({hasImagery: () => true}))
jest.unstable_mockModule('#sepal/ee/planet/collection', () => ({hasImagery: () => true}))
jest.unstable_mockModule('#sepal/ee/radar/collection', () => ({hasImagery: () => true}))
jest.unstable_mockModule('#sepal/terminal', () => ({terminal$: () => of()}))
jest.unstable_mockModule('#task/jobs/service/context', () => ({
    getCurrentContext$: () => of({config: {homeDir: '/home/user'}})
}))
jest.unstable_mockModule('#task/rxjs/fileSystem', () => ({mkdir$: dir => of(dir)}))
jest.unstable_mockModule('./workloadTag.js', () => ({setWorkloadTag: () => undefined}))
jest.unstable_mockModule('../jobs/export/toSepal.js', () => ({exportImageToSepal$: () => of()}))

const {submit$} = await import('./timeSeriesSepalExport.js')

const recipe = aoi => ({
    model: {
        aoi,
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
        dates: {startDate: '2020-01-01', endDate: '2020-04-01'},
        options: {corrections: []}
    }
})

const runExport = async aoi => {
    captured.tile = captured.getCollection = undefined
    captured.resolutions = 0
    await lastValueFrom(submit$('task-1', {
        description: 'time-series',
        image: {recipe: recipe(aoi), indicator: 'ndvi', scale: 30, tileSize: 2}
    }))
    return captured.tile
}

describe('time series sepal export', () => {
    describe.each([
        ['ASSET', {type: 'ASSET', id: 'some/asset'}],
        ['RECIPE', {type: 'RECIPE', id: 'some-recipe'}]
    ])('with a %s aoi', (_type, aoi) => {
        it('tiles the feature collection built from the resolved geometry', async () => {
            const {featureCollection} = await runExport(aoi)

            expect(featureCollection).toEqual({__featureCollection: [{__feature: resolved(aoi.id)}]})
        })
    })

    it('leaves an EE_TABLE aoi as its own feature collection', async () => {
        const {featureCollection} = await runExport({type: 'EE_TABLE', id: 'some/table'})

        expect(featureCollection).toEqual({__featureCollection: 'some/table'})
    })
})

describe('time series sepal export resolution cost', () => {
    const aoi = {type: 'ASSET', id: 'some/asset'}

    beforeEach(() => {
        tileIds = ['tile-0']
    })

    afterEach(() => {
        tileIds = []
    })

    it('hands the collection owner the geometry it already resolved, resolving the aoi once', async () => {
        await runExport(aoi)

        expect(captured.getCollection.geometry).toBe(featureCollectionGeometry)
        expect(captured.resolutions).toBe(1)
    })
})
