// instanceManager.sessionsWithoutInstance must hand the provisioner a RECONSTRUCTED
// WorkerInstance (id, type, host, reservation: {username, workerType}), not the session's
// {id, host} projection: dockerInstanceProvisioner reads instance.reservation.workerType, so a
// bare projection makes the probe throw → every healthy session gets closed as "without
// instance".

import {jest} from '@jest/globals'

import {createInstanceManager} from './instanceManager.js'

const session = ({id, instanceId, host = 'host-1'}) => ({
    id,
    username: 'admin',
    workerType: 'SANDBOX',
    instanceType: 'T3aSmall',
    instance: {id: instanceId, host},
})

const makeManager = provisioner =>
    createInstanceManager({repo: {}, provider: {}, provisioner, instanceTypes: []})

describe('removeOrphanedContainers', () => {
    const instance = id => ({id, type: 'T3aSmall', host: id, reservation: null})

    it('passes session instance ids plus every provider-tracked instance id to the provisioner', async () => {
        const provisioner = {removeOrphanedContainers: jest.fn(async () => [])}
        const provider = {
            idleInstances: async () => [instance('i-idle')],
            reservedInstances: async () => [instance('i-reserved')],
        }
        const manager = createInstanceManager({repo: {}, provider, provisioner, instanceTypes: []})

        await manager.removeOrphanedContainers([session({id: 's-1', instanceId: 'i-1'})])

        expect(provisioner.removeOrphanedContainers).toHaveBeenCalledWith(['i-1', 'i-idle', 'i-reserved'])
    })

    it('skips sessions without an instance and returns the removed container names', async () => {
        const provisioner = {removeOrphanedContainers: jest.fn(async () => ['/sandbox.admin.bbb'])}
        const provider = {
            idleInstances: async () => [],
            reservedInstances: async () => [],
        }
        const manager = createInstanceManager({repo: {}, provider, provisioner, instanceTypes: []})

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
            reservation: {username: 'admin', workerType: 'SANDBOX'},
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
