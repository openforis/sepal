import {createHostingService, STORAGE_COST_PER_GB_MONTH} from './index.js'
import {AWS_INSTANCE_TYPES, LOCAL_INSTANCE_TYPES} from './instanceTypes.js'

test('storageCostPerGbMonth constant is 0.33', () => {
    expect(STORAGE_COST_PER_GB_MONTH).toBe(0.33)
})

test('createHostingService(local) selects LOCAL_INSTANCE_TYPES', () => {
    const svc = createHostingService({hostingService: 'local'})
    expect(svc.instanceTypes).toBe(LOCAL_INSTANCE_TYPES)
})

test('createHostingService(local) storageCostPerGbMonth is 0.33', () => {
    const svc = createHostingService({hostingService: 'local'})
    expect(svc.storageCostPerGbMonth).toBe(0.33)
})

test('hourlyCostByInstanceType maps id→hourlyCost for local provider', () => {
    const svc = createHostingService({hostingService: 'local'})
    const costMap = svc.hourlyCostByInstanceType()
    expect(costMap['T3aSmall']).toBe(0.0204)
    expect(costMap['G512xlarge']).toBe(6.332)
    expect(Object.keys(costMap)).toHaveLength(LOCAL_INSTANCE_TYPES.length)
})

test('createHostingService(aws) selects AWS_INSTANCE_TYPES', () => {
    const svc = createHostingService({hostingService: 'aws'})
    expect(svc.instanceTypes).toBe(AWS_INSTANCE_TYPES)
})

test('createHostingService(aws) hourlyCostByInstanceType maps id→hourlyCost', () => {
    const svc = createHostingService({hostingService: 'aws'})
    const costMap = svc.hourlyCostByInstanceType()
    expect(costMap['T3aSmall']).toBe(0.0204)
    expect(costMap['M6a16xlarge']).toBe(3.0816)
    expect(costMap['G512xlarge']).toBe(6.332)
    expect(Object.keys(costMap)).toHaveLength(AWS_INSTANCE_TYPES.length)
})

test('createHostingService throws for unknown service name', () => {
    expect(() => createHostingService({hostingService: 'gcp'})).toThrow('Unknown hosting service: gcp')
})

test('hourlyCostByInstanceType returns a plain object', () => {
    const svc = createHostingService({hostingService: 'local'})
    const map = svc.hourlyCostByInstanceType()
    expect(typeof map).toBe('object')
    expect(map).not.toBeNull()
})
