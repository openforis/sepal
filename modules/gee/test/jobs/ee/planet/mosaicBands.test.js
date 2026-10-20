import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {firstValueFrom} from 'rxjs'

// What a Planet Mosaic's catalogue answers: its declared output, however it was asked, without resolving its AOI or
// reading any imagery. Which bands execution builds for a request is the live verifier's
// (verify/planetMosaicOutputBands.mjs).

// The BRDF correction histogram matching imports reads Earth Engine at import; nothing here evaluates anything.
mock.module('#sepal/ee/ee', {
    exports: {
        default: {Image: {}}
    }
})
const toGeometry$ = mock.fn()
mock.module('#sepal/ee/aoi', {
    exports: {
        toGeometry$
    }
})

const {default: mosaic} = await import('#sepal/ee/planet/mosaic')

const DECLARED = ['blue', 'green', 'red', 'nir', 'ndvi', 'ndwi', 'evi', 'evi2', 'savi', 'kndvi']

describe('the bands a Planet Mosaic reports', () => {
    for (const [scenario, args] of [
        ['nothing', undefined],
        ['an empty selection', {selection: []}],
        ['a subset out of order', {selection: ['kndvi', 'red']}],
        ['a working band a Daily composite carries', {selection: ['dayOfYear']}]
    ]) {
        it(
            `are its declared bands, whatever it is asked for: ${scenario}`,
            async () => {
                assert.deepEqual(
                    await reportedBands(planet({source: 'DAILY', assets: ['users/x/daily']}), args),
                    DECLARED
                )
                assert.equal(toGeometry$.mock.callCount(), 0)
            }
        )
    }

    for (const [scenario, sources] of [
        ['basemaps', {source: 'BASEMAPS', assets: ['users/x/basemaps']}],
        ['no sources', undefined]
    ]) {
        it(`are the same over ${scenario}`, async () => {
            assert.deepEqual(await reportedBands(planet(sources)), DECLARED)
        })
    }
})

const planet = sources => ({model: {aoi: {}, dates: {fromDate: '2024-01-01', toDate: '2024-04-01'}, sources, options: {}}})

const reportedBands = (recipe, args) => firstValueFrom(mosaic(recipe, args).getBands$())
