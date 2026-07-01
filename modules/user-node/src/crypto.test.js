import {hashPassword, needsRehash, verifyPassword} from './crypto.js'

// Real {SSHA} value for 'secret123' (sha1(pw+salt)+salt, salt=0xa1b2c3d4), base64-encoded.
const SSHA = '{SSHA}x6nFosdz0ToEJu8p72NWae7QdCWhssPU'
// Real {SHA} value for 'secret123' (sha1(pw), base64-encoded).
const SHA = '{SHA}8rFPaOuZX6yzocNSh7d41b14VRE='

test('verifies a correct password against an {SSHA} hash', () => {
    expect(verifyPassword('secret123', SSHA)).toBe(true)
})

test('rejects a wrong password against an {SSHA} hash', () => {
    expect(verifyPassword('wrong', SSHA)).toBe(false)
})

test('verifies a correct password against an {SHA} hash', () => {
    expect(verifyPassword('secret123', SHA)).toBe(true)
})

test('hashPassword produces a {SCRYPT} value that round-trips', () => {
    const hash = hashPassword('hunter2')
    expect(hash.startsWith('{SCRYPT}')).toBe(true)
    expect(verifyPassword('hunter2', hash)).toBe(true)
    expect(verifyPassword('nope', hash)).toBe(false)
})

test('hashPassword uses a fresh salt so identical passwords hash differently', () => {
    expect(hashPassword('hunter2')).not.toBe(hashPassword('hunter2'))
})

test('needsRehash flags legacy schemes and clears for current {SCRYPT}', () => {
    expect(needsRehash(SSHA)).toBe(true)
    expect(needsRehash(SHA)).toBe(true)
    expect(needsRehash('letmein')).toBe(true)
    expect(needsRehash('')).toBe(false)
    expect(needsRehash(null)).toBe(false)
    expect(needsRehash(hashPassword('hunter2'))).toBe(false)
})

test('throws on an unsupported scheme rather than silently failing', () => {
    expect(() => verifyPassword('x', '{ARGON2}whatever')).toThrow(/unsupported password scheme/i)
})

test('returns false for an empty/missing stored hash', () => {
    expect(verifyPassword('x', '')).toBe(false)
    expect(verifyPassword('x', null)).toBe(false)
})

test('rejects a wrong password against an {SHA} hash', () => {
    expect(verifyPassword('wrong', SHA)).toBe(false)
})

test('verifies and rejects an unprefixed (PLAIN) stored value', () => {
    expect(verifyPassword('letmein', 'letmein')).toBe(true)
    expect(verifyPassword('letmein', 'nope')).toBe(false)
})

test('throws on a hyphenated unknown scheme (e.g. {MD5-CRYPT})', () => {
    expect(() => verifyPassword('x', '{MD5-CRYPT}whatever')).toThrow(/unsupported password scheme/i)
})
