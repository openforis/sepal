// Unit tests for the WorkerSession domain: state machine mutators, Timeout, ApiKeyGenerator.
// No database needed.

import {
    activate,
    close,
    createApiKeyGenerator,
    createWorkerSession,
    isActive,
    isClosed,
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
        expect(s.instance).toEqual({id: 'i-1', host: 'host-1'})
        expect(s.host).toBe('host-1')
    })

    test('predicates reflect state', () => {
        const s = baseSession()
        expect(isPending(s)).toBe(true)
        expect(isActive(s)).toBe(false)
        expect(isClosed(s)).toBe(false)
    })

    test('is immutable (frozen)', () => {
        const s = baseSession()
        expect(Object.isFrozen(s)).toBe(true)
        expect(Object.isFrozen(s.instance)).toBe(true)
    })
})

describe('mutators', () => {
    test('activate → ACTIVE, original unchanged, other fields preserved', () => {
        const s = baseSession()
        const a = activate(s)
        expect(a.state).toBe(State.ACTIVE)
        expect(isActive(a)).toBe(true)
        expect(s.state).toBe(State.PENDING)
        expect(a.id).toBe('s-1')
        expect(a.apiKey).toBe('secret-key')
        expect(a.instance).toEqual({id: 'i-1', host: 'host-1'})
    })

    test('close → CLOSED (domain does NOT null api_key; that is the repo update variant)', () => {
        const c = close(baseSession())
        expect(c.state).toBe(State.CLOSED)
        expect(isClosed(c)).toBe(true)
        expect(c.apiKey).toBe('secret-key')
    })

    test('withInstance replaces instance and host', () => {
        const s = withInstance(baseSession(), {id: 'i-2', host: 'host-2'})
        expect(s.instance).toEqual({id: 'i-2', host: 'host-2'})
        expect(s.host).toBe('host-2')
    })

    test('withApiKey sets the api key', () => {
        const s = withApiKey(baseSession(), 'new-key')
        expect(s.apiKey).toBe('new-key')
    })
})

describe('Timeout', () => {
    const TEN_MIN = 10 * 60 * 1000

    test('lastValidUpdate(now) = now - 10min', () => {
        const now = new Date('2026-01-01T12:00:00Z')
        expect(Timeout.PENDING.lastValidUpdate(now)).toEqual(new Date(now.getTime() - TEN_MIN))
    })

    test('get(now) = now - 10min', () => {
        const now = new Date('2026-01-01T12:00:00Z')
        expect(Timeout.PENDING.get(now)).toEqual(new Date(now.getTime() - TEN_MIN))
    })

    test('willTimeout(date) = date + 10min + 1ms', () => {
        const d = new Date('2026-01-01T12:00:00Z')
        expect(Timeout.PENDING.willTimeout(d)).toEqual(new Date(d.getTime() + TEN_MIN + 1))
    })

    // ACTIVE is deliberately absent: an ACTIVE session's lifetime is its stored timeout_time, and
    // a derived ACTIVE timeout left here would be a second, competing source of truth.
    test('has no ACTIVE timeout', () => {
        expect(Timeout.ACTIVE).toBeUndefined()
    })
})

describe('NotificationState', () => {
    test('defaults to NONE', () => {
        expect(baseSession().notificationState).toBe(NotificationState.NONE)
    })

    test('covers the whole expiry cycle', () => {
        expect(Object.keys(NotificationState)).toEqual(['NONE', 'NOTIFIED', 'DISMISSED', 'EMAILED'])
    })
})

describe('ApiKeyGenerator', () => {
    const gen = createApiKeyGenerator()

    test('produces URL-safe base64, no padding, of the expected length', () => {
        const key = gen.generate()
        // 32 bytes → 43 base64url chars (ceil(32*4/3) with no padding)
        expect(key).toHaveLength(43)
        expect(key).toMatch(/^[A-Za-z0-9_-]+$/)
        expect(key).not.toContain('=')
        expect(key).not.toContain('+')
        expect(key).not.toContain('/')
    })

    test('produces distinct keys', () => {
        const keys = new Set(Array.from({length: 50}, () => gen.generate()))
        expect(keys.size).toBe(50)
    })
})
