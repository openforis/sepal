import assert from 'node:assert/strict'
import {test} from 'node:test'

import {hashPassword, needsRehash, verifyPassword} from './crypto.js'

// Real {SSHA} value for 'secret123' (sha1(pw+salt)+salt, salt=0xa1b2c3d4), base64-encoded.
const SSHA = '{SSHA}x6nFosdz0ToEJu8p72NWae7QdCWhssPU'
// Real {SHA} value for 'secret123' (sha1(pw), base64-encoded).
const SHA = '{SHA}8rFPaOuZX6yzocNSh7d41b14VRE='

test('verifies a correct password against an {SSHA} hash', async () => {
    assert.equal(await verifyPassword('secret123', SSHA), true)
})

test('rejects a wrong password against an {SSHA} hash', async () => {
    assert.equal(await verifyPassword('wrong', SSHA), false)
})

test('verifies a correct password against an {SHA} hash', async () => {
    assert.equal(await verifyPassword('secret123', SHA), true)
})

test('hashPassword produces a {SCRYPT} value that round-trips', async () => {
    const hash = await hashPassword('hunter2')
    assert.equal(hash.startsWith('{SCRYPT}'), true)
    assert.equal(await verifyPassword('hunter2', hash), true)
    assert.equal(await verifyPassword('nope', hash), false)
})

test('hashPassword uses a fresh salt so identical passwords hash differently', async () => {
    assert.notEqual(await hashPassword('hunter2'), await hashPassword('hunter2'))
})

test('needsRehash flags legacy schemes and clears for current {SCRYPT}', async () => {
    assert.equal(needsRehash(SSHA), true)
    assert.equal(needsRehash(SHA), true)
    assert.equal(needsRehash('letmein'), true)
    assert.equal(needsRehash(''), false)
    assert.equal(needsRehash(null), false)
    assert.equal(needsRehash(await hashPassword('hunter2')), false)
})

test('throws on an unsupported scheme rather than silently failing', async () => {
    await assert.rejects(
        verifyPassword('x', '{ARGON2}whatever'),
        /unsupported password scheme/i
    )
})

test('returns false for an empty/missing stored hash', async () => {
    assert.equal(await verifyPassword('x', ''), false)
    assert.equal(await verifyPassword('x', null), false)
})

test('rejects a wrong password against an {SHA} hash', async () => {
    assert.equal(await verifyPassword('wrong', SHA), false)
})

test('verifies and rejects an unprefixed (PLAIN) stored value', async () => {
    assert.equal(await verifyPassword('letmein', 'letmein'), true)
    assert.equal(await verifyPassword('letmein', 'nope'), false)
})

test('throws on a hyphenated unknown scheme (e.g. {MD5-CRYPT})', async () => {
    await assert.rejects(
        verifyPassword('x', '{MD5-CRYPT}whatever'),
        /unsupported password scheme/i
    )
})
