import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, before, beforeEach, describe, test} from 'node:test'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {SshKeyRepository} from './sshKeyRepository.js'

describe('SshKeyRepository', () => {
    let testDb
    let repository

    before(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'ssh_key_repository', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new SshKeyRepository(testDb.db)
    })

    after(() => testDb?.remove())

    describe('add', () => {
        test('stores a key and answers it as it will be listed', async () => {
            const key = aKey()

            const added = await repository.add(ALICE, key)

            assert.partialDeepStrictEqual(added, key)
            assert.match(added.creationTime, ISO_TIMESTAMP)
            assert.deepEqual(await repository.list(ALICE), [added])
        })

        test('answers null when the user already has a key with that fingerprint', async () => {
            const key = aKey()
            await repository.add(ALICE, key)

            const added = await repository.add(ALICE, {...key, name: 'Again'})

            assert.equal(added, null)
            assert.equal(await repository.count(ALICE), 1)
        })

        test('lets two users register the same key', async () => {
            const key = aKey()
            await repository.add(ALICE, key)

            const added = await repository.add(BOB, key)

            assert.partialDeepStrictEqual(added, key)
        })

        test('stores a name with characters outside the basic multilingual plane', async () => {
            const added = await repository.add(ALICE, aKey({name: 'Laptop 🔑'}))

            assert.equal((await repository.list(ALICE))[0].name, added.name)
            assert.equal(added.name, 'Laptop 🔑')
        })
    })

    describe('list', () => {
        test('lists a user\'s keys oldest first', async () => {
            const first = await repository.add(ALICE, aKey({fingerprint: 'SHA256:first'}))
            const second = await repository.add(ALICE, aKey({fingerprint: 'SHA256:second'}))

            const listed = await repository.list(ALICE)

            assert.deepEqual(listed.map(({id}) => id), [first.id, second.id])
        })

        test('lists only the user\'s own keys', async () => {
            await repository.add(BOB, aKey())

            assert.deepEqual(await repository.list(ALICE), [])
        })

        test('matches the username regardless of case', async () => {
            const added = await repository.add(ALICE, aKey())

            assert.deepEqual(await repository.list(ALICE.toUpperCase()), [added])
        })
    })

    describe('remove', () => {
        test('removes the user\'s own key', async () => {
            const added = await repository.add(ALICE, aKey())

            const removed = await repository.remove(ALICE.toUpperCase(), added.id)

            assert.equal(removed, true)
            assert.deepEqual(await repository.list(ALICE), [])
        })

        test('leaves another user\'s key in place', async () => {
            const added = await repository.add(ALICE, aKey())

            const removed = await repository.remove(BOB, added.id)

            assert.equal(removed, false)
            assert.deepEqual(await repository.list(ALICE), [added])
        })
    })

    const aKey = (over = {}) => ({
        name: 'Laptop', type: 'ssh-ed25519', publicKey: 'AAAAC3NzaC1lZDI1NTE5AAAAIFTTtG0hPe95rIxeTXi4nSx4CHf59bz6WQ6e8K0fhOWn',
        fingerprint: 'SHA256:UU+gcLVF9cusf1SG79CcIIz41VI08llkOadj4V5fyTM', ...over
    })

    const ALICE = 'alice'
    const BOB = 'bob'
    const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
