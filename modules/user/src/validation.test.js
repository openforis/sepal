import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {EMAIL_MAX_LENGTH, isValidEmail, isValidUsername, USERNAME_MAX_LENGTH} from './validation.js'

describe('isValidUsername', () => {
    test('accepts a well-formed username', () => {
        assert.equal(isValidUsername('lookap1'), true)
        assert.equal(isValidUsername('_svc'), true)
    })
    test('rejects bad formats', () => {
        assert.equal(isValidUsername('1leading'), false)
        assert.equal(isValidUsername('has space'), false)
        assert.equal(isValidUsername('a'.repeat(31)), false)
        assert.equal(isValidUsername(''), false)
        assert.equal(isValidUsername('user-name'), false)
    })
    // varchar(32) in the schema; the regex is the only thing keeping writes inside it.
    test('enforces the maximum length', () => {
        assert.equal(isValidUsername('a'.repeat(USERNAME_MAX_LENGTH)), true)
        assert.equal(isValidUsername('a'.repeat(USERNAME_MAX_LENGTH + 1)), false)
    })
    test('rejects blacklisted system names', () => {
        assert.equal(isValidUsername('root'), false)
        assert.equal(isValidUsername('node'), false)
        assert.equal(isValidUsername('www-data'), false)
    })
})

describe('isValidEmail', () => {
    test('accepts valid emails', () => {
        assert.equal(isValidEmail('a@b.org'), true)
        assert.equal(isValidEmail('first.last@sub.example.com'), true)
    })
    test('rejects invalid emails', () => {
        assert.equal(isValidEmail('nope'), false)
        assert.equal(isValidEmail('a@b'), false)
        assert.equal(isValidEmail(''), false)
    })
    // The column is varchar(255) under STRICT_TRANS_TABLES, so an over-long address must be
    // rejected here rather than becoming a 500 at insert time.
    test('enforces the RFC 5321 maximum length', () => {
        const domain = '@example.com'
        const atLimit = 'a'.repeat(EMAIL_MAX_LENGTH - domain.length) + domain
        assert.equal(atLimit.length, EMAIL_MAX_LENGTH)
        assert.equal(isValidEmail(atLimit), true)
        assert.equal(isValidEmail('a' + atLimit), false)
    })
})
