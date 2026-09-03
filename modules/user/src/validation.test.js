import {EMAIL_MAX_LENGTH, isValidEmail, isValidUsername, USERNAME_MAX_LENGTH} from './validation.js'

describe('isValidUsername', () => {
    test('accepts a well-formed username', () => {
        expect(isValidUsername('lookap1')).toBe(true)
        expect(isValidUsername('_svc')).toBe(true)
    })
    test('rejects bad formats', () => {
        expect(isValidUsername('1leading')).toBe(false)
        expect(isValidUsername('has space')).toBe(false)
        expect(isValidUsername('a'.repeat(31))).toBe(false)
        expect(isValidUsername('')).toBe(false)
        expect(isValidUsername('user-name')).toBe(false)
    })
    // varchar(32) in the schema; the regex is the only thing keeping writes inside it.
    test('enforces the maximum length', () => {
        expect(isValidUsername('a'.repeat(USERNAME_MAX_LENGTH))).toBe(true)
        expect(isValidUsername('a'.repeat(USERNAME_MAX_LENGTH + 1))).toBe(false)
    })
    test('rejects blacklisted system names', () => {
        expect(isValidUsername('root')).toBe(false)
        expect(isValidUsername('node')).toBe(false)
        expect(isValidUsername('www-data')).toBe(false)
    })
})

describe('isValidEmail', () => {
    test('accepts valid emails', () => {
        expect(isValidEmail('a@b.org')).toBe(true)
        expect(isValidEmail('first.last@sub.example.com')).toBe(true)
    })
    test('rejects invalid emails', () => {
        expect(isValidEmail('nope')).toBe(false)
        expect(isValidEmail('a@b')).toBe(false)
        expect(isValidEmail('')).toBe(false)
    })
    // The column is varchar(255) under STRICT_TRANS_TABLES, so an over-long address must be
    // rejected here rather than becoming a 500 at insert time.
    test('enforces the RFC 5321 maximum length', () => {
        const domain = '@example.com'
        const atLimit = 'a'.repeat(EMAIL_MAX_LENGTH - domain.length) + domain
        expect(atLimit).toHaveLength(EMAIL_MAX_LENGTH)
        expect(isValidEmail(atLimit)).toBe(true)
        expect(isValidEmail('a' + atLimit)).toBe(false)
    })
})
