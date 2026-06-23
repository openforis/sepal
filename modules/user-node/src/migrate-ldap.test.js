import {decodeHash, reconcile} from './migrate-ldap.js'

describe('decodeHash', () => {
    test('returns a string value unchanged', () => {
        expect(decodeHash('{SSHA}abc')).toBe('{SSHA}abc')
    })
    test('decodes a Buffer to its utf8 string', () => {
        expect(decodeHash(Buffer.from('{SSHA}abc', 'utf8'))).toBe('{SSHA}abc')
    })
    test('returns null for missing/empty values', () => {
        expect(decodeHash(undefined)).toBeNull()
        expect(decodeHash(null)).toBeNull()
        expect(decodeHash('')).toBeNull()
    })
})

describe('reconcile', () => {
    test('partitions into matched, ldapOnly (skipped) and dbOnly (reported)', () => {
        const result = reconcile(['a', 'b', 'ghost'], ['a', 'b', 'orphan'])
        expect(result.matched.sort()).toEqual(['a', 'b'])
        expect(result.ldapOnly).toEqual(['ghost'])
        expect(result.dbOnly).toEqual(['orphan'])
    })
    test('matches case-insensitively (DB stores usernames lowercased)', () => {
        const result = reconcile(['sepalAdmin', 'Wiell'], ['sepaladmin', 'wiell'])
        expect(result.matched.sort()).toEqual(['Wiell', 'sepalAdmin'])
        expect(result.ldapOnly).toEqual([])
        expect(result.dbOnly).toEqual([])
    })
})
