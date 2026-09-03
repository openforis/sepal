import {generateToken, getOrGenerateToken, isExpired, TOKEN_MAX_AGE_MS} from './tokens.js'

test('generateToken returns a unique uuid-shaped string', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(a).not.toBe(b)
})

test('isExpired is false for a fresh token and true past the max age', () => {
    const now = 10 * TOKEN_MAX_AGE_MS
    expect(isExpired(now, now)).toBe(false)
    expect(isExpired(now - TOKEN_MAX_AGE_MS + 1000, now)).toBe(false)
    expect(isExpired(now - TOKEN_MAX_AGE_MS - 1000, now)).toBe(true)
})

test('isExpired treats a null/absent generation time as expired', () => {
    expect(isExpired(null, 123)).toBe(true)
    expect(isExpired(undefined, 123)).toBe(true)
})

describe('getOrGenerateToken', () => {
    const now = 1_000_000_000_000

    it('reuses an existing, unexpired token', () => {
        const user = {token: 'existing-token', tokenGenerationTime: now - 1000}
        expect(getOrGenerateToken(user, now)).toBe('existing-token')
    })

    it('generates a new token when the current one is expired', () => {
        const user = {token: 'old-token', tokenGenerationTime: now - TOKEN_MAX_AGE_MS - 1}
        const token = getOrGenerateToken(user, now)
        expect(token).not.toBe('old-token')
        expect(token).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('generates a new token when there is no current token', () => {
        expect(getOrGenerateToken({token: null, tokenGenerationTime: null}, now))
            .toMatch(/^[0-9a-f-]{36}$/)
    })

    it('is consistent with isExpired at the boundary', () => {
        const user = {token: 't', tokenGenerationTime: now - TOKEN_MAX_AGE_MS}
        expect(isExpired(user.tokenGenerationTime, now)).toBe(false)
        expect(getOrGenerateToken(user, now)).toBe('t')
    })
})
