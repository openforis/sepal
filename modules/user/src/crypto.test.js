import assert from 'node:assert/strict'
import {test} from 'node:test'

import {hashPassword, needsRehash, verifyPassword} from './crypto.js'

// Real {SSHA} value for 'secret123' (sha1(pw+salt)+salt, salt=0xa1b2c3d4), base64-encoded.
const SSHA = '{SSHA}x6nFosdz0ToEJu8p72NWae7QdCWhssPU'
// Real {SHA} value for 'secret123' (sha1(pw), base64-encoded).
const SHA = '{SHA}8rFPaOuZX6yzocNSh7d41b14VRE='

test('verifies a correct password against an {SSHA} hash', () => {
    assert.equal(verifyPassword('secret123', SSHA), true)
})

test('rejects a wrong password against an {SSHA} hash', () => {
    assert.equal(verifyPassword('wrong', SSHA), false)
})

test('verifies a correct password against an {SHA} hash', () => {
    assert.equal(verifyPassword('secret123', SHA), true)
})

test('hashPassword produces a {SCRYPT} value that round-trips', () => {
    const hash = hashPassword('hunter2')
    assert.equal(hash.startsWith('{SCRYPT}'), true)
    assert.equal(verifyPassword('hunter2', hash), true)
    assert.equal(verifyPassword('nope', hash), false)
})

test('hashPassword uses a fresh salt so identical passwords hash differently', () => {
    assert.notEqual(hashPassword('hunter2'), hashPassword('hunter2'))
})

test('needsRehash flags legacy schemes and clears for current {SCRYPT}', () => {
    assert.equal(needsRehash(SSHA), true)
    assert.equal(needsRehash(SHA), true)
    assert.equal(needsRehash('letmein'), true)
    assert.equal(needsRehash(''), false)
    assert.equal(needsRehash(null), false)
    assert.equal(needsRehash(hashPassword('hunter2')), false)
})

test('throws on an unsupported scheme rather than silently failing', () => {
    assert.throws(
        () => verifyPassword('x', '{ARGON2}whatever'),
        /unsupported password scheme/i
    )
})

test('returns false for an empty/missing stored hash', () => {
    assert.equal(verifyPassword('x', ''), false)
    assert.equal(verifyPassword('x', null), false)
})

test('rejects a wrong password against an {SHA} hash', () => {
    assert.equal(verifyPassword('wrong', SHA), false)
})

test('verifies and rejects an unprefixed (PLAIN) stored value', () => {
    assert.equal(verifyPassword('letmein', 'letmein'), true)
    assert.equal(verifyPassword('letmein', 'nope'), false)
})

test('throws on a hyphenated unknown scheme (e.g. {MD5-CRYPT})', () => {
    assert.throws(
        () => verifyPassword('x', '{MD5-CRYPT}whatever'),
        /unsupported password scheme/i
    )
})
