import {jest} from '@jest/globals'

import {createBootstrap, SYSTEM_USERS} from './bootstrap.js'
import {verifyPassword} from './crypto.js'

const makeDeps = overrides => ({
    findByUsername: jest.fn(async () => ({id: 10000, username: 'x', passwordHash: null})),
    updatePassword: jest.fn(async () => {}),
    updateSshPublicKey: jest.fn(async () => {}),
    provision: jest.fn(async () => 'ssh-rsa AAAAKEY'),
    hashPassword: jest.fn(() => '{SSHA}hashed'),
    readSecret: jest.fn(() => 's3cret'),
    ...overrides
})

test('SYSTEM_USERS targets the lowercased seeded admins with their secret env vars', () => {
    expect(SYSTEM_USERS).toEqual([
        {username: 'sepaladmin', secretEnv: 'SEPAL_ADMIN_PASSWORD'},
        {username: 'admin', secretEnv: 'SEPAL_ADMIN_WEB_PASSWORD'}
    ])
})

test('populates credentials + provisions when password_hash is missing and secret present', async () => {
    const deps = makeDeps({
        findByUsername: jest.fn(async username => ({id: username === 'admin' ? 10001 : 10000, username, passwordHash: null}))
    })
    await createBootstrap(deps)()
    expect(deps.updatePassword).toHaveBeenCalledWith('sepaladmin', '{SSHA}hashed')
    expect(deps.provision).toHaveBeenCalledWith('sepaladmin', 10000)
    expect(deps.updateSshPublicKey).toHaveBeenCalledWith('sepaladmin', 'ssh-rsa AAAAKEY')
    expect(deps.updatePassword).toHaveBeenCalledWith('admin', '{SSHA}hashed')
    expect(deps.provision).toHaveBeenCalledWith('admin', 10001)
    expect(deps.updatePassword).toHaveBeenCalledTimes(2)
})

test('is a no-op when credentials already present (idempotent)', async () => {
    const deps = makeDeps({findByUsername: jest.fn(async username => ({id: 1, username, passwordHash: '{SSHA}existing'}))})
    await createBootstrap(deps)()
    expect(deps.updatePassword).not.toHaveBeenCalled()
    expect(deps.provision).not.toHaveBeenCalled()
})

test('skips a user whose secret env var is unset', async () => {
    const deps = makeDeps({readSecret: jest.fn(() => undefined)})
    await createBootstrap(deps)()
    expect(deps.updatePassword).not.toHaveBeenCalled()
    expect(deps.provision).not.toHaveBeenCalled()
})

test('skips a user that is not seeded (row missing)', async () => {
    const deps = makeDeps({findByUsername: jest.fn(async () => null)})
    await createBootstrap(deps)()
    expect(deps.updatePassword).not.toHaveBeenCalled()
})

test('a failure on one user does not prevent the other from being processed', async () => {
    const deps = makeDeps({
        findByUsername: jest.fn(async username => {
            if (username === 'sepaladmin') throw new Error('boom')
            return {id: 10001, username, passwordHash: null}
        })
    })
    await createBootstrap(deps)()
    expect(deps.updatePassword).toHaveBeenCalledWith('admin', '{SSHA}hashed')
})

test('hashes with the real {SCRYPT} scheme (round-trips through verifyPassword)', async () => {
    let storedHash
    const {hashPassword} = await import('./crypto.js')
    const deps = makeDeps({
        findByUsername: jest.fn(async () => ({id: 10000, username: 'sepaladmin', passwordHash: null})),
        hashPassword,
        updatePassword: jest.fn(async (_u, h) => {storedHash = h}),
        readSecret: jest.fn(() => 'topsecret')
    })
    await createBootstrap(deps)()
    expect(storedHash).toMatch(/^\{SCRYPT\}/)
    expect(verifyPassword('topsecret', storedHash)).toBe(true)
})
