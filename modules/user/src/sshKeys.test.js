import {authorizedKeysLine, keyName, parsePublicKey} from './sshKeys.js'

// Above the specifications, not below: test.each tables are built while the suite is collected.

// Encodes SSH wire-format strings (uint32 length + bytes) into a base64 key blob.
const wire = (...fields) => Buffer.concat(fields.map(field => {
    const bytes = Buffer.isBuffer(field) ? field : Buffer.from(field)
    const length = Buffer.alloc(4)
    length.writeUInt32BE(bytes.length)
    return Buffer.concat([length, bytes])
})).toString('base64')

// An uncompressed elliptic-curve point of the given encoded length.
const point = length => Buffer.concat([Buffer.from([4]), Buffer.alloc(length - 1, 7)])

// Real keys from ssh-keygen; fingerprints from `ssh-keygen -lf`.
const ED25519 = {
    base64: 'AAAAC3NzaC1lZDI1NTE5AAAAIFTTtG0hPe95rIxeTXi4nSx4CHf59bz6WQ6e8K0fhOWn',
    fingerprint: 'SHA256:UU+gcLVF9cusf1SG79CcIIz41VI08llkOadj4V5fyTM'
}
const ECDSA_384 = {
    base64: 'AAAAE2VjZHNhLXNoYTItbmlzdHAzODQAAAAIbmlzdHAzODQAAABhBEe9JVpP+QGL1AjbCnM7HFKe90DIn57fSPSng1RZyen9+3UajrX7ZiU5+9gMDeFRKKbjT2L0/Dd5VER6JE5EYoiN1h5Xxqr31e/M0RZLIzIIMtrPw145Qvv4LQ/ZUjF7HQ==',
    fingerprint: 'SHA256:HPTSmS5Kt/TUQtnbR8xIDYXvhI7B43k1bwz/ZuLSTCU'
}
const RSA_2048 = {
    base64: 'AAAAB3NzaC1yc2EAAAADAQABAAABAQCiNogmTvLOnoGqwL9ZlwfE29a8CPJBk7NUkiEbq2tofq1R977xJdkL5096GF9eusjAjCwpydo+kHAL5aI60zAlB9hSjbKQ6//brjTfvoDyzUrYlDZYcdt9fkUvbCl9s3F/+/HMq36P+8KRnE6gKWel+o6Xdu6FWKjA4EwbvJCCeGL90MBAEROv04PZwVogwWd+lZajSb2Kbpj1XVaRUgZogrTJu5jduZYis168nTjggyxgRS1XC/inhGteG5LQnRI3E3/ICW00t6rSl70A9TFj7hkLE6lzYgUyEQWmF96IL4XY0v6DSUjHV+0v5bSnNTYKJXBmBWM4r7ok6PshiYQX',
    fingerprint: 'SHA256:3DN3OCcz8VS9cEfGYK/3PCXbqAQv3c62ZZDZ47EJ01U'
}
const RSA_1024 = {
    base64: 'AAAAB3NzaC1yc2EAAAADAQABAAAAgQDMIrlU2XE6soRR2LipxSoJg7gmM8K5vXD3jf4Ppdgivdnw+dOuSxVo+hfNWRFTs7QXs/qrvBWTwx7i5zmY1fi6YmE7FYMaLJjs0FDIideMyzp1qLgx8gqlMwOed/EM7bBIwGtVYG/K1bvi+vNzyyYDkWcEpziQyFSnNaZQ1rmb6Q=='
}

