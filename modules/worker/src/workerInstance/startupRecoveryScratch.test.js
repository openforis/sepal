import assert from 'node:assert/strict'
import {test} from 'node:test'

import {
    AttachVolumeCommand,
    CreateTagsCommand,
    CreateVolumeCommand,
    DeleteVolumeCommand,
    DescribeInstancesCommand,
    DescribeVolumesCommand,
    DetachVolumeCommand,
    EC2Client,
    ModifyInstanceAttributeCommand,
    StopInstancesCommand,
    TerminateInstancesCommand,
} from '@aws-sdk/client-ec2'
import {mockClient} from 'aws-sdk-client-mock'

import {createAwsInstanceProvider} from '../hostingService/aws/awsInstanceProvider.js'
import {createDockerInstanceProvisioner} from './dockerInstanceProvisioner.js'
import {instanceEvents} from './events.js'
import {createWorkerInstanceComponent} from './index.js'

test('stopped cancellation deletes attached scratch before returning the warmed host to the pool', async context => {
    const scenario = aScenario(context)
    const instance = await scenario.manager.requestInstance(SESSION)
    await scenario.dockerRead.promise

    await scenario.manager.releaseInstance(instance.id, SESSION.id, MANUAL_CANCEL)
    await scenario.released.promise

    assert.deepEqual(scenario.actions, ['stop', 'detach', 'delete', 'pool', 'unclaim'])
    assert.equal(scenario.attached(), false)
    assert.equal(scenario.owner(), null)
    assert.equal(scenario.ec2.commandCalls(TerminateInstancesCommand).length, 0)
})

test('a missing expected scratch mapping retires the host without releasing its claim', async context => {
    const scenario = aScenario(context)
    const instance = await scenario.manager.requestInstance(SESSION)
    await scenario.dockerRead.promise
    scenario.hideMapping()

    await scenario.manager.releaseInstance(instance.id, SESSION.id, MANUAL_CANCEL)
    await scenario.retired.promise
    await new Promise(resolve => setImmediate(resolve))

    assert.equal(scenario.ec2.commandCalls(TerminateInstancesCommand).length, 1)
    assert.equal(scenario.owner(), SESSION.id)
    assert.deepEqual(scenario.actions, ['stop'])
})

const SESSION = {id: 's-alice', username: 'alice', workerType: 'sandbox', instanceType: 'T3aSmall'}
const INSTANCE_ID = 'i-0123456789abcdef0'
const MANUAL_CANCEL = {retire: true, recoverStartup: true}

const aScenario = context => {
    const ec2 = mockClient(EC2Client)
    const dockerRead = Promise.withResolvers()
    const resumeRead = Promise.withResolvers()
    const released = Promise.withResolvers()
    const retired = Promise.withResolvers()
    const actions = []
    let attached = false
    let hidden = false
    let owner = null
    let state = 'running'
    const tags = {Type: 'Worker', Environment: 'test', Version: 'test', State: 'idle', ImageDiskWarm: 'true'}
    ec2.on(DescribeInstancesCommand).callsFake(() => ({Reservations: [{Instances: [{
        InstanceId: INSTANCE_ID, InstanceType: 't3a.small', State: {Name: state},
        PublicIpAddress: '127.0.0.1', LaunchTime: new Date(0),
        Tags: Object.entries(tags).map(([Key, Value]) => ({Key, Value})),
        BlockDeviceMappings: attached && !hidden ? [{DeviceName: '/dev/xvdg', Ebs: {VolumeId: 'vol-scratch'}}] : [],
    }]}]}))
    ec2.on(CreateTagsCommand).callsFake(({Tags}) => {
        for (const {Key, Value} of Tags) tags[Key] = Value
        if (Tags.some(tag => tag.Key === 'State' && tag.Value === 'pooled')) actions.push('pool')
        return {}
    })
    ec2.on(CreateVolumeCommand).resolves({VolumeId: 'vol-scratch'})
    ec2.on(DescribeVolumesCommand).callsFake(() => ({Volumes: [{VolumeId: 'vol-scratch', State: attached ? 'in-use' : 'available'}]}))
    ec2.on(AttachVolumeCommand).callsFake(() => { attached = true; return {} })
    ec2.on(ModifyInstanceAttributeCommand).resolves({})
    ec2.on(DetachVolumeCommand).callsFake(() => { actions.push('detach'); attached = false; return {} })
    ec2.on(DeleteVolumeCommand).callsFake(() => { actions.push('delete'); return {} })
    ec2.on(StopInstancesCommand).callsFake(() => {
        if (state !== 'stopped') actions.push('stop')
        state = 'stopped'
        return {}
    })
    ec2.on(TerminateInstancesCommand).callsFake(() => { retired.resolve(); return {} })
    const provider = createAwsInstanceProvider({
        region: 'eu-central-1', availabilityZone: 'eu-central-1a', environment: 'test',
        workerAmiVersion: 'test', accessKey: 'test', secretKey: 'test',
    })
    const claims = {
        claim: async (_id, sessionId) => {
            if (owner !== null) return false
            owner = sessionId
            return true
        },
        sessionIdForInstance: async () => owner,
        startRecovery: async (_id, sessionId) => owner === sessionId,
        finishRecovery: async () => {},
        release: async (_id, sessionId) => {
            if (owner !== sessionId) return false
            actions.push('unclaim')
            owner = null
            released.resolve()
            return true
        },
    }
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => {
        dockerRead.resolve()
        await resumeRead.promise
        return {ok: true, status: 200, text: async () => '[]'}
    }
    const provisioner = createDockerInstanceProvisioner({
        config: {dockerPort: 2375, dockerEntryPoint: 'v1.44', sepalHostDataDir: '/data'},
        instanceTypes: [{id: 'T3aSmall', ramBytes: 2 ** 31, devices: []}],
        sandboxSessionApiKey: {apiKeyForSession: async () => 'session-key'},
        userPublicKeys: {publicKey: async () => ''},
    })
    const {instanceManager: manager} = createWorkerInstanceComponent({claims, provider, provisioner, instanceTypes: []})
    context.after(async () => {
        resumeRead.resolve()
        await new Promise(resolve => setImmediate(resolve))
        globalThis.fetch = originalFetch
        ec2.restore()
        instanceEvents.removeAllListeners()
    })
    return {manager, ec2, actions, dockerRead, released, retired, owner: () => owner, attached: () => attached, hideMapping: () => { hidden = true }}
}
