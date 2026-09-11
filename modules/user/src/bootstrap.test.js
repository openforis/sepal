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
        expect(SYSTEM_USERS).toEqual([
            {username: 'sepaladmin', secretEnv: 'SEPAL_ADMIN_PASSWORD'},
            {username: 'admin', secretEnv: 'SEPAL_ADMIN_WEB_PASSWORD'}
        ])
    })

    test('gives each seeded administrator a posix identity, a home and a password', async () => {
        await bootstrap()()

        const first = await repository.findByUsername('sepaladmin')
        const second = await repository.findByUsername('admin')
        expect(provisioned).toEqual([['sepaladmin', 10000, 10000], ['admin', 10001, 10001]])
        expect(first.uid).toBe(10000)
        expect(first.sshPublicKey).toBe('ssh-rsa AAAAKEY')
        expect(verifyPassword('first-secret', first.passwordHash)).toBe(true)
        expect(verifyPassword('second-secret', second.passwordHash)).toBe(true)
    })

    test('leaves an administrator who already has credentials alone', async () => {
        repository = aRepository({
            sepaladmin: {id: 1, username: 'sepaladmin', passwordHash: '{SCRYPT}existing'},
            admin: {id: 2, username: 'admin', passwordHash: '{SCRYPT}existing'}
        })

        await bootstrap()()

        const user = await repository.findByUsername('sepaladmin')
        expect(provisioned).toEqual([])
        expect(user.passwordHash).toBe('{SCRYPT}existing')
    })

    test('does nothing for an administrator whose secret is unset', async () => {
        secrets = {}

        await bootstrap()()

        const user = await repository.findByUsername('sepaladmin')
        expect(provisioned).toEqual([])
        expect(user.passwordHash).toBeNull()
    })

    test('does nothing for an administrator who was never seeded', async () => {
        repository = aRepository({})

        await bootstrap()()

        expect(provisioned).toEqual([])
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
        expect(failed.passwordHash).toBeNull()
        expect(failed.sshPublicKey).toBeUndefined()
    })

    test('carries on to the other administrator after one fails', async () => {
        repository = failingToFind('sepaladmin', aRepository({
            sepaladmin: {id: 10000, username: 'sepaladmin', passwordHash: null},
            admin: {id: 10001, username: 'admin', passwordHash: null}
        }))

        await bootstrap()()

        const second = await repository.findByUsername('admin')
        expect(verifyPassword('second-secret', second.passwordHash)).toBe(true)
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
        await expect(run()).resolves.toBeUndefined()
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
