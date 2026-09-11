import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {failingDb} from '#sepal/testSupport/db/faultyConnection'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {ClaimRepository} from './claimRepository.js'

// The claim is the allocation arbiter, so it is exercised against the real primary key: whether two
// simultaneous claims produce one winner is a property of MySQL, not of this code. The suite therefore
// takes two connections — the one case the single-connection default cannot express.

describe('ClaimRepository', () => {
    let testDb
    let repository

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'worker_claim', migrations: MIGRATIONS_PATH, connections: 2})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new ClaimRepository(testDb.db)
    })

    afterAll(() => testDb?.remove())

    describe('claim', () => {
        test('claims an instance that is free', async () => {
            const won = await repository.claim(INSTANCE_ID, SESSION_ID)

            expect(won).toBe(true)
        })

        test('refuses an instance another session has claimed', async () => {
            await repository.claim(INSTANCE_ID, SESSION_ID)

            const won = await repository.claim(INSTANCE_ID, ANOTHER_SESSION_ID)

            const claims = await repository.all()
            expect(won).toBe(false)
            expect(claims.map(({sessionId}) => sessionId)).toEqual([SESSION_ID])
        })

        // The multi-process-safety requirement: two writers, genuinely at once, one winner.
        test('gives exactly one of two simultaneous claims the instance', async () => {
            const outcomes = await Promise.all([
                repository.claim(INSTANCE_ID, SESSION_ID),
                repository.claim(INSTANCE_ID, ANOTHER_SESSION_ID),
            ])

            const claims = await repository.all()
            expect(outcomes.filter(Boolean)).toHaveLength(1)
            expect(claims).toHaveLength(1)
        })

        // Only a collision means "already claimed"; anything else is an outage the caller must see,
        // because reading it as a lost race would hand the instance to nobody.
        test('reports a database failure rather than treating it as a lost claim', async () => {
            const failing = new ClaimRepository(failingDb(testDb.db, {
                when: sql => sql.includes('INSERT INTO instance_claim'),
                error: new Error('db down')
            }))

            await expect(failing.claim(INSTANCE_ID, SESSION_ID)).rejects.toThrow('db down')
        })
    })

    describe('release', () => {
        test('frees the instance for a later claim', async () => {
            await repository.claim(INSTANCE_ID, SESSION_ID)

            const released = await repository.release(INSTANCE_ID)

            const reclaimed = await repository.claim(INSTANCE_ID, ANOTHER_SESSION_ID)
            expect(released).toBe(true)
            expect(reclaimed).toBe(true)
        })

        test('reports that an unclaimed instance released nothing', async () => {
            const released = await repository.release(INSTANCE_ID)

            expect(released).toBe(false)
        })
    })

    describe('all', () => {
        test('reports every claim with the time it was made', async () => {
            await repository.claim(INSTANCE_ID, SESSION_ID)
            await repository.claim(ANOTHER_INSTANCE_ID, ANOTHER_SESSION_ID)

            const claims = await repository.all()

            expect(claims.map(({instanceId, sessionId}) => ({instanceId, sessionId})).sort(byInstanceId)).toEqual([
                {instanceId: INSTANCE_ID, sessionId: SESSION_ID},
                {instanceId: ANOTHER_INSTANCE_ID, sessionId: ANOTHER_SESSION_ID},
            ].sort(byInstanceId))
            expect(claims.every(({claimedAt}) => claimedAt instanceof Date)).toBe(true)
        })

        test('reports nothing when no instance is claimed', async () => {
            const claims = await repository.all()

            expect(claims).toEqual([])
        })
    })

    const byInstanceId = (a, b) => a.instanceId.localeCompare(b.instanceId)

    const INSTANCE_ID = 'i-100'
    const ANOTHER_INSTANCE_ID = 'i-200'
    const SESSION_ID = 's-a'
    const ANOTHER_SESSION_ID = 's-b'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../../migrations')
})
