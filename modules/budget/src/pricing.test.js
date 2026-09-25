import {createPricing, STORAGE_COST_PER_GB_MONTH} from './pricing.js'

// Instance-type ids in the worker's catalog when this map was copied.
// Pins budget's copy only; drift in the worker's table needs a manual cross-check.
const WORKER_INSTANCE_TYPE_COUNT = 90

describe('pricing', () => {
    test('storageCostPerGbMonth is 0.33 (EFS pricing)', () => {
        const pricing = createPricing()
        expect(pricing.storageCostPerGbMonth).toBe(0.33)
        expect(STORAGE_COST_PER_GB_MONTH).toBe(0.33)
    })

    test('hourlyCostByInstanceType() has one entry per worker instance type (completeness)', () => {
        const pricing = createPricing()
        const map = pricing.hourlyCostByInstanceType()
        expect(Object.keys(map)).toHaveLength(WORKER_INSTANCE_TYPE_COUNT)
    })

    test('hourlyCostByInstanceType() returns the same map instance on repeated calls', () => {
        const pricing = createPricing()
        expect(pricing.hourlyCostByInstanceType()).toBe(pricing.hourlyCostByInstanceType())
    })

    test('spot-check a few costs against the worker tables (verbatim copy)', () => {
        const map = createPricing().hourlyCostByInstanceType()
        expect(map.T3aSmall).toBe(0.0204) // AWS + LOCAL, tagged t1, current gen
        expect(map.C7a12xlarge).toBe(2.64288) // AWS-only
        expect(map.C7a16xlarge).toBe(3.52384) // AWS-only, legacy
        expect(map.C8a16xlarge).toBe(3.70016) // AWS-only
        expect(map.X2idn32xlarge).toBe(16.006) // AWS-only
        expect(map.M5a12xlarge).toBe(2.304) // AWS + LOCAL
        expect(map.G512xlarge).toBe(6.332) // last entry, GPU type
        expect(map.NoSuchType).toBeUndefined() // unknown types are absent → calculator prices at 0
    })
})
