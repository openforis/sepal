import assert from 'node:assert/strict'
import {beforeEach, describe, test} from 'node:test'

import {createBootstrap, SYSTEM_USERS} from './bootstrap.js'
import {hashPassword, verifyPassword} from './crypto.js'

// Establishing credentials for the seeded administrators on a fresh install. The repository fake keeps
// its rows, so what bootstrap left behind after a failure is observable — that is what makes the next
// start heal it.

describe('bootstrap', () => {
    let repository
    let provisioned
    let secrets

    beforeEach(() => {
        repository = aRepository({
            sepaladmin: {id: 10000, username: 'sepaladmin', passwordHash: null},
            admin: {id: 10001, username: 'admin', passwordHash: null}
        })
        provisioned = []
        secrets = {SEPAL_ADMIN_PASSWORD: 'first-secret', SEPAL_ADMIN_WEB_PASSWORD: 'second-secret'}
    })

    test('targets the lowercased seeded administrators with their secret env vars', () => {
        assert.deepEqual(SYSTEM_USERS, [
            {username: 'sepaladmin', secretEnv: 'SEPAL_ADMIN_PASSWORD'},
            {username: 'admin', secretEnv: 'SEPAL_ADMIN_WEB_PASSWORD'}
        ])
    })

    test('gives each seeded administrator a posix identity, a home and a password', async () => {
        await bootstrap()()

        const first = await repository.findByUsername('sepaladmin')
        const second = await repository.findByUsername('admin')
        assert.deepEqual(provisioned, [['sepaladmin', 10000, 10000], ['admin', 10001, 10001]])
        assert.equal(first.uid, 10000)
        assert.equal(first.sshPublicKey, 'ssh-rsa AAAAKEY')
        assert.equal(verifyPassword('first-secret', first.passwordHash), true)
        assert.equal(verifyPassword('second-secret', second.passwordHash), true)
    })

    test('leaves an administrator who already has credentials alone', async () => {
        repository = aRepository({
            sepaladmin: {id: 1, username: 'sepaladmin', passwordHash: '{SCRYPT}existing'},
            admin: {id: 2, username: 'admin', passwordHash: '{SCRYPT}existing'}
        })

        await bootstrap()()

        const user = await repository.findByUsername('sepaladmin')
        assert.deepEqual(provisioned, [])
        assert.equal(user.passwordHash, '{SCRYPT}existing')
    })

    test('does nothing for an administrator whose secret is unset', async () => {
        secrets = {}

        await bootstrap()()

        const user = await repository.findByUsername('sepaladmin')
        assert.deepEqual(provisioned, [])
        assert.equal(user.passwordHash, null)
    })

    test('does nothing for an administrator who was never seeded', async () => {
        repository = aRepository({})

        await bootstrap()()

        assert.deepEqual(provisioned, [])
    })

    // The password is the idempotency sentinel: leaving it unset is what makes the next start try again.
    test('leaves the password unset when provisioning fails, so the next start heals it', async () => {
        await expectBootstrapToSurvive(() => bootstrap({
            provision: async username => {
                if (username === 'sepaladmin') {
                    throw new Error('no filesystem')
                }
                return 'ssh-rsa AAAAKEY'
            }
        })())

        const failed = await repository.findByUsername('sepaladmin')
        assert.equal(failed.passwordHash, null)
        assert.equal(failed.sshPublicKey, undefined)
    })

    test('carries on to the other administrator after one fails', async () => {
        repository = failingToFind('sepaladmin', aRepository({
            sepaladmin: {id: 10000, username: 'sepaladmin', passwordHash: null},
            admin: {id: 10001, username: 'admin', passwordHash: null}
        }))

        await bootstrap()()

        const second = await repository.findByUsername('admin')
        assert.equal(verifyPassword('second-secret', second.passwordHash), true)
    })

    const bootstrap = (over = {}) => createBootstrap({
        repository,
        provision: async (username, uid, gid) => {
            provisioned.push([username, uid, gid])
            return 'ssh-rsa AAAAKEY'
        },
        hashPassword,
        readSecret: name => secrets[name],
        ...over
    })

    const expectBootstrapToSurvive = async run => {
        assert.equal(await run(), undefined)
    }

    // Keeps what it is given, so a read after a write shows the write.
    const aRepository = users => ({
        findByUsername: async username => users[username] ?? null,
        assignDerivedPosixIds: async id => {
            for (const user of Object.values(users)) {
                if (user.id === id) {
                    user.uid = user.uid ?? id
                    user.gid = user.gid ?? id
                }
            }
        },
        updateSshPublicKey: async (username, sshPublicKey) => {
            users[username].sshPublicKey = sshPublicKey
        },
        updatePassword: async (username, passwordHash) => {
            users[username].passwordHash = passwordHash
        }
    })

    const failingToFind = (username, repository) => ({
        ...repository,
        findByUsername: async name => {
            if (name === username) {
                throw new Error('database unreachable')
            }
            return repository.findByUsername(name)
        }
    })
})
