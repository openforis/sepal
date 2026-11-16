import assert from 'node:assert/strict'
import {describe, it, mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {createInstanceManager} from './instanceManager.js'

const session = ({id, instanceId, host = 'host-1', creationTime = new Date('2024-01-01T00:00:00Z')}) => ({
    id,
    username: 'admin',
    workerType: 'SANDBOX',
    instanceType: 'T3aSmall',
    instance: {id: instanceId, host},
    creationTime,
})

const makeManager = provisioner =>
    createInstanceManager({
        claims: {sessionIdForInstance: async () => 's-1'},
        provider: {attachScratchVolume: async () => null}, provisioner, instanceTypes: []
    })

describe('removeOrphanedContainers', () => {
    const instance = id => ({id, type: 'T3aSmall', host: id, reservation: null})

    it('passes session instance ids plus every provider-tracked instance id to the provisioner', async () => {
        const provisioner = {removeOrphanedContainers: mock.fn(async () => [])}
        const provider = {
            idleInstances: async () => [instance('i-idle')],
            reservedInstances: async () => [instance('i-reserved')],
        }
        const manager = createInstanceManager({provider, provisioner, instanceTypes: []})

        await manager.removeOrphanedContainers([session({id: 's-1', instanceId: 'i-1'})])

        assert.deepEqual(
            callsOf(provisioner.removeOrphanedContainers),
            [[['i-1', 'i-idle', 'i-reserved']]]
        )
    })

    it('skips sessions without an instance and returns the removed container names', async () => {
        const provisioner = {removeOrphanedContainers: mock.fn(async () => ['/sandbox.admin.bbb'])}
        const provider = {
            idleInstances: async () => [],
            reservedInstances: async () => [],
        }
        const manager = createInstanceManager({provider, provisioner, instanceTypes: []})

        const removed = await manager.removeOrphanedContainers([
            session({id: 's-1', instanceId: 'i-1'}),
            {id: 's-2', username: 'admin', instance: null},
        ])

        assert.deepEqual(callsOf(provisioner.removeOrphanedContainers), [[['i-1']]])
        assert.deepEqual(removed, ['/sandbox.admin.bbb'])
    })
})

describe('sessionsWithoutInstance', () => {
    it('passes fully-reconstructed instances to the provisioner (Groovy adapter parity)', async () => {
        const provisioner = {instanceStatus: mock.fn(async () => 'PROVISIONED')}
        const manager = makeManager(provisioner)

        await manager.sessionsWithoutInstance([session({id: 's-1', instanceId: 'i-1'})])

        assert.deepEqual(callsOf(provisioner.instanceStatus), [[{
            id: 'i-1',
            type: 'T3aSmall',
            host: 'host-1',
            running: true,
            launchTime: new Date('2024-01-01T00:00:00Z'),
            reservation: {username: 'admin', workerType: 'SANDBOX', sessionId: 's-1'},
            daemonHost: null,
        }]])
    })

    it('does not report sessions whose instance is provisioned', async () => {
        const provisioner = {instanceStatus: async () => 'PROVISIONED'}
        const manager = makeManager(provisioner)

        const result = await manager.sessionsWithoutInstance([session({id: 's-1', instanceId: 'i-1'})])

        assert.deepEqual(result, [])
    })

    it('reports only sessions whose instance is missing', async () => {
        const provisioner = {
            instanceStatus: async instance => instance.id === 'i-2' ? 'MISSING' : 'PROVISIONED',
        }
        const manager = makeManager(provisioner)

        const s1 = session({id: 's-1', instanceId: 'i-1'})
        const s2 = session({id: 's-2', instanceId: 'i-2'})
        const result = await manager.sessionsWithoutInstance([s1, s2])

        assert.deepEqual(result, [{session: s2, status: 'MISSING'}])
    })
})

describe('reprovisionInstance', () => {
    const pendingSession = {
        id: 's-1',
        username: 'alice',
        workerType: 'sandbox',
        instanceType: 'T3aSmall',
        instance: {id: 'i-1', host: '10.0.0.1'},
        creationTime: new Date('2026-01-01T00:00:00Z'),
    }

    test('provisions the instance rebuilt from the session', async () => {
        const provisioner = {provisionInstance: mock.fn(async () => {})}
        const manager = makeManager(provisioner)

        assert.equal(await manager.reprovisionInstance(pendingSession), true)
        assert.equal(provisioner.provisionInstance.mock.callCount(), 1)
        const provisioned = provisioner.provisionInstance.mock.calls[0].arguments[0]
        assert.equal(provisioned.id, 'i-1')
        assert.equal(provisioned.reservation.sessionId, 's-1')
    })

    test('release retires an instance whose provisioning is still running', async () => {
        const started = Promise.withResolvers()
        const pending = Promise.withResolvers()
        const provisioner = {
            provisionInstance: mock.fn(() => {
                started.resolve()
                return pending.promise
            }),
            undeploy: mock.fn(async () => {}),
        }
        const instance = {
            id: 'i-1',
            type: 'T3aSmall',
            host: '10.0.0.1',
            reservation: {username: 'alice', workerType: 'sandbox', sessionId: 's-1'},
        }
        const claims = {sessionIdForInstance: async () => 's-1', release: mock.fn(async () => true)}
        const provider = {
            getInstance: mock.fn(async () => instance),
            release: mock.fn(async () => {}),
            terminate: mock.fn(async () => {}),
            attachScratchVolume: mock.fn(async () => null),
            deleteScratchVolume: mock.fn(async () => {}),
        }
        const manager = createInstanceManager({claims, provider, provisioner, instanceTypes: []})

        const first = manager.reprovisionInstance(pendingSession)
        assert.equal(manager.isProvisioning('i-1'), true)
        await started.promise

        await manager.releaseInstance('i-1', 's-1')
        assert.equal(manager.isProvisioning('i-1'), true)
        assert.deepEqual(callsOf(provider.terminate), [['i-1']])
        assert.equal(provider.release.mock.callCount(), 0)
        assert.equal(provisioner.undeploy.mock.callCount(), 0)
        assert.equal(claims.release.mock.callCount(), 0)

        pending.resolve()
        assert.equal(await first, true)
        assert.equal(manager.isProvisioning('i-1'), true)
    })

    // The sweep re-entering an in-flight provision would delete the containers it is creating.
    test('is dropped while the same instance is already being provisioned', async () => {
        let release
        const started = Promise.withResolvers()
        const provisioner = {
            provisionInstance: mock.fn(() => new Promise(resolve => {
                release = resolve
                started.resolve()
            })),
        }
        const manager = makeManager(provisioner)

        const running = manager.reprovisionInstance(pendingSession)
        assert.equal(manager.isProvisioning('i-1'), true)
        assert.equal(await manager.reprovisionInstance(pendingSession), false)
        await started.promise
        assert.equal(provisioner.provisionInstance.mock.callCount(), 1)

        release()
        await running
        assert.equal(manager.isProvisioning('i-1'), false)
    })
})
