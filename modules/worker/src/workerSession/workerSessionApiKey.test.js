// Tests for the real SandboxSessionApiKey impl (createWorkerSessionApiKey) and its composition
// with the retry wrapper (createApiKeyRetryWrapper) — proving the seam works end-to-end
// without double-retry.

import {jest} from '@jest/globals'

import {createApiKeyRetryWrapper} from '../workerInstance/sandboxSessionApiKey.js'
import {State} from './workerSession.js'
import {createWorkerSessionApiKey} from './workerSessionApiKey.js'

describe('createWorkerSessionApiKey (single lookup, no internal retry)', () => {
    test('returns the api_key of a PENDING/ACTIVE session on the instance', async () => {
        const sessionOnInstance = jest.fn().mockResolvedValue({apiKey: 'the-key'})
        const apiKey = createWorkerSessionApiKey({sessionOnInstance})
        await expect(apiKey.apiKeyForInstance('i-1')).resolves.toBe('the-key')
        expect(sessionOnInstance).toHaveBeenCalledTimes(1)
        expect(sessionOnInstance).toHaveBeenCalledWith('i-1', [State.PENDING, State.ACTIVE])
    })

    test('returns null when no session exists on the instance', async () => {
        const sessionOnInstance = jest.fn().mockResolvedValue(null)
        const apiKey = createWorkerSessionApiKey({sessionOnInstance})
        await expect(apiKey.apiKeyForInstance('i-none')).resolves.toBeNull()
    })

    test('does a SINGLE repo lookup — no internal retry (the 4b wrapper supplies the retry)', async () => {
        const sessionOnInstance = jest.fn().mockResolvedValue(null)
        const apiKey = createWorkerSessionApiKey({sessionOnInstance})
        await apiKey.apiKeyForInstance('i-1')
        expect(sessionOnInstance).toHaveBeenCalledTimes(1)
    })
})

describe('composed with the 4b createApiKeyRetryWrapper (5×50ms end-to-end)', () => {
    test('wrapper retries the single-lookup impl: null then value → resolves to the value', async () => {
        // First lookup misses (row not committed yet), second lookup finds the session.
        const sessionOnInstance = jest.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({apiKey: 'raced-key'})
        // delayMs=0 keeps the test fast; the composition (one lookup per attempt) is what matters.
        const wrapped = createApiKeyRetryWrapper(
            createWorkerSessionApiKey({sessionOnInstance}),
            {retries: 5, delayMs: 0}
        )
        await expect(wrapped.apiKeyForInstance('i-1')).resolves.toBe('raced-key')
        // Exactly one lookup per attempt — no double-retry.
        expect(sessionOnInstance).toHaveBeenCalledTimes(2)
    })

    test('wrapper returns null after exhausting retries when the session never appears', async () => {
        const sessionOnInstance = jest.fn().mockResolvedValue(null)
        const wrapped = createApiKeyRetryWrapper(
            createWorkerSessionApiKey({sessionOnInstance}),
            {retries: 5, delayMs: 0}
        )
        await expect(wrapped.apiKeyForInstance('i-1')).resolves.toBeNull()
        expect(sessionOnInstance).toHaveBeenCalledTimes(5)
    })
})
