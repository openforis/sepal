import {decodeHash, decodeSshPublicKeys, reconcile} from './migrate-ldap.js'

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

describe('decodeSshPublicKeys', () => {
    test('returns a single string value as a one-element list', () => {
        expect(decodeSshPublicKeys('ssh-rsa AAA user')).toEqual(['ssh-rsa AAA user'])
    })
    test('returns all values when the attribute is multi-valued', () => {
        expect(decodeSshPublicKeys(['ssh-rsa AAA a', 'ssh-ed25519 BBB b']))
            .toEqual(['ssh-rsa AAA a', 'ssh-ed25519 BBB b'])
    })
    test('returns an empty list for missing/empty values', () => {
        expect(decodeSshPublicKeys(undefined)).toEqual([])
        expect(decodeSshPublicKeys(null)).toEqual([])
        expect(decodeSshPublicKeys('')).toEqual([])
        expect(decodeSshPublicKeys([])).toEqual([])
        expect(decodeSshPublicKeys([''])).toEqual([])
    })
    test('decodes Buffer values to utf8 strings', () => {
        expect(decodeSshPublicKeys(Buffer.from('ssh-rsa AAA a', 'utf8'))).toEqual(['ssh-rsa AAA a'])
        expect(decodeSshPublicKeys([Buffer.from('ssh-rsa AAA a', 'utf8')])).toEqual(['ssh-rsa AAA a'])
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
