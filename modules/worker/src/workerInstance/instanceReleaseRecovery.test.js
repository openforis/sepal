import assert from 'node:assert/strict'
import {test} from 'node:test'

import {DescribeInstancesCommand, EC2Client, TerminateInstancesCommand} from '@aws-sdk/client-ec2'
import {mockClient} from 'aws-sdk-client-mock'

import {createAwsInstanceProvider} from '../hostingService/aws/awsInstanceProvider.js'
import {createInstanceManager} from './instanceManager.js'

for (const failure of ['InvalidInstanceID.NotFound', 'TimeoutError', 'UnauthorizedOperation', 'claim read']) {
    test(`a claimless reserved orphan recovers on the next sweep after ${failure}`, async context => {
        const {manager, provider, claims, ec2, allowReads} = recoveryScenario(context, failure)

        await manager.releaseUnusedInstances([], 5, 'MINUTES')

        assert.equal(manager.isProvisioning(INSTANCE_ID), false)
        assert.deepEqual(await claims.all(), [])
        assert.equal(ec2.commandCalls(TerminateInstancesCommand).length, 0)
        allowReads()
        await manager.releaseUnusedInstances([], 5, 'MINUTES')

        assert.deepEqual(await provider.reservedInstances(), [])
        assert.equal(await claims.sessionIdForInstance(INSTANCE_ID), SESSION_ID)
        assert.deepEqual(ec2.commandCalls(TerminateInstancesCommand).map(call => call.args[0].input), [
            {InstanceIds: [INSTANCE_ID]},
        ])
        await manager.reclaimStaleClaims([], 0)
        assert.deepEqual(await claims.all(), [])
        assert.equal(manager.isProvisioning(INSTANCE_ID), false)
    })
}

const INSTANCE_ID = 'i-0123456789abcdef0'
const SESSION_ID = 's-orphan'

const recoveryScenario = (context, failure) => {
    const ec2 = mockClient(EC2Client)
    context.after(() => ec2.restore())
    let readsFail = true
    let live = true
    const owners = new Map()
    const lookupError = Object.assign(new Error('Ownership read unavailable'), {name: failure})
    ec2.on(DescribeInstancesCommand).callsFake(input => {
        if (input.InstanceIds && readsFail && failure !== 'claim read') throw lookupError
        const reserved = input.InstanceIds || input.Filters?.some(filter => filter.Name === 'tag:State' && filter.Values.includes('reserved'))
        return {Reservations: [{Instances: live && reserved ? [awsInstance()] : []}]}
    })
    ec2.on(TerminateInstancesCommand).callsFake(() => {
        live = false
        return {}
    })
    const provider = createAwsInstanceProvider({
        region: 'eu-central-1', availabilityZone: 'eu-central-1a', environment: 'test',
        workerAmiVersion: 'test', accessKey: 'test', secretKey: 'test',
    })
    const claims = {
        all: async () => [...owners].map(([instanceId, sessionId]) => ({instanceId, sessionId, claimedAt: new Date(0)})),
        sessionIdForInstance: async instanceId => {
            if (readsFail && failure === 'claim read') throw lookupError
            return owners.get(instanceId) ?? null
        },
        claim: async (instanceId, sessionId) => {
            if (owners.has(instanceId)) return false
            owners.set(instanceId, sessionId)
            return true
        },
        release: async (instanceId, sessionId) => {
            if (owners.get(instanceId) !== sessionId) return false
            return owners.delete(instanceId)
        },
    }
    const manager = createInstanceManager({claims, provider, provisioner: {undeploy: async () => {}}, instanceTypes: []})
    return {manager, provider, claims, ec2, allowReads: () => { readsFail = false }}
}

const awsInstance = () => ({
    InstanceId: INSTANCE_ID, InstanceType: 't3a.small', State: {Name: 'running'},
    LaunchTime: new Date(0), PublicIpAddress: '127.0.0.1',
    Tags: [
        {Key: 'State', Value: 'reserved'}, {Key: 'Type', Value: 'Worker'},
        {Key: 'Environment', Value: 'test'}, {Key: 'Version', Value: 'test'},
        {Key: 'Username', Value: 'orphan'}, {Key: 'WorkerType', Value: 'sandbox'},
        {Key: 'SessionId', Value: SESSION_ID},
    ],
})
