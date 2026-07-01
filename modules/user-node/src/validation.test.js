import {isValidEmail, isValidUsername} from './validation.js'

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
})
