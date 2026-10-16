import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {firstValueFrom} from 'rxjs'

// What a BAYTS Historical's catalogue answers: its declared output, however it was asked, without building a radar
// mosaic or resolving its AOI. Which bands execution returns is the witness's (historicalOutputBands.test.js)
// and the live verifier's (verify/baytsHistoricalOutputBands.mjs).

mock.module('#sepal/ee/ee', {
    exports: {
        default: {}
    }
})
const imageFactory = mock.fn()
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: imageFactory
    }
})
const toGeometry$ = mock.fn()
mock.module('#sepal/ee/aoi', {
    exports: {
        toGeometry$
    }
})

const {default: baytsHistorical} = await import('#sepal/ee/bayts/baytsHistorical')

const pass = suffix => ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle']
    .map(statistic => `${statistic}_${suffix}`)

describe('the bands a BAYTS Historical reports', () => {
    for (const [scenario, args] of [
        ['nothing', undefined],
        ['a bare selection', {selection: ['orbit_asc']}],
        ['output bands out of order', {selection: ['VH_std_asc', 'VV_mean_desc'], outputBands: ['VH_std_asc', 'VV_mean_desc']}]
    ]) {
        it(
            `are every pass's statistics in the order its model stores the passes, whatever it is asked for: ${scenario}`,
            async () => {
                assert.deepEqual(
                    await reported(historical({orbits: ['DESCENDING', 'ASCENDING']}), args),
                    [...pass('desc'), ...pass('asc')]
                )
                assert.equal(imageFactory.mock.callCount(), 0)
                assert.equal(toGeometry$.mock.callCount(), 0)
            }
        )
    }

    for (const [scenario, model, reason] of [
        ['no options', {}, /INCOMPLETE_IMAGE_OUTPUT/],
        ['an unknown pass', {options: {orbits: ['SIDEWAYS']}}, /MALFORMED_IMAGE_OUTPUT/],
        ['a pass wrapped in a list', {options: {orbits: [['ASCENDING']]}}, /MALFORMED_IMAGE_OUTPUT/],
        ['a pass twice', {options: {orbits: ['ASCENDING', 'ASCENDING']}}, /DUPLICATE_BAND_NAME/]
    ]) {
        it(`are refused for ${scenario}, naming why`, async () => {
            await assert.rejects(reported({model}), reason)
        })
    }
})

const historical = options => ({model: {aoi: {}, dates: {}, options}})

const reported = (recipe, args) => firstValueFrom(baytsHistorical(recipe, args).getBands$())
