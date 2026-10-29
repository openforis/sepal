// Unit tests for the WorkerSession domain: state machine mutators, Timeout, ApiKeyGenerator.
// No database needed.

import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {
    close,
    createApiKeyGenerator,
    createWorkerSession,
    isActive,
    isPending,
    NotificationState,
    State,
    Timeout,
    withApiKey,
    withInstance,
} from './workerSession.js'

const baseSession = () => createWorkerSession({
    id: 's-1',
    state: State.PENDING,
    username: 'alice',
    workerType: 'SANDBOX',
    instanceType: 'T3aSmall',
    instance: {id: 'i-1', host: 'host-1'},
    creationTime: new Date('2026-01-01T00:00:00Z'),
    updateTime: new Date('2026-01-01T00:00:00Z'),
    apiKey: 'secret-key',
})

describe('createWorkerSession', () => {
    test('maps instance and mirrors instance.host into top-level host', () => {
        const s = baseSession()
        assert.deepEqual(s.instance, {id: 'i-1', host: 'host-1'})
        assert.equal(s.host, 'host-1')
    })

    test('predicates reflect state', () => {
        const s = baseSession()
        assert.equal(isPending(s), true)
        assert.equal(isActive(s), false)
    })

    test('is immutable (frozen)', () => {
        const s = baseSession()
        assert.equal(Object.isFrozen(s), true)
        assert.equal(Object.isFrozen(s.instance), true)
    })
})

describe('mutators', () => {
    test('close → CLOSED, original unchanged, other fields preserved', () => {
        const s = baseSession()
        const c = close(s)
        assert.equal(c.state, State.CLOSED)
        assert.equal(isActive(c), false)
        assert.equal(isPending(c), false)
        assert.equal(s.state, State.PENDING)
        assert.equal(c.id, 's-1')
        // The domain does NOT null api_key; that is the repository update's job.
        assert.equal(c.apiKey, 'secret-key')
        assert.deepEqual(c.instance, {id: 'i-1', host: 'host-1'})
    })

    test('withInstance replaces instance and host', () => {
        const s = withInstance(baseSession(), {id: 'i-2', host: 'host-2'})
        assert.deepEqual(s.instance, {id: 'i-2', host: 'host-2'})
        assert.equal(s.host, 'host-2')
    })

    test('withApiKey sets the api key', () => {
        const s = withApiKey(baseSession(), 'new-key')
        assert.equal(s.apiKey, 'new-key')
    })
})

describe('Timeout', () => {
    const TEN_MIN = 10 * 60 * 1000

    test('lastValidUpdate(now) = now - 10min', () => {
        const now = new Date('2026-01-01T12:00:00Z')
        assert.deepEqual(Timeout.PENDING.lastValidUpdate(now), new Date(now.getTime() - TEN_MIN))
    })

    // ACTIVE is deliberately absent: an ACTIVE session's lifetime is its stored timeout_time, and
    // a derived ACTIVE timeout left here would be a second, competing source of truth.
    test('has no ACTIVE timeout', () => {
        assert.equal(Timeout.ACTIVE, undefined)
    })
})

describe('NotificationState', () => {
    test('defaults to NONE', () => {
        assert.equal(baseSession().notificationState, NotificationState.NONE)
    })

    test('covers the whole expiry cycle', () => {
        assert.deepEqual(
            Object.keys(NotificationState),
            ['NONE', 'NOTIFIED', 'DISMISSED', 'EMAILED']
        )
    })
})

describe('ApiKeyGenerator', () => {
    const gen = createApiKeyGenerator()

    test('produces URL-safe base64, no padding, of the expected length', () => {
        const key = gen.generate()
        // 32 bytes → 43 base64url chars (ceil(32*4/3) with no padding)
        assert.equal(key.length, 43)
        assert.match(key, /^[A-Za-z0-9_-]+$/)
        assert.ok(!key.includes('='))
        assert.ok(!key.includes('+'))
        assert.ok(!key.includes('/'))
    })

    test('produces distinct keys', () => {
        const keys = new Set(Array.from({length: 50}, () => gen.generate()))
        assert.equal(keys.size, 50)
    })
})
