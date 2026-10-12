import {join} from 'node:path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {SshKeyRepository} from './sshKeyRepository.js'

describe('SshKeyRepository', () => {
    let testDb
    let repository

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'ssh_key_repository', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new SshKeyRepository(testDb.db)
    })

    afterAll(() => testDb?.remove())

    describe('add', () => {
        test('stores a key and answers it as it will be listed', async () => {
            const key = aKey()

            const added = await repository.add(ALICE, key)

            expect(added).toMatchObject(key)
            expect(added.creationTime).toMatch(ISO_TIMESTAMP)
            expect(await repository.list(ALICE)).toEqual([added])
        })

        test('answers null when the user already has a key with that fingerprint', async () => {
            const key = aKey()
            await repository.add(ALICE, key)

            const added = await repository.add(ALICE, {...key, name: 'Again'})

            expect(added).toBeNull()
            expect(await repository.count(ALICE)).toBe(1)
        })

        test('lets two users register the same key', async () => {
            const key = aKey()
            await repository.add(ALICE, key)

            const added = await repository.add(BOB, key)

            expect(added).toMatchObject(key)
        })

        test('stores a name with characters outside the basic multilingual plane', async () => {
            const added = await repository.add(ALICE, aKey({name: 'Laptop 🔑'}))

            expect((await repository.list(ALICE))[0].name).toBe(added.name)
            expect(added.name).toBe('Laptop 🔑')
        })
    })

    describe('list', () => {
        test('lists a user\'s keys oldest first', async () => {
            const first = await repository.add(ALICE, aKey({fingerprint: 'SHA256:first'}))
            const second = await repository.add(ALICE, aKey({fingerprint: 'SHA256:second'}))

            const listed = await repository.list(ALICE)

            expect(listed.map(({id}) => id)).toEqual([first.id, second.id])
        })

        test('lists only the user\'s own keys', async () => {
            await repository.add(BOB, aKey())

            expect(await repository.list(ALICE)).toEqual([])
        })

        test('matches the username regardless of case', async () => {
            const added = await repository.add(ALICE, aKey())

            expect(await repository.list(ALICE.toUpperCase())).toEqual([added])
        })
    })

    describe('remove', () => {
        test('removes the user\'s own key', async () => {
            const added = await repository.add(ALICE, aKey())

            const removed = await repository.remove(ALICE.toUpperCase(), added.id)

            expect(removed).toBe(true)
            expect(await repository.list(ALICE)).toEqual([])
        })

        test('leaves another user\'s key in place', async () => {
            const added = await repository.add(ALICE, aKey())

            const removed = await repository.remove(BOB, added.id)

            expect(removed).toBe(false)
            expect(await repository.list(ALICE)).toEqual([added])
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
