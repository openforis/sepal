// instanceManager.sessionsWithoutInstance must hand the provisioner a RECONSTRUCTED
// WorkerInstance (id, type, host, reservation: {username, workerType}), not the session's
// {id, host} projection: dockerInstanceProvisioner reads instance.reservation.workerType, so a
// bare projection makes the probe throw → every healthy session gets closed as "without
// instance".

import {jest} from '@jest/globals'

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
    createInstanceManager({provider: {attachScratchVolume: async () => null}, provisioner, instanceTypes: []})

describe('removeOrphanedContainers', () => {
    const instance = id => ({id, type: 'T3aSmall', host: id, reservation: null})

    it('passes session instance ids plus every provider-tracked instance id to the provisioner', async () => {
        const provisioner = {removeOrphanedContainers: jest.fn(async () => [])}
        const provider = {
            idleInstances: async () => [instance('i-idle')],
            reservedInstances: async () => [instance('i-reserved')],
        }
        const manager = createInstanceManager({provider, provisioner, instanceTypes: []})

        await manager.removeOrphanedContainers([session({id: 's-1', instanceId: 'i-1'})])

        expect(provisioner.removeOrphanedContainers).toHaveBeenCalledWith(['i-1', 'i-idle', 'i-reserved'])
    })

    it('skips sessions without an instance and returns the removed container names', async () => {
        const provisioner = {removeOrphanedContainers: jest.fn(async () => ['/sandbox.admin.bbb'])}
        const provider = {
            idleInstances: async () => [],
            reservedInstances: async () => [],
        }
        const manager = createInstanceManager({provider, provisioner, instanceTypes: []})

        const removed = await manager.removeOrphanedContainers([
            session({id: 's-1', instanceId: 'i-1'}),
            {id: 's-2', username: 'admin', instance: null},
        ])

        expect(provisioner.removeOrphanedContainers).toHaveBeenCalledWith(['i-1'])
        expect(removed).toEqual(['/sandbox.admin.bbb'])
    })
})

describe('sessionsWithoutInstance', () => {
    it('passes fully-reconstructed instances to the provisioner (Groovy adapter parity)', async () => {
        const provisioner = {instanceStatus: jest.fn(async () => 'PROVISIONED')}
        const manager = makeManager(provisioner)

        await manager.sessionsWithoutInstance([session({id: 's-1', instanceId: 'i-1'})])

        expect(provisioner.instanceStatus).toHaveBeenCalledWith({
            id: 'i-1',
            type: 'T3aSmall',
            host: 'host-1',
            running: true,
            launchTime: new Date('2024-01-01T00:00:00Z'),
            reservation: {username: 'admin', workerType: 'SANDBOX', sessionId: 's-1'},
            daemonHost: null,
        })
    })

    it('does not report sessions whose instance is provisioned', async () => {
        const provisioner = {instanceStatus: async () => 'PROVISIONED'}
        const manager = makeManager(provisioner)

        const result = await manager.sessionsWithoutInstance([session({id: 's-1', instanceId: 'i-1'})])

        expect(result).toEqual([])
    })

    it('reports only sessions whose instance is missing', async () => {
        const provisioner = {
            instanceStatus: async instance => instance.id === 'i-2' ? 'MISSING' : 'PROVISIONED',
        }
        const manager = makeManager(provisioner)

        const s1 = session({id: 's-1', instanceId: 'i-1'})
        const s2 = session({id: 's-2', instanceId: 'i-2'})
        const result = await manager.sessionsWithoutInstance([s1, s2])

        expect(result).toEqual([{session: s2, status: 'MISSING'}])
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
        const provisioner = {provisionInstance: jest.fn(async () => {})}
        const manager = makeManager(provisioner)

        expect(await manager.reprovisionInstance(pendingSession)).toBe(true)
        expect(provisioner.provisionInstance).toHaveBeenCalledTimes(1)
        const provisioned = provisioner.provisionInstance.mock.calls[0][0]
        expect(provisioned.id).toBe('i-1')
        expect(provisioned.reservation.sessionId).toBe('s-1')
    })

    // Releasing hands the instance back to the pool, so its provisioning entry must go with it:
    // the next session allocated the same instance would otherwise have its provision dropped as
    // a duplicate of a provision nobody is waiting for any more, and the reconcile sweep would
    // skip it too, until the session times out unprovisioned.
    test('a released instance is provisioned again for the session that gets it next', async () => {
        const started = []
        const provisioner = {
            provisionInstance: jest.fn(() => new Promise(resolve => started.push(resolve))),
            undeploy: jest.fn(async () => {}),
        }
        const instance = {
            id: 'i-1',
            type: 'T3aSmall',
            host: '10.0.0.1',
            reservation: {username: 'alice', workerType: 'sandbox', sessionId: 's-1'},
        }
        const claims = {release: jest.fn(async () => true)}
        const provider = {
            getInstance: jest.fn(async () => instance),
            release: jest.fn(async () => {}),
            terminate: jest.fn(async () => {}),
            attachScratchVolume: jest.fn(async () => null),
            deleteScratchVolume: jest.fn(async () => {}),
        }
        const manager = createInstanceManager({claims, provider, provisioner, instanceTypes: []})

        const first = manager.reprovisionInstance(pendingSession)
        expect(manager.isProvisioning('i-1')).toBe(true)

        await manager.releaseInstance('i-1')
        expect(manager.isProvisioning('i-1')).toBe(false)

        const successor = {...pendingSession, id: 's-2', username: 'bob'}
        const second = manager.reprovisionInstance(successor)
        await new Promise(resolve => setImmediate(resolve))
        expect(provisioner.provisionInstance).toHaveBeenCalledTimes(2)
        expect(provisioner.provisionInstance.mock.calls[1][0].reservation.sessionId).toBe('s-2')

        // The abandoned provision settling must not take the successor's entry with it.
        started[0]()
        expect(await first).toBe(true)
        expect(manager.isProvisioning('i-1')).toBe(true)

        started[1]()
        expect(await second).toBe(true)
    })

    // The sweep re-entering an in-flight provision would delete the containers it is creating.
    test('is dropped while the same instance is already being provisioned', async () => {
        let release
        const provisioner = {
            provisionInstance: jest.fn(() => new Promise(resolve => {
                release = resolve
            })),
        }
        const manager = makeManager(provisioner)

        const running = manager.reprovisionInstance(pendingSession)
        expect(manager.isProvisioning('i-1')).toBe(true)
        expect(await manager.reprovisionInstance(pendingSession)).toBe(false)
        expect(provisioner.provisionInstance).toHaveBeenCalledTimes(1)

        release()
        await running
        expect(manager.isProvisioning('i-1')).toBe(false)
    })
})
