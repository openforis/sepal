import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

// A GEE job receiving an aoi straight from the request. The descriptor reaches Earth Engine unless the
// job resolves it first.
const resolvedById = {}
const resolved = id => resolvedById[id] || (resolvedById[id] = {resolvedFrom: id, bounds: () => 'bounds'})

const captured = {}

mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: ({id}) => ({getGeometry$: () => of(resolved(id))})
    }
})
mock.module('#gee/jobs/job', {
    exports: {
        job: ({worker$}) => worker$
    }
})
mock.module('#sepal/ee/ee', {
    exports: {
        default: {
            FeatureCollection: () => ({
                filterBounds: geometry => (captured.filterBounds = geometry, {
                    reduceColumns: () => ({get: () => 'list'})
                })
            }),
            Reducer: {toList: () => ({})},
            getInfo$: () => of([])
        }
    }
})

const {default: sceneAreas$} = await import('#gee/jobs/ee/image/sceneAreas')

describe('scene areas job', () => {
    it('filters by the resolved geometry of an asset aoi', async () => {
        const aoi = {type: 'ASSET', id: 'some/asset'}

        await firstValueFrom(sceneAreas$({requestArgs: {aoi, source: 'LANDSAT'}}))

        assert.equal(captured.filterBounds, resolved(aoi.id))
    })

    it('filters by the resolved geometry of a recipe aoi', async () => {
        const aoi = {type: 'RECIPE', id: 'some-recipe'}

        await firstValueFrom(sceneAreas$({requestArgs: {aoi, source: 'SENTINEL_2'}}))

        assert.equal(captured.filterBounds, resolved(aoi.id))
    })
})
