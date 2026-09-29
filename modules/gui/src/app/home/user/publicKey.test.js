import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))

const {hidePrivateKey, publicKeyField, publicKeyProblem} = await import('./publicKey')

// Above the specifications, not below: it.each tables are built while the suite is collected.

// Encodes SSH wire-format strings (uint32 length + bytes) into a base64 key blob.
const wire = (...fields) => {
    const bytes = fields.flatMap(field => {
        const value = typeof field === 'string' ? [...new TextEncoder().encode(field)] : field
        const length = value.length
        return [length >>> 24, (length >>> 16) & 255, (length >>> 8) & 255, length & 255, ...value]
    })
    return btoa(String.fromCharCode(...bytes))
}

const filled = (length, byte) => Array(length).fill(byte)

// An uncompressed elliptic-curve point of the given encoded length.
const point = length => [4, ...filled(length - 1, 7)]

// Real keys from ssh-keygen.
const ED25519 = 'AAAAC3NzaC1lZDI1NTE5AAAAIFTTtG0hPe95rIxeTXi4nSx4CHf59bz6WQ6e8K0fhOWn'
const ECDSA_384 = 'AAAAE2VjZHNhLXNoYTItbmlzdHAzODQAAAAIbmlzdHAzODQAAABhBEe9JVpP+QGL1AjbCnM7HFKe90DIn57fSPSng1RZyen9+3UajrX7ZiU5+9gMDeFRKKbjT2L0/Dd5VER6JE5EYoiN1h5Xxqr31e/M0RZLIzIIMtrPw145Qvv4LQ/ZUjF7HQ=='
const RSA_2048 = 'AAAAB3NzaC1yc2EAAAADAQABAAABAQCiNogmTvLOnoGqwL9ZlwfE29a8CPJBk7NUkiEbq2tofq1R977xJdkL5096GF9eusjAjCwpydo+kHAL5aI60zAlB9hSjbKQ6//brjTfvoDyzUrYlDZYcdt9fkUvbCl9s3F/+/HMq36P+8KRnE6gKWel+o6Xdu6FWKjA4EwbvJCCeGL90MBAEROv04PZwVogwWd+lZajSb2Kbpj1XVaRUgZogrTJu5jduZYis168nTjggyxgRS1XC/inhGteG5LQnRI3E3/ICW00t6rSl70A9TFj7hkLE6lzYgUyEQWmF96IL4XY0v6DSUjHV+0v5bSnNTYKJXBmBWM4r7ok6PshiYQX'
const RSA_1024 = 'AAAAB3NzaC1yc2EAAAADAQABAAAAgQDMIrlU2XE6soRR2LipxSoJg7gmM8K5vXD3jf4Ppdgivdnw+dOuSxVo+hfNWRFTs7QXs/qrvBWTwx7i5zmY1fi6YmE7FYMaLJjs0FDIideMyzp1qLgx8gqlMwOed/EM7bBIwGtVYG/K1bvi+vNzyyYDkWcEpziQyFSnNaZQ1rmb6Q=='

