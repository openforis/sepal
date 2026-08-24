import {launchFailureCode} from './instanceLaunchErrors.js'

const namedError = name => Object.assign(new Error(name), {name})

describe('launchFailureCode', () => {
    it('classifies AZ capacity errors as INSTANCE_UNAVAILABLE', () => {
        expect(launchFailureCode(namedError('InsufficientInstanceCapacity'))).toBe('INSTANCE_UNAVAILABLE')
        expect(launchFailureCode(namedError('Unsupported'))).toBe('INSTANCE_UNAVAILABLE')
    })

    it('classifies account limit errors as QUOTA_EXCEEDED', () => {
        expect(launchFailureCode(namedError('InstanceLimitExceeded'))).toBe('QUOTA_EXCEEDED')
        expect(launchFailureCode(namedError('VcpuLimitExceeded'))).toBe('QUOTA_EXCEEDED')
    })

    it('finds the code through a cause chain (wrapped errors)', () => {
        const wrapped = new Error('FailedToTagInstance: ...', {cause: namedError('InsufficientInstanceCapacity')})
        expect(launchFailureCode(wrapped)).toBe('INSTANCE_UNAVAILABLE')
    })

    it('returns null for unrelated errors', () => {
        expect(launchFailureCode(new Error('boom'))).toBe(null)
        expect(launchFailureCode(namedError('UnauthorizedOperation'))).toBe(null)
        expect(launchFailureCode(null)).toBe(null)
    })
})
