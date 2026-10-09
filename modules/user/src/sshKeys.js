import {createHash} from 'node:crypto'

const INVALID_KEY = 'INVALID_KEY'
const UNSUPPORTED_TYPE = 'UNSUPPORTED_TYPE'
const KEY_TOO_WEAK = 'KEY_TOO_WEAK'

const MIN_RSA_BITS = 2048
const MAX_NAME_LENGTH = 255

// One authorized_keys-style line: "<type> <base64> [comment]". Options written before the type
// (command="…", no-pty) leave a leading token that is not the blob's own type, so they are refused
// as an invalid key rather than stored.
export const parsePublicKey = line => {
    try {
        return parse(line)
    } catch (error) {
        if (error instanceof KeyError) {
            return {error: error.code}
        }
        throw error
    }
}

export const keyName = ({name, comment, type}) => {
    const given = typeof name === 'string' ? name.trim() : ''
    return (given || comment || `${type} key`).slice(0, MAX_NAME_LENGTH)
}

export const authorizedKeysLine = ({type, publicKey}) => `${type} ${publicKey}`

const parse = line => {
    const [type, base64, ...comment] = fieldsOf(line)
    const blob = decode(base64)
    const reader = new WireReader(blob)
    expectValid(reader.text() === type)
    const readKey = KEY_READERS[type]
    if (!readKey) {
        throw new KeyError(UNSUPPORTED_TYPE)
    }
    readKey(reader)
    reader.end()
    return {type, publicKey: blob.toString('base64'), comment: comment.join(' '), fingerprint: fingerprint(blob)}
}

const fieldsOf = line => {
    const trimmed = typeof line === 'string' ? line.trim() : ''
    expectValid(trimmed && !/[\r\n]/.test(trimmed))
    return trimmed.split(/[ \t]+/)
}

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

const decode = base64 => {
    expectValid(base64 && base64.length % 4 === 0 && BASE64.test(base64))
    return Buffer.from(base64, 'base64')
}

const fingerprint = blob =>
    `SHA256:${createHash('sha256').update(blob).digest('base64').replace(/=+$/, '')}`

const expectValid = condition => {
    if (!condition) {
        throw new KeyError(INVALID_KEY)
    }
}

class KeyError extends Error {
    constructor(code) {
        super(code)
        this.code = code
    }
}

// Reads the SSH wire format: each field is a uint32 length followed by that many bytes.
class WireReader {
    #buffer
    #offset = 0

    constructor(buffer) {
        this.#buffer = buffer
    }

    bytes() {
        const start = this.#offset + 4
        expectValid(start <= this.#buffer.length)
        const end = start + this.#buffer.readUInt32BE(this.#offset)
        expectValid(end <= this.#buffer.length)
        this.#offset = end
        return this.#buffer.subarray(start, end)
    }

    text() {
        return this.bytes().toString('latin1')
    }

    end() {
        expectValid(this.#offset === this.#buffer.length)
    }
}

const ED25519_KEY_LENGTH = 32
const CURVE_POINT_LENGTHS = {nistp256: 65, nistp384: 97, nistp521: 133}
const UNCOMPRESSED_POINT = 4

const readEd25519 = reader =>
    expectValid(reader.bytes().length === ED25519_KEY_LENGTH)

const readEcdsa = curve => reader => {
    expectValid(reader.text() === curve)
    const point = reader.bytes()
    expectValid(point.length === CURVE_POINT_LENGTHS[curve] && point[0] === UNCOMPRESSED_POINT)
}

// A security key's public key is its base key followed by the application it was registered for.
const withApplication = readKey => reader => {
    readKey(reader)
    reader.bytes()
}

const readRsa = reader => {
    reader.bytes() // public exponent
    if (bitLength(reader.bytes()) < MIN_RSA_BITS) {
        throw new KeyError(KEY_TOO_WEAK)
    }
}

// An mpint is big-endian with a zero byte in front when the top bit would otherwise read as a sign.
const bitLength = mpint => {
    const first = mpint.findIndex(byte => byte !== 0)
    return first < 0 ? 0 : (mpint.length - first - 1) * 8 + (32 - Math.clz32(mpint[first]))
}

const KEY_READERS = {
    'ssh-ed25519': readEd25519,
    'ecdsa-sha2-nistp256': readEcdsa('nistp256'),
    'ecdsa-sha2-nistp384': readEcdsa('nistp384'),
    'ecdsa-sha2-nistp521': readEcdsa('nistp521'),
    'sk-ssh-ed25519@openssh.com': withApplication(readEd25519),
    'sk-ecdsa-sha2-nistp256@openssh.com': withApplication(readEcdsa('nistp256')),
    'ssh-rsa': readRsa
}