describe('publicKeyProblem', () => {
    it.each([
        ['an ed25519 key with its comment', `ssh-ed25519 ${ED25519} alice@laptop`],
        ['an ecdsa key', `ecdsa-sha2-nistp384 ${ECDSA_384}`],
        ['a 2048-bit rsa key', `ssh-rsa ${RSA_2048} laptop`],
        ['an ecdsa-sha2-nistp256 key', `ecdsa-sha2-nistp256 ${wire('ecdsa-sha2-nistp256', 'nistp256', point(65))}`],
        ['an ecdsa-sha2-nistp521 key', `ecdsa-sha2-nistp521 ${wire('ecdsa-sha2-nistp521', 'nistp521', point(133))}`],
        ['a security key', `sk-ssh-ed25519@openssh.com ${wire('sk-ssh-ed25519@openssh.com', filled(32, 1), 'ssh:')}`],
        ['an ecdsa security key', `sk-ecdsa-sha2-nistp256@openssh.com ${wire('sk-ecdsa-sha2-nistp256@openssh.com', 'nistp256', point(65), 'ssh:')}`],
        ['the contents of a .pub file, blanks and line ending included', `  ssh-ed25519 ${ED25519} alice@laptop\r\n`]
    ])('finds nothing wrong with %s', (_description, text) => {
        expect(publicKeyProblem(text)).toBeNull()
    })

    it.each([
        ['an OpenSSH private key', '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n'],
        ['a PEM private key', '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----'],
        ['a PuTTY private key', 'PuTTY-User-Key-File-3: ssh-ed25519\nEncryption: none\nComment: alice\n']
    ])('recognises %s', (_description, text) => {
        expect(publicKeyProblem(text)).toBe('PRIVATE_KEY')
    })

    it('refuses an rsa key under 2048 bits as too weak', () => {
        expect(publicKeyProblem(`ssh-rsa ${RSA_1024}`)).toBe('KEY_TOO_WEAK')
    })

    it('refuses a well-formed key of a type SEPAL does not accept', () => {
        const dsa = wire('ssh-dss', filled(128, 1), filled(20, 1), filled(128, 1), filled(128, 1))

        expect(publicKeyProblem(`ssh-dss ${dsa}`)).toBe('UNSUPPORTED_TYPE')
    })

    it.each([
        ['options before the key', `command="/bin/sh" ssh-ed25519 ${ED25519}`],
        ['a type that differs from the key', `ssh-rsa ${ED25519}`],
        ['trailing bytes after the key', `ssh-ed25519 ${wire('ssh-ed25519', filled(32, 1), 'extra')}`],
        ['a truncated key', `ssh-ed25519 ${wire('ssh-ed25519', filled(31, 1))}`],
        ['a length running past the key', `ssh-ed25519 ${btoa(String.fromCharCode(0, 0, 0, 99, 1))}`],
        ['an ecdsa key on another curve than its type names', `ecdsa-sha2-nistp256 ${wire('ecdsa-sha2-nistp256', 'nistp384', point(97))}`],
        ['text that is not base64', 'ssh-ed25519 not-base64!'],
        ['a type without a key', 'ssh-ed25519'],
        ['two keys pasted together', `ssh-ed25519 ${ED25519} a\nssh-ed25519 ${ED25519} b`],
        ['a key in the SSH2 format some tools export', `---- BEGIN SSH2 PUBLIC KEY ----\n${ED25519}\n---- END SSH2 PUBLIC KEY ----`],
        ['arbitrary text', 'hello world']
    ])('refuses %s as not a public key', (_description, text) => {
        expect(publicKeyProblem(text)).toBe('INVALID_KEY')
    })
})

// The add-key form's field: what it says about a value, pasted or read from a file, before it is submitted.
describe('the public key field', () => {
    it.each([
        ['nothing', '  ', 'user.sshKeys.add.form.publicKey.required'],
        ['a private key', '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----', 'user.sshKeys.add.error.PRIVATE_KEY'],
        ['arbitrary text', 'hello world', 'user.sshKeys.add.error.INVALID_KEY'],
        ['a weak rsa key', `ssh-rsa ${RSA_1024}`, 'user.sshKeys.add.error.KEY_TOO_WEAK'],
        ['a key of another type', `ssh-dss ${wire('ssh-dss', filled(128, 1), filled(20, 1), filled(128, 1), filled(128, 1))}`, 'user.sshKeys.add.error.UNSUPPORTED_TYPE'],
        ['a public key', `ssh-ed25519 ${ED25519} alice@laptop`, '']
    ])('answers %s', (_description, publicKey, message) => {
        expect(publicKeyField().check('publicKey', {publicKey})).toBe(message)
    })
})

// A private key pasted or loaded by mistake is not left on screen.
describe('hidePrivateKey', () => {
    const privateKey = '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----'

    it('replaces a private key with a placeholder the field refuses as a private key', () => {
        const hidden = hidePrivateKey(privateKey)

        expect(hidden).toBe('user.sshKeys.add.form.publicKey.privateKeyHidden')
        expect(publicKeyField().check('publicKey', {publicKey: hidden})).toBe('user.sshKeys.add.error.PRIVATE_KEY')
    })

    it.each([
        ['a public key', `ssh-ed25519 ${ED25519} alice@laptop`],
        ['something that is not a key', 'hello world']
    ])('leaves %s as it is', (_description, text) => {
        expect(hidePrivateKey(text)).toBe(text)
    })
})
