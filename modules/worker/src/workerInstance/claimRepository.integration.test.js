import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, before, beforeEach, describe, mock, test} from 'node:test'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {failingDb} from '#sepal/testSupport/db/faultyConnection'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {createLocalInstanceProvider} from '../hostingService/local/localInstanceProvider.js'
import {ClaimRepository} from './claimRepository.js'
import {createInstanceManager} from './instanceManager.js'
import {createProvisioningRegistry} from './provisioningRegistry.js'

// The claim is the allocation arbiter, so it is exercised against the real primary key: whether two
// simultaneous claims produce one winner is a property of MySQL, not of this code. The suite therefore
// takes two connections — the one case the single-connection default cannot express.

describe('ClaimRepository', () => {
    let testDb
    let repository

    before(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'worker_claim', migrations: MIGRATIONS_PATH, connections: 2})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new ClaimRepository(testDb.db)
    })

    after(() => testDb?.remove())

    test('looks up only the current claim of the requested instance', async () => {
        assert.equal(await repository.sessionIdForInstance(INSTANCE_ID), null)
        await repository.claim(INSTANCE_ID, SESSION_ID)
        assert.equal(await repository.sessionIdForInstance(INSTANCE_ID), SESSION_ID)
        assert.equal(await repository.sessionIdForInstance('another-instance'), null)
        await repository.release(INSTANCE_ID, SESSION_ID)
        assert.equal(await repository.sessionIdForInstance(INSTANCE_ID), null)
    })

    describe('claim', () => {
        test('claims an instance that is free', async () => {
            const won = await repository.claim(INSTANCE_ID, SESSION_ID)

            assert.equal(won, true)
        })

        test('refuses an instance another session has claimed', async () => {
            await repository.claim(INSTANCE_ID, SESSION_ID)

            const won = await repository.claim(INSTANCE_ID, ANOTHER_SESSION_ID)

            const claims = await repository.all()
            assert.equal(won, false)
            assert.deepEqual(claims.map(({sessionId}) => sessionId), [SESSION_ID])
        })

        // The multi-process-safety requirement: two writers, genuinely at once, one winner.
        test('gives exactly one of two simultaneous claims the instance', async () => {
            const outcomes = await Promise.all([
                repository.claim(INSTANCE_ID, SESSION_ID),
                repository.claim(INSTANCE_ID, ANOTHER_SESSION_ID),
            ])

            const claims = await repository.all()
            assert.equal(outcomes.filter(Boolean).length, 1)
            assert.equal(claims.length, 1)
        })

        // Only a collision means "already claimed"; anything else is an outage the caller must see,
        // because reading it as a lost race would hand the instance to nobody.
        test('reports a database failure rather than treating it as a lost claim', async () => {
            const failing = new ClaimRepository(failingDb(testDb.db, {
                when: sql => sql.includes('INSERT INTO instance_claim'),
                error: new Error('db down')
            }))

            await assert.rejects(failing.claim(INSTANCE_ID, SESSION_ID), /db down/)
        })
    })

    describe('release', () => {
        test('frees the instance for a later claim', async () => {
            await repository.claim(INSTANCE_ID, SESSION_ID)

            const released = await repository.release(INSTANCE_ID, SESSION_ID)

            const reclaimed = await repository.claim(INSTANCE_ID, ANOTHER_SESSION_ID)
            assert.equal(released, true)
            assert.equal(reclaimed, true)
        })

        test('reports that an unclaimed instance released nothing', async () => {
            const released = await repository.release(INSTANCE_ID, SESSION_ID)

            assert.equal(released, false)
        })

        // A slow release of the previous session must not take the instance from the next one.
        test('leaves the claim of another session alone', async () => {
            await repository.claim(INSTANCE_ID, ANOTHER_SESSION_ID)

            const released = await repository.release(INSTANCE_ID, SESSION_ID)

            const claims = await repository.all()
            assert.equal(released, false)
            assert.deepEqual(claims.map(({sessionId}) => sessionId), [ANOTHER_SESSION_ID])
        })
    })

    describe('all', () => {
        test('reports every claim with the time it was made', async () => {
            await repository.claim(INSTANCE_ID, SESSION_ID)
            await repository.claim(ANOTHER_INSTANCE_ID, ANOTHER_SESSION_ID)

            const claims = await repository.all()

            assert.deepEqual(
                claims.map(({instanceId, sessionId}) => ({instanceId, sessionId})).sort(byInstanceId),
                [
                    {instanceId: INSTANCE_ID, sessionId: SESSION_ID},
                    {instanceId: ANOTHER_INSTANCE_ID, sessionId: ANOTHER_SESSION_ID},
                ].sort(byInstanceId)
            )
            assert.equal(claims.every(({claimedAt}) => claimedAt instanceof Date), true)
        })

        test('reports nothing when no instance is claimed', async () => {
            const claims = await repository.all()

            assert.deepEqual(claims, [])
        })
    })

    for (const outcome of ['success', 'failure before commit', 'committed response lost']) {
        test(`a late release joins a real MySQL gone-claim DELETE: ${outcome}`, {timeout: 10000}, async () => {
            const provider = createLocalInstanceProvider()
            const [instance] = provider.launchIdle('T3aSmall', 1)
            await repository.claim(instance.id, SESSION_ID)
            await testDb.query(
                'UPDATE instance_claim SET claimed_at = DATE_SUB(NOW(), INTERVAL 11 MINUTE) WHERE instance_id = ?',
                [instance.id]
            )
            const deleting = Promise.withResolvers()
            const resume = Promise.withResolvers()
            const fault = {armed: true}
            const claims = new ClaimRepository({
                withConnection: run => testDb.db.withConnection(connection => run({
                    query: async (sql, params) => {
                        if (!fault.armed || !sql.startsWith('DELETE FROM instance_claim') || params[0] !== instance.id) {
                            return connection.query(sql, params)
                        }
                        fault.armed = false
                        deleting.resolve()
                        await resume.promise
                        if (outcome === 'failure before commit') throw new Error(outcome)
                        const result = await connection.query(sql, params)
                        if (outcome === 'committed response lost') throw new Error(outcome)
                        return result
                    },
                })),
            })
            const provisioning = createProvisioningRegistry()
            const provisioner = {undeploy: mock.fn(async () => {}), provisionInstance: mock.fn(async () => {})}
            const manager = createInstanceManager({claims, provider, provisioning, provisioner, instanceTypes: []})
            const idleInstances = provider.idleInstances
            const reservedInstances = provider.reservedInstances
            // Isolate the reverse ordering once filtered inventory has missed the idle host.
            provider.idleInstances = async () => []
            provider.reservedInstances = async () => []
            provider.getInstance = mock.fn(provider.getInstance)
            provider.terminate = mock.fn(provider.terminate)

            const reclaiming = manager.reclaimStaleClaims([], 10 * 60_000)
            await deleting.promise
            const releasing = manager.releaseInstance(instance.id, SESSION_ID)
            const settled = Promise.allSettled([reclaiming, releasing])
            try {
                assert.equal(provider.getInstance.mock.callCount(), 0)
            } finally {
                resume.resolve()
                await settled
            }
            assert.equal((await settled)[1].status, 'fulfilled')
            assert.equal(provider.getInstance.mock.callCount(), 0)
            assert.equal(provider.terminate.mock.callCount(), 0)
            assert.equal(provisioner.undeploy.mock.callCount(), 0)
            assert.equal(await repository.sessionIdForInstance(instance.id), outcome === 'failure before commit' ? SESSION_ID : null)

            provider.idleInstances = idleInstances
            provider.reservedInstances = reservedInstances
            const session = {id: ANOTHER_SESSION_ID, username: 'bob', workerType: 'SANDBOX', instanceType: 'T3aSmall'}
            const next = await manager.requestInstance(session)
            assert.equal(next.id === instance.id, outcome !== 'failure before commit')
            await manager.reclaimStaleClaims([{id: ANOTHER_SESSION_ID}], 10 * 60_000)
            assert.equal(await manager.reprovisionInstance({...session, instance: next}), true)
            assert.equal(await repository.sessionIdForInstance(next.id), ANOTHER_SESSION_ID)
            assert.equal(provider.getInstance(next.id)?.reservation.sessionId, ANOTHER_SESSION_ID)
        })
    }

    const byInstanceId = (a, b) => a.instanceId.localeCompare(b.instanceId)

    const INSTANCE_ID = 'i-100'
    const ANOTHER_INSTANCE_ID = 'i-200'
    const SESSION_ID = 's-a'
    const ANOTHER_SESSION_ID = 's-b'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../../migrations')
})
