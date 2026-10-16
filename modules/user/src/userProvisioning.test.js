import assert from 'node:assert/strict'
import {beforeEach, describe, test} from 'node:test'

import {createEnsureProvisioned} from './userProvisioning.js'

// Lazy provisioning, run when a user leaves PENDING. It must never fail the web request that triggered
// it, and it must never invent a POSIX identity.

describe('ensureProvisioned', () => {
    let repository
    let provisioned

    beforeEach(() => {
        repository = aRepository({[USERNAME]: {username: USERNAME, uid: UID, gid: GID, sshPublicKey: null}})
        provisioned = []
    })

    test('provisions the user and reports them back with the key it stored', async () => {
        const provisionedUser = await ensureProvisioned()(aUser())

        assert.deepEqual(provisioned, [[USERNAME, UID, GID]])
        assert.equal(provisionedUser.sshPublicKey, PUBLIC_KEY)
    })

    // The script is idempotent, and a stored key is no proof the filesystem still has the home it
    // belongs to.
    test('provisions again for a user who already has a key stored', async () => {
        await ensureProvisioned()(aUser({sshPublicKey: 'ssh-rsa EXISTING'}))

        const stored = await repository.findByUsername(USERNAME)
        assert.deepEqual(provisioned, [[USERNAME, UID, GID]])
        assert.equal(stored.sshPublicKey, PUBLIC_KEY)
    })

    // Chowning with a made-up uid/gid could orphan files that already exist.
    test('refuses to provision a user with no posix identity', async () => {
        const user = aUser({uid: null, gid: null})

        const unchanged = await ensureProvisioned()(user)

        assert.deepEqual(provisioned, [])
        assert.equal(unchanged, user)
    })

    // Web access must not depend on provisioning; the next activate or reset tries again.
    test('reports the user unchanged when provisioning fails', async () => {
        const user = aUser()

        const unchanged = await ensureProvisioned({
            provision: async () => {
                throw new Error('no filesystem')
            }
        })(user)

        const stored = await repository.findByUsername(USERNAME)
        assert.equal(unchanged, user)
        assert.equal(stored.sshPublicKey, null)
    })

    test('stores no key when provisioning produced none', async () => {
        const user = aUser()

        const unchanged = await ensureProvisioned({provision: async () => ''})(user)

        const stored = await repository.findByUsername(USERNAME)
        assert.equal(unchanged, user)
        assert.equal(stored.sshPublicKey, null)
    })

    const ensureProvisioned = (over = {}) => createEnsureProvisioned({
        repository,
        provision: async (username, uid, gid) => {
            provisioned.push([username, uid, gid])
            return PUBLIC_KEY
        },
        ...over
    })

    // Keeps what it is given, so a read after a write shows the write.
    const aRepository = users => ({
        findByUsername: async username => users[username] ?? null,
        updateSshPublicKey: async (username, sshPublicKey) => {
            users[username].sshPublicKey = sshPublicKey
        }
    })

    const aUser = (over = {}) => ({username: USERNAME, uid: UID, gid: GID, sshPublicKey: null, ...over})

    const USERNAME = 'joe'
    const UID = 10001
    const GID = 20001
    const PUBLIC_KEY = 'ssh-rsa AAAAKEY'
})
