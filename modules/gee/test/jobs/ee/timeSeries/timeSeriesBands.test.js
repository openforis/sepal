import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {firstValueFrom} from 'rxjs'

// What a Time Series' catalogue answers: its declared count, however little is configured, without building its
// collection or resolving its AOI. Which bands execution builds is the live verifier's
// (verify/timeSeriesOutputBands.mjs).

mock.module('#sepal/ee/ee', {
    exports: {
        default: {}
    }
})
const getCollection$ = mock.fn()
mock.module('#sepal/ee/timeSeries/collection', {
    exports: {
        getCollection$
    }
})
const toGeometry$ = mock.fn()
mock.module('#sepal/ee/aoi', {
    exports: {
        toGeometry$
    }
})

const {default: timeSeries} = await import('#sepal/ee/timeSeries/timeSeries')

describe('the bands a Time Series reports', () => {
    for (const [scenario, model] of [
        ['a configured recipe', {aoi: {}, dates: {}, sources: {dataSets: {LANDSAT: ['LANDSAT_8']}}, options: {}}],
        ['a recipe configuring nothing', {}]
    ]) {
        it(`are its count alone, for ${scenario}`, async () => {
            assert.deepEqual(await firstValueFrom(timeSeries({model}).getBands$()), ['count'])
            assert.equal(getCollection$.mock.callCount(), 0)
            assert.equal(toGeometry$.mock.callCount(), 0)
        })
    }
})
