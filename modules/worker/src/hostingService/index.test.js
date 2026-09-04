import {createHostingService} from './index.js'
import {AWS_INSTANCE_TYPES, LOCAL_INSTANCE_TYPES} from './instanceTypes.js'

test('createHostingService(local) selects LOCAL_INSTANCE_TYPES', () => {
    const svc = createHostingService({hostingService: 'local'})
    expect(svc.instanceTypes).toBe(LOCAL_INSTANCE_TYPES)
})

test('createHostingService(aws) selects AWS_INSTANCE_TYPES', () => {
    const svc = createHostingService({hostingService: 'aws'})
    expect(svc.instanceTypes).toBe(AWS_INSTANCE_TYPES)
})

test('createHostingService throws for unknown service name', () => {
    expect(() => createHostingService({hostingService: 'gcp'})).toThrow('Unknown hosting service: gcp')
})
