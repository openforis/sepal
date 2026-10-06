import {jest} from '@jest/globals'
import {lastValueFrom, of} from 'rxjs'

// The Earth Engine half of a time-series export, as the task container drives it: tile ids, the date ranges of a
// tile that have imagery, and the start of one chunk's export. Earth Engine and the exporter are substituted.

const resolved = {resolvedFeatureCollection: true}
const aoiGeometry = {aoiGeometry: true}
const featureCollection = Object.defineProperty({__featureCollection: resolved}, 'geometry', {value: () => aoiGeometry})

const state = {}
let tileIds
let rangesWithImagery

// The assembled time series: every step of the band assembly answers the same stand-in.
const timeSeries = {
    toBands: () => timeSeries,
    regexpRename: () => timeSeries,
    clip: () => timeSeries,
    select: () => 'time-series image',
    bandNames: () => ({sort: () => 'sorted'})
}
const images = {select: () => images, distinct: () => 'distinct'}

const ee = {
    List: values => values,
    ImageCollection: () => timeSeries,
    Join: {saveAll: () => ({apply: () => ({map: () => 'joined'})})},
    Filter: {equals: () => 'equal-dates'},
    Date: value => value,
    getInfo$: (value, description) => {
        state.getInfoCalls.push(description)
        return of(String(description).startsWith('time-series tile ids') ? tileIds : value)
    }
}

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: ee}))
jest.unstable_mockModule('#sepal/ee/aoi', () => ({
    toFeatureCollection$: aoi => (state.aois.push(aoi), of(featureCollection))
}))
jest.unstable_mockModule('#sepal/ee/tile', () => ({
    default: (collection, sizeInDegrees) => {
        state.tile = {collection, sizeInDegrees}
        return {
            aggregate_array: () => 'tileIds',
            filterMetadata: () => ({first: () => ({geometry: () => 'tileGeometry'})})
        }
    }
}))
jest.unstable_mockModule('#sepal/ee/timeSeries/collection', () => ({
    getCollection$: args => (state.getCollection = args, of(images))
}))
const imagery = ({startDate}) => rangesWithImagery.includes(startDate)
jest.unstable_mockModule('#sepal/ee/optical/collection', () => ({hasImagery: imagery}))
jest.unstable_mockModule('#sepal/ee/planet/collection', () => ({hasImagery: imagery}))
jest.unstable_mockModule('#sepal/ee/radar/collection', () => ({hasImagery: imagery}))
jest.unstable_mockModule('#gee/jobs/task/export/toWorkspace', () => ({
    startImageToWorkspaceExport$: (args, context) => (state.export = {args, context}, of({eeTaskId: 'T1', destination: {type: 'drive', folder: 'f'}}))
}))

const {timeSeriesTiles$, timeSeriesChunks$, startTimeSeriesChunkExport$} = await import('#gee/jobs/task/export/timeSeries')

const aoi = {type: 'ASSET', id: 'some/asset'}
const recipe = {
    model: {
        aoi,
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
        dates: {startDate: '2020-01-01', endDate: '2020-04-01'},
        options: {corrections: []}
    }
}
const image = {recipe, indicator: 'ndvi', scale: 30, tileSize: 2}

beforeEach(() => {
    Object.assign(state, {aois: [], getInfoCalls: [], tile: undefined, getCollection: undefined, export: undefined})
    tileIds = ['tile-0', 'tile-1']
    rangesWithImagery = []
})

describe('timeSeriesTiles$', () => {
    it('tiles the once-resolved aoi and answers the tile ids', async () => {
        const result = await lastValueFrom(timeSeriesTiles$({description: 'ts', image}))

        expect(result).toEqual({tileIds: ['tile-0', 'tile-1']})
        expect(state.aois).toEqual([aoi])
        expect(state.tile).toEqual({collection: featureCollection, sizeInDegrees: 2})
    })
})

describe('timeSeriesChunks$', () => {
    const dateRanges = [
        {startDate: '2020-01-01', endDate: '2020-04-01'},
        {startDate: '2020-04-01', endDate: '2020-07-01'},
        {startDate: '2020-07-01', endDate: '2020-10-01'}
    ]

    it('answers, in order, only the date ranges that have imagery, checking the tile in one request', async () => {
        rangesWithImagery = ['2020-01-01', '2020-07-01']

        const result = await lastValueFrom(timeSeriesChunks$({description: 'ts', image, tileId: 'tile-0', dateRanges}))

        expect(result).toEqual({dateRanges: [dateRanges[0], dateRanges[2]]})
        expect(state.getInfoCalls).toHaveLength(1)
    })
})

describe('startTimeSeriesChunkExport$', () => {
    const request = {description: 'ts', image, tileId: 'tile-0', tileIndex: 3, startDate: '2020-01-01', endDate: '2020-04-01'}
    const sepalUser = {username: 'alice'}

    it('builds the chunk from the whole aoi and exports it to the workspace under the chunk name', async () => {
        const result = await lastValueFrom(startTimeSeriesChunkExport$(request, {sepalUser}))

        expect(result).toEqual({eeTaskId: 'T1', destination: {type: 'drive', folder: 'f'}})
        expect(state.getCollection).toEqual(expect.objectContaining({
            recipe, geometry: aoiGeometry, bands: ['ndvi'], startDate: '2020-01-01', endDate: '2020-04-01'
        }))
        expect(state.export.args).toEqual(expect.objectContaining({
            folder: 'ts_3_2020-01-01_2020-04-01', description: 'ts_3_2020-01-01_2020-04-01', scale: 30
        }))
        expect(state.export.args.image).toBe('time-series image')
        expect(state.export.args.region).toBeUndefined()
        expect(state.export.context).toEqual({sepalUser})
    })

    it('prefers the filename prefix over the description', async () => {
        await lastValueFrom(startTimeSeriesChunkExport$({...request, image: {...image, filenamePrefix: 'prefix'}}, {sepalUser}))

        expect(state.export.args.description).toBe('prefix_3_2020-01-01_2020-04-01')
    })
})
