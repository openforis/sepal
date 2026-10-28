import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// The time-series collection is the shape where a caller may already hold a geometry. When it does not,
// the aoi has to be resolved before the collection is constructed from it.
const resolvedById = {}
const resolved = id => resolvedById[id] || (resolvedById[id] = {resolvedFrom: id, bounds: () => 'bounds'})

const captured = {}

mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: ({id}) => ({getGeometry$: () => (captured.resolutions = (captured.resolutions || 0) + 1, of(resolved(id)))})
    }
})
mock.module('#sepal/ee/optical/collection', {
    exports: {
        allScenes: args => (captured.geometry = args.geometry, {map: () => ({limit: () => ({size: () => 1})})})
    }
})
mock.module('#sepal/ee/recipeRef', {
    exports: {
        default: () => ({getRecipe$: () => of(null)})
    }
})
mock.module('#sepal/ee/validate', {
    exports: {
        validateEEImageCollection: ({imageCollection}) => imageCollection
    }
})
mock.module('#sepal/ee/optical/addTasseledCap', {
    exports: {
        default: image => image
    }
})
mock.module('#sepal/ee/optical/indexes', {
    exports: {
        calculateIndex: () => ({}),
        supportedIndexes: () => []
    }
})
mock.module('#sepal/ee/planet/collection', {
    exports: {
        createCollection: () => ({})
    }
})
mock.module('#sepal/ee/radar/collection', {
    exports: {
        createCollection: () => ({})
    }
})

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

        assert.equal(captured.geometry, resolved(asset.id))
    })

    it('uses a geometry the caller already holds without resolving the aoi again', async () => {
        const explicit = {explicit: 'geometry'}

        await firstValueFrom(getCollection$({recipe: recipe(asset), bands: ['red'], geometry: explicit}))

        assert.equal(captured.geometry, explicit)
        assert.equal(captured.resolutions, 0)
    })

    it('resolves lazily - nothing happens until the collection is subscribed to', () => {
        getCollection$({recipe: recipe(asset), bands: ['red']})

        assert.equal(captured.resolutions, 0)
    })
})
