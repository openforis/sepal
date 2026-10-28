import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {scene} from './sentinel2.js'

describe('scene', () => {
    test('gives a leap-year scene the day of year of the same date in a non-leap year', () => {
        const result = scene(aScene({acquiredTimestamp: '2024-08-31T10:10:21.000Z'}))

        assert.equal(result.dayOfYear, 243)
    })
})

const aScene = (overrides = {}) => ({
    id: '20240831T101021_20240831T130000_T32TQM',
    productUri: 'S2A_MSIL2A_20240831T101021_N0511_R022_T32TQM_20240831T130000.SAFE',
    acquiredTimestamp: '2024-08-31T10:10:21.000Z',
    cloudCover: '12.5',
    ...overrides
})
