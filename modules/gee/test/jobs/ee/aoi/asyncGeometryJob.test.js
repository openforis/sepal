import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

// A GEE job receiving an aoi straight from the request. The descriptor reaches Earth Engine unless the
// job resolves it first.
const resolvedById = {}
const resolved = id => resolvedById[id] || (resolvedById[id] = {resolvedFrom: id, bounds: () => 'bounds'})

const captured = {}

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({
    default: ({id}) => ({getGeometry$: () => of(resolved(id))})
}))
jest.unstable_mockModule('#gee/jobs/job', () => ({job: ({worker$}) => worker$}))
jest.unstable_mockModule('#sepal/ee/ee', () => ({
    default: {
        FeatureCollection: () => ({
            filterBounds: geometry => (captured.filterBounds = geometry, {
                reduceColumns: () => ({get: () => 'list'})
            })
        }),
        Reducer: {toList: () => ({})},
        getInfo$: () => of([])
    }
}))

const {default: sceneAreas$} = await import('#gee/jobs/ee/image/sceneAreas')

describe('scene areas job', () => {
    it('filters by the resolved geometry of an asset aoi', async () => {
        const aoi = {type: 'ASSET', id: 'some/asset'}

        await firstValueFrom(sceneAreas$({requestArgs: {aoi, source: 'LANDSAT'}}))

        expect(captured.filterBounds).toBe(resolved(aoi.id))
    })

    it('filters by the resolved geometry of a recipe aoi', async () => {
        const aoi = {type: 'RECIPE', id: 'some-recipe'}

        await firstValueFrom(sceneAreas$({requestArgs: {aoi, source: 'SENTINEL_2'}}))

        expect(captured.filterBounds).toBe(resolved(aoi.id))
    })
})
