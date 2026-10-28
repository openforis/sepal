import assert from 'node:assert/strict'
import {describe, it, test} from 'node:test'

import {generateToken, getOrGenerateToken, isExpired, TOKEN_MAX_AGE_MS} from './tokens.js'

test('generateToken returns a unique uuid-shaped string', () => {
    const a = generateToken()
    const b = generateToken()
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    assert.notEqual(a, b)
})

test('isExpired is false for a fresh token and true past the max age', () => {
    const now = 10 * TOKEN_MAX_AGE_MS
    assert.equal(isExpired(now, now), false)
    assert.equal(isExpired(now - TOKEN_MAX_AGE_MS + 1000, now), false)
    assert.equal(isExpired(now - TOKEN_MAX_AGE_MS - 1000, now), true)
})

test('isExpired treats a null/absent generation time as expired', () => {
    assert.equal(isExpired(null, 123), true)
    assert.equal(isExpired(undefined, 123), true)
})

describe('getOrGenerateToken', () => {
    const now = 1_000_000_000_000

    it('reuses an existing, unexpired token', () => {
        const user = {token: 'existing-token', tokenGenerationTime: now - 1000}
        assert.equal(getOrGenerateToken(user, now), 'existing-token')
    })

    it('generates a new token when the current one is expired', () => {
        const user = {token: 'old-token', tokenGenerationTime: now - TOKEN_MAX_AGE_MS - 1}
        const token = getOrGenerateToken(user, now)
        assert.notEqual(token, 'old-token')
        assert.match(token, /^[0-9a-f-]{36}$/)
    })

    it('generates a new token when there is no current token', () => {
        assert.match(
            getOrGenerateToken({token: null, tokenGenerationTime: null}, now),
            /^[0-9a-f-]{36}$/
        )
    })

    it('is consistent with isExpired at the boundary', () => {
        const user = {token: 't', tokenGenerationTime: now - TOKEN_MAX_AGE_MS}
        assert.equal(isExpired(user.tokenGenerationTime, now), false)
        assert.equal(getOrGenerateToken(user, now), 't')
    })
})