describe('parsePublicKey', () => {
    test('accepts an ed25519 key with its comment and fingerprints it as ssh-keygen does', () => {
        const parsed = parsePublicKey(`ssh-ed25519 ${ED25519.base64} alice@laptop`)

        expect(parsed).toEqual({
            type: 'ssh-ed25519', publicKey: ED25519.base64, comment: 'alice@laptop', fingerprint: ED25519.fingerprint
        })
    })

    test('accepts an ecdsa key and fingerprints it as ssh-keygen does', () => {
        const parsed = parsePublicKey(`ecdsa-sha2-nistp384 ${ECDSA_384.base64}`)

        expect(parsed).toMatchObject({type: 'ecdsa-sha2-nistp384', comment: '', fingerprint: ECDSA_384.fingerprint})
    })

    test('accepts a 2048-bit rsa key', () => {
        const parsed = parsePublicKey(`ssh-rsa ${RSA_2048.base64} laptop`)

        expect(parsed).toMatchObject({type: 'ssh-rsa', fingerprint: RSA_2048.fingerprint})
    })

    test.each([
        ['ecdsa-sha2-nistp256', wire('ecdsa-sha2-nistp256', 'nistp256', point(65))],
        ['ecdsa-sha2-nistp521', wire('ecdsa-sha2-nistp521', 'nistp521', point(133))],
        ['sk-ssh-ed25519@openssh.com', wire('sk-ssh-ed25519@openssh.com', Buffer.alloc(32, 1), 'ssh:')],
        ['sk-ecdsa-sha2-nistp256@openssh.com', wire('sk-ecdsa-sha2-nistp256@openssh.com', 'nistp256', point(65), 'ssh:')]
    ])('accepts a %s key', (type, base64) => {
        const parsed = parsePublicKey(`${type} ${base64}`)

        expect(parsed).toMatchObject({type, publicKey: base64})
    })

    test('accepts a line pasted with surrounding blanks and a Windows line ending', () => {
        const parsed = parsePublicKey(`  ssh-ed25519 ${ED25519.base64} alice@laptop\r\n`)

        expect(parsed).toMatchObject({type: 'ssh-ed25519', comment: 'alice@laptop'})
    })

    test('refuses an rsa key under 2048 bits as too weak', () => {
        expect(parsePublicKey(`ssh-rsa ${RSA_1024.base64}`)).toEqual({error: 'KEY_TOO_WEAK'})
    })

    test('refuses a well-formed key of a type it does not accept', () => {
        const dsa = wire('ssh-dss', Buffer.alloc(128, 1), Buffer.alloc(20, 1), Buffer.alloc(128, 1), Buffer.alloc(128, 1))

        expect(parsePublicKey(`ssh-dss ${dsa}`)).toEqual({error: 'UNSUPPORTED_TYPE'})
    })

    test.each([
        ['options before the key', `command="/bin/sh" ssh-ed25519 ${ED25519.base64}`],
        ['a bare option before the key', `no-pty ssh-ed25519 ${ED25519.base64}`],
        ['a type that differs from the blob', `ssh-rsa ${ED25519.base64}`],
        ['trailing bytes after the key', `ssh-ed25519 ${wire('ssh-ed25519', Buffer.alloc(32, 1), 'extra')}`],
        ['a truncated blob', `ssh-ed25519 ${wire('ssh-ed25519', Buffer.alloc(31, 1))}`],
        ['a length running past the blob', `ssh-ed25519 ${Buffer.from([0, 0, 0, 99, 1]).toString('base64')}`],
        ['an ecdsa key on another curve than its type names', `ecdsa-sha2-nistp256 ${wire('ecdsa-sha2-nistp256', 'nistp384', point(97))}`],
        ['text that is not base64', 'ssh-ed25519 not-base64!'],
        ['a type without a key', 'ssh-ed25519'],
        ['two keys pasted together', `ssh-ed25519 ${ED25519.base64} a\nssh-ed25519 ${ED25519.base64} b`],
        ['a private key', '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----'],
        ['an empty value', '   '],
        ['a value that is not a string', ['ssh-ed25519']]
    ])('refuses %s as an invalid key', (_description, line) => {
        expect(parsePublicKey(line)).toEqual({error: 'INVALID_KEY'})
    })
})

describe('keyName', () => {
    test('uses the given name, trimmed', () => {
        expect(keyName({name: '  Laptop  ', comment: 'alice@laptop', type: 'ssh-ed25519'})).toBe('Laptop')
    })

    test('falls back to the key comment when no name is given', () => {
        expect(keyName({name: ' ', comment: 'alice@laptop', type: 'ssh-ed25519'})).toBe('alice@laptop')
    })

    test('falls back to the key type when there is neither name nor comment', () => {
        expect(keyName({name: undefined, comment: '', type: 'ssh-ed25519'})).toBe('ssh-ed25519 key')
    })

    test('truncates a name to 255 characters', () => {
        expect(keyName({name: 'x'.repeat(300), comment: '', type: 'ssh-ed25519'})).toHaveLength(255)
    })
})

describe('authorizedKeysLine', () => {
    test('is the type and the key, nothing else', () => {
        expect(authorizedKeysLine({type: 'ssh-ed25519', publicKey: ED25519.base64, name: 'x', comment: 'y'}))
            .toBe(`ssh-ed25519 ${ED25519.base64}`)
    })
})
