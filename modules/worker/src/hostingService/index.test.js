import {createHostingService} from './index.js'
import {INSTANCE_TYPES} from './instanceTypes.js'

test.each(['local', 'aws'])('createHostingService(%s) offers the instance catalog', hostingService => {
    const svc = createHostingService({hostingService})
    expect(svc.instanceTypes).toBe(INSTANCE_TYPES)
})

test('createHostingService throws for unknown service name', () => {
    expect(() => createHostingService({hostingService: 'gcp'})).toThrow('Unknown hosting service: gcp')
})
