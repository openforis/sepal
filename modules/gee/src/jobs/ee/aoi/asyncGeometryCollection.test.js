import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

// The time-series collection is the shape where a caller may already hold a geometry. When it does not,
// the aoi has to be resolved before the collection is constructed from it.
const resolvedById = {}
const resolved = id => resolvedById[id] || (resolvedById[id] = {resolvedFrom: id, bounds: () => 'bounds'})

const captured = {}

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({
    default: ({id}) => ({getGeometry$: () => (captured.resolutions = (captured.resolutions || 0) + 1, of(resolved(id)))})
}))
jest.unstable_mockModule('#sepal/ee/optical/collection', () => ({
    allScenes: args => (captured.geometry = args.geometry, {map: () => ({limit: () => ({size: () => 1})})})
}))
jest.unstable_mockModule('#sepal/ee/recipeRef', () => ({default: () => ({getRecipe$: () => of(null)})}))
jest.unstable_mockModule('#sepal/ee/validate', () => ({validateEEImageCollection: ({imageCollection}) => imageCollection}))
jest.unstable_mockModule('#sepal/ee/optical/addTasseledCap', () => ({default: image => image}))
jest.unstable_mockModule('#sepal/ee/optical/indexes', () => ({calculateIndex: () => ({}), supportedIndexes: () => []}))
jest.unstable_mockModule('#sepal/ee/planet/collection', () => ({createCollection: () => ({})}))
jest.unstable_mockModule('#sepal/ee/radar/collection', () => ({createCollection: () => ({})}))

const {getCollection$} = await import('#sepal/ee/timeSeries/collection')

const recipe = aoi => ({
    model: {
        aoi,
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        options: {corrections: []}
    }
})

const asset = {type: 'ASSET', id: 'some/asset'}

describe('time-series collection', () => {
    beforeEach(() => {
        captured.geometry = undefined
        captured.resolutions = 0
    })

    it('constructs the collection from the resolved geometry of an asset aoi', async () => {
        await firstValueFrom(getCollection$({recipe: recipe(asset), bands: ['red']}))

        expect(captured.geometry).toBe(resolved(asset.id))
    })

    it('uses a geometry the caller already holds without resolving the aoi again', async () => {
        const explicit = {explicit: 'geometry'}

        await firstValueFrom(getCollection$({recipe: recipe(asset), bands: ['red'], geometry: explicit}))

        expect(captured.geometry).toBe(explicit)
        expect(captured.resolutions).toBe(0)
    })

    it('resolves lazily - nothing happens until the collection is subscribed to', () => {
        getCollection$({recipe: recipe(asset), bands: ['red']})

        expect(captured.resolutions).toBe(0)
    })
})
