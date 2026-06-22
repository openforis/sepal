import crypto from 'crypto'

const SHA1_DIGEST_BYTES = 20
const SSHA_SALT_BYTES = 4

// scrypt parameters for newly hashed passwords. N must be a power of 2; these
// give a memory-hard (~16MB, 128*N*r) hash that is the modern replacement for
// the legacy {SSHA} scheme. Stored in the hash so future tuning stays verifiable.
const SCRYPT_SCHEME = 'SCRYPT'
const SCRYPT_N = 16384
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_SALT_BYTES = 16
const SCRYPT_KEY_BYTES = 64
// 128 * N * r, plus headroom, so verification of stored params never hits the limit.
const SCRYPT_MAXMEM = 64 * 1024 * 1024

// Scheme names may contain hyphens (e.g. {MD5-CRYPT}); capture them so unknown
// schemes hit the throw below rather than silently degrading to PLAIN.
const parseScheme = stored => {
    const match = /^\{([\w-]+)\}(.*)$/.exec(stored)
    return match
        ? {scheme: match[1].toUpperCase(), value: match[2]}
        : {scheme: 'PLAIN', value: stored}
}

const sha1 = (...buffers) => {
    const hash = crypto.createHash('sha1')
    buffers.forEach(buffer => hash.update(buffer))
    return hash.digest()
}

const safeEqual = (a, b) =>
    a.length === b.length && crypto.timingSafeEqual(a, b)

const verifySSHA = (plain, value) => {
    const decoded = Buffer.from(value, 'base64')
    const digest = decoded.subarray(0, SHA1_DIGEST_BYTES)
    const salt = decoded.subarray(SHA1_DIGEST_BYTES)
    return safeEqual(digest, sha1(Buffer.from(plain), salt))
}

const verifySHA = (plain, value) =>
    safeEqual(Buffer.from(value, 'base64'), sha1(Buffer.from(plain)))

const scryptKey = (plain, salt, n, r, p, keyLength) =>
    crypto.scryptSync(Buffer.from(plain), salt, keyLength, {N: n, r, p, maxmem: SCRYPT_MAXMEM})

// {SCRYPT}N$r$p$saltBase64$keyBase64
const verifyScrypt = (plain, value) => {
    const [n, r, p, saltBase64, keyBase64] = value.split('$')
    const salt = Buffer.from(saltBase64, 'base64')
    const expected = Buffer.from(keyBase64, 'base64')
    const actual = scryptKey(plain, salt, Number(n), Number(r), Number(p), expected.length)
    return safeEqual(expected, actual)
}

const verifyPassword = (plain, stored) => {
    if (!stored) {
        return false
    }
    const {scheme, value} = parseScheme(stored)
    switch (scheme) {
        case SCRYPT_SCHEME:
            return verifyScrypt(plain, value)
        case 'SSHA':
            return verifySSHA(plain, value)
        case 'SHA':
            return verifySHA(plain, value)
        case 'PLAIN':
            return safeEqual(Buffer.from(plain), Buffer.from(value))
        default:
            throw new Error(`Unsupported password scheme: {${scheme}}`)
    }
}

// Produces a memory-hard {SCRYPT} hash for newly set passwords. Legacy {SSHA}/{SHA}
// hashes migrated from LDAP remain verifiable (see verifyPassword) and should be
// upgraded to {SCRYPT} on the next successful login via needsRehash.
const hashPassword = plain => {
    const salt = crypto.randomBytes(SCRYPT_SALT_BYTES)
    const key = scryptKey(plain, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_KEY_BYTES)
    const params = [SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), key.toString('base64')].join('$')
    return `{${SCRYPT_SCHEME}}${params}`
}

// True when a stored hash uses a legacy/weaker scheme and should be re-hashed with
// the current {SCRYPT} parameters after a successful verifyPassword.
const needsRehash = stored => {
    if (!stored) {
        return false
    }
    const {scheme, value} = parseScheme(stored)
    if (scheme !== SCRYPT_SCHEME) {
        return true
    }
    const [n, r, p] = value.split('$')
    return Number(n) !== SCRYPT_N || Number(r) !== SCRYPT_R || Number(p) !== SCRYPT_P
}

export {hashPassword, verifyPassword, needsRehash}
