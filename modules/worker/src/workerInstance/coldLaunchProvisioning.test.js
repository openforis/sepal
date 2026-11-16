import assert from 'node:assert/strict'
import {test} from 'node:test'

import {
    CreateTagsCommand,
    DescribeImagesCommand,
    DescribeInstancesCommand,
    EC2Client,
    RunInstancesCommand,
} from '@aws-sdk/client-ec2'
import {mockClient} from 'aws-sdk-client-mock'

import {createAwsInstanceProvider} from '../hostingService/aws/awsInstanceProvider.js'
import {instanceEvents} from './events.js'
import {createWorkerInstanceComponent} from './index.js'

test('a delayed AWS started-instance poll provisions a cold launch only once', async context => {
    const {manager, provisionedSessions} = coldLaunchScenario(context)

    await manager.requestInstance(SESSION)
    await flush()
    context.mock.timers.tick(10_000)
    await flush()

    assert.deepEqual(provisionedSessions, [SESSION.id])
    assert.equal(manager.isProvisioning(INSTANCE_ID), false)

    context.mock.timers.tick(10_000)
    await flush()
    assert.deepEqual(provisionedSessions, [SESSION.id])
})

const INSTANCE_ID = 'i-0123456789abcdef0'
const SESSION = {id: 's-alice', username: 'alice', workerType: 'sandbox', instanceType: 'M6idLarge'}
const flush = () => new Promise(resolve => setImmediate(resolve))

const coldLaunchScenario = context => {
    const ec2 = mockClient(EC2Client)
    context.mock.timers.enable({apis: ['setTimeout', 'setInterval']})
    let instance = null
    const owners = new Map()
    const provisionedSessions = []
    ec2.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-test'}]})
    ec2.on(RunInstancesCommand).callsFake(() => {
        instance = {
            InstanceId: INSTANCE_ID, InstanceType: 'm6id.large', PublicIpAddress: '127.0.0.1',
            State: {Name: 'running'}, LaunchTime: new Date(0), Tags: [],
        }
        return {Instances: [{...instance}]}
    })
    ec2.on(CreateTagsCommand).callsFake(({Tags}) => {
        const tags = new Map(instance.Tags.map(({Key, Value}) => [Key, Value]))
        for (const {Key, Value} of Tags) tags.set(Key, Value)
        instance.Tags = [...tags].map(([Key, Value]) => ({Key, Value}))
        return {}
    })
    ec2.on(DescribeInstancesCommand).callsFake(({Filters = [], InstanceIds}) => {
        const matches = instance && (!InstanceIds || InstanceIds.includes(instance.InstanceId))
            && Filters.every(({Name, Values}) => Name.startsWith('tag:')
                ? Values.includes(instance.Tags.find(({Key}) => Key === Name.slice(4))?.Value)
                : Name === 'instance-state-name' && Values.includes(instance.State.Name))
        return {Reservations: [{Instances: matches ? [instance] : []}]}
    })
    const provider = createAwsInstanceProvider({
        workerAmiVersion: 'test', region: 'eu-central-1', availabilityZone: 'eu-central-1a',
        environment: 'test', accessKey: 'test', secretKey: 'test',
    }, {instanceTypes: [{id: SESSION.instanceType, name: 'm6id.large', ssdGB: 118}]})
    const claims = {
        claim: async (instanceId, sessionId) => {
            if (owners.has(instanceId)) return false
            owners.set(instanceId, sessionId)
            return true
        },
        sessionIdForInstance: async instanceId => owners.get(instanceId) ?? null,
    }
    const provisioner = {
        provisionInstance: async instance => { provisionedSessions.push(instance.reservation.sessionId) },
    }
    const {instanceManager: manager} = createWorkerInstanceComponent({claims, provider, provisioner, instanceTypes: []})
    context.before(() => provider.start())
    context.after(() => {
        provider.stop()
        ec2.restore()
        instanceEvents.removeAllListeners()
    })
    return {manager, provisionedSessions}
}
