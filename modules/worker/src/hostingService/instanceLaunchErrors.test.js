import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {launchFailureCode} from './instanceLaunchErrors.js'

const namedError = name => Object.assign(new Error(name), {name})

describe('launchFailureCode', () => {
    it('classifies AZ capacity errors as INSTANCE_UNAVAILABLE', () => {
        assert.equal(
            launchFailureCode(namedError('InsufficientInstanceCapacity')),
            'INSTANCE_UNAVAILABLE'
        )
        assert.equal(launchFailureCode(namedError('Unsupported')), 'INSTANCE_UNAVAILABLE')
    })

    it('classifies account limit errors as QUOTA_EXCEEDED', () => {
        assert.equal(launchFailureCode(namedError('InstanceLimitExceeded')), 'QUOTA_EXCEEDED')
        assert.equal(launchFailureCode(namedError('VcpuLimitExceeded')), 'QUOTA_EXCEEDED')
    })

    it('classifies the volume initialization rate quota as QUOTA_EXCEEDED', () => {
        const error = new Error('You\'ve reached your quota for the cumulative volume initialization rate that you can request across simultaneous volume creation requests. To increase your quota, you can use Service Quotas.')
        assert.equal(launchFailureCode(error), 'QUOTA_EXCEEDED')
    })

    it('finds the code through a cause chain (wrapped errors)', () => {
        const wrapped = new Error('FailedToTagInstance: ...', {cause: namedError('InsufficientInstanceCapacity')})
        assert.equal(launchFailureCode(wrapped), 'INSTANCE_UNAVAILABLE')
    })

    it('returns null for unrelated errors', () => {
        assert.equal(launchFailureCode(new Error('boom')), null)
        assert.equal(launchFailureCode(namedError('UnauthorizedOperation')), null)
        assert.equal(launchFailureCode(null), null)
    })
})
