import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {callsOf, inSequence} from '#sepal/testSupport/mock'

import {createApiKeyRetryWrapper} from '../workerInstance/sandboxSessionApiKey.js'
import {State} from './workerSession.js'
import {createWorkerSessionApiKey} from './workerSessionApiKey.js'

describe('createWorkerSessionApiKey (single lookup, no internal retry)', () => {
    test('returns the api_key of a PENDING/ACTIVE session on the instance', async () => {
        const sessionOnInstance = mock.fn(async () => ({
            apiKey: 'the-key'
        }))
        const apiKey = createWorkerSessionApiKey({sessionOnInstance})
        assert.equal(await apiKey.apiKeyForInstance('i-1'), 'the-key')
        assert.equal(sessionOnInstance.mock.callCount(), 1)
        assert.deepEqual(callsOf(sessionOnInstance), [['i-1', [State.PENDING, State.ACTIVE]]])
    })

    test('returns null when no session exists on the instance', async () => {
        const sessionOnInstance = mock.fn(async () => null)
        const apiKey = createWorkerSessionApiKey({sessionOnInstance})
        assert.equal(await apiKey.apiKeyForInstance('i-none'), null)
    })

    test('does a SINGLE repo lookup — no internal retry (the 4b wrapper supplies the retry)', async () => {
        const sessionOnInstance = mock.fn(async () => null)
        const apiKey = createWorkerSessionApiKey({sessionOnInstance})
        await apiKey.apiKeyForInstance('i-1')
        assert.equal(sessionOnInstance.mock.callCount(), 1)
    })
})

describe('composed with the 4b createApiKeyRetryWrapper (5×50ms end-to-end)', () => {
    test('wrapper retries the single-lookup impl: null then value → resolves to the value', async () => {
        // First lookup misses (row not committed yet), second lookup finds the session.
        const sessionOnInstance = mock.fn(inSequence([async () => null, async () => ({
            apiKey: 'raced-key'
        })]))
        // delayMs=0 keeps the test fast; the composition (one lookup per attempt) is what matters.
        const wrapped = createApiKeyRetryWrapper(
            createWorkerSessionApiKey({sessionOnInstance}),
            {retries: 5, delayMs: 0}
        )
        assert.equal(await wrapped.apiKeyForInstance('i-1'), 'raced-key')
        // Exactly one lookup per attempt — no double-retry.
        assert.equal(sessionOnInstance.mock.callCount(), 2)
    })

    test('wrapper returns null after exhausting retries when the session never appears', async () => {
        const sessionOnInstance = mock.fn(async () => null)
        const wrapped = createApiKeyRetryWrapper(
            createWorkerSessionApiKey({sessionOnInstance}),
            {retries: 5, delayMs: 0}
        )
        assert.equal(await wrapped.apiKeyForInstance('i-1'), null)
        assert.equal(sessionOnInstance.mock.callCount(), 5)
    })
})
