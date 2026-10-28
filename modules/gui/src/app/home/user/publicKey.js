import {msg} from '~/translate'
import {FormField} from '~/widget/form/property'

// publicKeyField is the add-key form's field: a value that is pasted or read from a file, checked before it is sent.
export const publicKeyField = () =>
    new FormField()
        .predicate(value => typeof value === 'string' && value.trim() !== '', 'user.sshKeys.add.form.publicKey.required')
        .predicate(value => value !== privateKeyPlaceholder() && publicKeyProblem(value) !== 'PRIVATE_KEY', 'user.sshKeys.add.error.PRIVATE_KEY')
        .predicate(value => publicKeyProblem(value) !== 'KEY_TOO_WEAK', 'user.sshKeys.add.error.KEY_TOO_WEAK')
        .predicate(value => publicKeyProblem(value) !== 'UNSUPPORTED_TYPE', 'user.sshKeys.add.error.UNSUPPORTED_TYPE')
        .predicate(value => publicKeyProblem(value) !== 'INVALID_KEY', 'user.sshKeys.add.error.INVALID_KEY')

// hidePrivateKey keeps a private key, pasted or loaded by mistake, off the screen: the field gets a placeholder
// instead, which it refuses as a private key.
export const hidePrivateKey = text =>
    publicKeyProblem(text) === 'PRIVATE_KEY' ? privateKeyPlaceholder() : text

const privateKeyPlaceholder = () => msg('user.sshKeys.add.form.publicKey.privateKeyHidden')

// publicKeyProblem checks an SSH public key the way the user module will when it is added, so the form can say what
// is wrong before submitting: null when it is a key the user module accepts, otherwise the user module's refusal
// code, or PRIVATE_KEY for a private key. The user module stays the authority; keep the two in step
// (modules/user/src/sshKeys.js).

const MIN_RSA_BITS = 2048
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----|^PuTTY-User-Key-File-/m

export const publicKeyProblem = text => {
    if (typeof text !== 'string') {
        return 'INVALID_KEY'
    } else if (PRIVATE_KEY.test(text)) {
        return 'PRIVATE_KEY'
    }
    try {
        checkPublicKey(text)
        return null
    } catch (error) {
        if (error instanceof KeyError) {
            return error.code
        }
        throw error
    }
}

// One authorized_keys-style line: "<type> <base64> [comment]".
const checkPublicKey = text => {
    const trimmed = text.trim()
    expectValid(trimmed && !/[\r\n]/.test(trimmed))
    const [type, base64] = trimmed.split(/[ \t]+/)
    const reader = new WireReader(decode(base64))
    expectValid(reader.text() === type)
    const readKey = KEY_READERS[type]
    if (!readKey) {
        throw new KeyError('UNSUPPORTED_TYPE')
    }
    readKey(reader)
    reader.end()
}

const decode = base64 => {
    expectValid(base64 && base64.length % 4 === 0 && BASE64.test(base64))
    return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

const expectValid = condition => {
    if (!condition) {
        throw new KeyError('INVALID_KEY')
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
    #bytes
    #offset = 0

    constructor(bytes) {
        this.#bytes = bytes
    }

    bytes() {
        const start = this.#offset + 4
        expectValid(start <= this.#bytes.length)
        const end = start + new DataView(this.#bytes.buffer).getUint32(this.#offset)
        expectValid(end <= this.#bytes.length)
        this.#offset = end
        return this.#bytes.subarray(start, end)
    }

    text() {
        return String.fromCharCode(...this.bytes())
    }

    end() {
        expectValid(this.#offset === this.#bytes.length)
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
        throw new KeyError('KEY_TOO_WEAK')
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
