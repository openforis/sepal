import assert from 'node:assert/strict'
import {test} from 'node:test'

import {createHostingService} from './index.js'
import {INSTANCE_TYPES} from './instanceTypes.js'

for (const hostingService of ['local', 'aws']) {
    test(
        `createHostingService(${hostingService}) offers the instance catalog`,
        () => {
            const svc = createHostingService({hostingService})
            assert.equal(svc.instanceTypes, INSTANCE_TYPES)
        }
    )
}

test('createHostingService throws for unknown service name', () => {
    assert.throws(
        () => createHostingService({hostingService: 'gcp'}),
        /Unknown hosting service: gcp/
    )
})
