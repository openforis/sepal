import {decodeHash, idMismatches, reconcile} from './migrate-ldap.js'

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

describe('idMismatches', () => {
    const dbByLowerName = new Map([
        ['sepaladmin', {id: 10000, username: 'sepaladmin'}],
        ['lookap1', {id: 10006, username: 'lookap1'}]
    ])
    test('returns empty when every DB id equals its LDAP uidNumber (case-insensitive)', () => {
        const ldapUsers = [
            {username: 'sepalAdmin', uid: 10000},
            {username: 'lookap1', uid: 10006}
        ]
        expect(idMismatches(ldapUsers, dbByLowerName)).toEqual([])
    })
    test('reports users whose DB id differs from the on-disk uidNumber', () => {
        const ldapUsers = [
            {username: 'sepalAdmin', uid: 10000},
            {username: 'lookap1', uid: 99999}
        ]
        expect(idMismatches(ldapUsers, dbByLowerName)).toEqual([
            {username: 'lookap1', id: 10006, uid: 99999}
        ])
    })
    test('ignores LDAP users with no DB row', () => {
        const ldapUsers = [{username: 'ghost', uid: 12345}]
        expect(idMismatches(ldapUsers, dbByLowerName)).toEqual([])
    })
})
