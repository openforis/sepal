import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {createPricing, STORAGE_COST_PER_GB_MONTH} from './pricing.js'

// Instance-type ids in the worker's catalog when this map was copied.
// Pins budget's copy only; drift in the worker's table needs a manual cross-check.
const WORKER_INSTANCE_TYPE_COUNT = 90

describe('pricing', () => {
    test('storageCostPerGbMonth is 0.33 (EFS pricing)', () => {
        const pricing = createPricing()
        assert.equal(pricing.storageCostPerGbMonth, 0.33)
        assert.equal(STORAGE_COST_PER_GB_MONTH, 0.33)
    })

    test('hourlyCostByInstanceType() has one entry per worker instance type (completeness)', () => {
        const pricing = createPricing()
        const map = pricing.hourlyCostByInstanceType()
        assert.equal(Object.keys(map).length, WORKER_INSTANCE_TYPE_COUNT)
    })

    test('hourlyCostByInstanceType() returns the same map instance on repeated calls', () => {
        const pricing = createPricing()
        assert.equal(pricing.hourlyCostByInstanceType(), pricing.hourlyCostByInstanceType())
    })

    test('spot-check a few costs against the worker tables (verbatim copy)', () => {
        const map = createPricing().hourlyCostByInstanceType()
        assert.equal(map.T3aSmall, 0.0204) // AWS + LOCAL, tagged t1, current gen
        assert.equal(map.C7a12xlarge, 2.64288) // AWS-only
        assert.equal(map.C7a16xlarge, 3.52384) // AWS-only, legacy
        assert.equal(map.C8a16xlarge, 3.70016) // AWS-only
        assert.equal(map.X2idn32xlarge, 16.006) // AWS-only
        assert.equal(map.M5a12xlarge, 2.304) // AWS + LOCAL
        assert.equal(map.G512xlarge, 6.332) // last entry, GPU type
        assert.equal(map.NoSuchType, undefined) // unknown types are absent → calculator prices at 0
    })
})
