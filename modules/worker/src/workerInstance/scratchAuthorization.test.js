import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

import {
    AttachVolumeCommand,
    CreateVolumeCommand,
    DescribeInstancesCommand,
    DescribeVolumesCommand,
    EC2Client,
    ModifyInstanceAttributeCommand,
    TerminateInstancesCommand,
} from '@aws-sdk/client-ec2'
import {mockClient} from 'aws-sdk-client-mock'

import {createAwsInstanceProvider} from '../hostingService/aws/awsInstanceProvider.js'
import {createWorkerSessionApiKey} from '../workerSession/workerSessionApiKey.js'
import {createDockerInstanceProvisioner} from './dockerInstanceProvisioner.js'
import {instanceEvents} from './events.js'
import {createWorkerInstanceComponent} from './index.js'
import {createApiKeyRetryWrapper} from './sandboxSessionApiKey.js'

test('a late closed-session launch cannot allocate scratch before its missing key is rejected', async context => {
    const apiKey = {apiKeyForSession: mock.fn(async () => null)}
    const {manager, instance, launch, ec2, dockerMethods} = scenario(context, apiKey)

    await manager.releaseInstance(instance.id, instance.reservation.sessionId, {retire: true})
    launch()
    await flush()

    assert.equal(ec2.commandCalls(CreateVolumeCommand).length, 0)
    assert.equal(ec2.commandCalls(AttachVolumeCommand).length, 0)
    assert.deepEqual(dockerMethods.filter(method => method !== 'GET'), [])
    assert.equal(apiKey.apiKeyForSession.mock.callCount(), 1)
})

test('a launch arriving before its session row commits still attaches scratch and activates', {timeout: 5000}, async context => {
    let committed = false
    const retry = createApiKeyRetryWrapper(createWorkerSessionApiKey({
        sessionOnInstance: async () => committed ? {id: SESSION_ID, apiKey: 'session-key'} : null,
    }), {_sleep: async () => { committed = true }})
    const apiKey = {apiKeyForSession: mock.fn(retry.apiKeyForSession)}
    const {manager, instance, launch, ec2} = scenario(context, apiKey)
    const activated = Promise.withResolvers()
    manager.onInstanceActivated(activated.resolve)

    launch()
    const result = await activated.promise

    assert.equal(result.id, instance.id)
    assert.equal(apiKey.apiKeyForSession.mock.callCount(), 1)
    assert.equal(ec2.commandCalls(CreateVolumeCommand).length, 1)
    assert.equal(ec2.commandCalls(AttachVolumeCommand).length, 1)
})

const INSTANCE_ID = 'i-0123456789abcdef0'
const SESSION_ID = 's-alice'

const scenario = (context, apiKey) => {
    const ec2 = mockClient(EC2Client)
    context.mock.timers.enable({apis: ['setTimeout']})
    const originalFetch = globalThis.fetch
    const dockerMethods = []
    let terminated = false
    let attached = false
    ec2.on(DescribeInstancesCommand).resolves({Reservations: [{Instances: [{
        InstanceId: INSTANCE_ID, InstanceType: 't3a.small', State: {Name: 'running'},
        PublicIpAddress: '127.0.0.1', LaunchTime: new Date(0), BlockDeviceMappings: [],
        Tags: [
            {Key: 'State', Value: 'reserved'}, {Key: 'SessionId', Value: SESSION_ID},
            {Key: 'Username', Value: 'alice'}, {Key: 'WorkerType', Value: 'sandbox'},
        ],
    }]}]})
    ec2.on(TerminateInstancesCommand).callsFake(() => { terminated = true; return {} })
    ec2.on(CreateVolumeCommand).resolves({VolumeId: 'vol-new'})
    ec2.on(DescribeVolumesCommand).callsFake(() => ({Volumes: [{VolumeId: 'vol-new', State: attached ? 'in-use' : 'available'}]}))
    ec2.on(AttachVolumeCommand).callsFake(() => {
        if (terminated) throw Object.assign(new Error('Instance is gone'), {name: 'InvalidInstanceID.NotFound'})
        attached = true
        return {}
    })
    ec2.on(ModifyInstanceAttributeCommand).resolves({})
    globalThis.fetch = async (url, options) => {
        dockerMethods.push(options?.method ?? 'GET')
        if (url.includes('/containers/json')) return response([])
        if (url.endsWith('/wait')) return response({StatusCode: 0})
        return response({Id: 'docker-resource'})
    }
    const provider = createAwsInstanceProvider({
        region: 'eu-central-1', availabilityZone: 'eu-central-1a', environment: 'test',
        workerAmiVersion: 'test', accessKey: 'test', secretKey: 'test',
    })
    let launched
    provider.onInstanceLaunched = listener => { launched = listener }
    const provisioner = createDockerInstanceProvisioner({
        config: {dockerPort: 2375, dockerEntryPoint: 'v1.44', sepalHostDataDir: '/data'},
        instanceTypes: [{id: 'T3aSmall', ramBytes: 2 ** 31, devices: []}],
        sandboxSessionApiKey: apiKey, userPublicKeys: {publicKey: async () => ''},
    })
    const claims = {sessionIdForInstance: async () => SESSION_ID, release: async () => true}
    const {instanceManager: manager} = createWorkerInstanceComponent({claims, provider, provisioner, instanceTypes: []})
    const instance = {
        id: INSTANCE_ID, type: 'T3aSmall', host: '127.0.0.1', running: true,
        reservation: {username: 'alice', workerType: 'sandbox', sessionId: SESSION_ID},
    }
    context.after(async () => {
        if (manager.isProvisioning(INSTANCE_ID)) {
            await manager.releaseInstance(INSTANCE_ID, SESSION_ID, {retire: true})
        }
        context.mock.timers.tick(1000)
        await flush()
        ec2.restore()
        globalThis.fetch = originalFetch
        instanceEvents.removeAllListeners()
    })
    return {manager, instance, ec2, dockerMethods, launch: () => launched(instance)}
}

const flush = () => new Promise(resolve => setImmediate(resolve))
const response = body => ({ok: true, status: 200, text: async () => JSON.stringify(body)})
