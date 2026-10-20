import assert from 'node:assert/strict'
import fs from 'node:fs'
import {afterEach, beforeEach, describe, test} from 'node:test'
import {isDeepStrictEqual} from 'node:util'

import {
    AttachVolumeCommand,
    CreateTagsCommand,
    CreateVolumeCommand,
    DeleteVolumeCommand,
    DescribeImagesCommand,
    DescribeInstancesCommand,
    DescribeVolumesCommand,
    DetachVolumeCommand,
    EC2Client,
    ModifyInstanceAttributeCommand,
    RunInstancesCommand,
    StartInstancesCommand,
    StopInstancesCommand,
    TerminateInstancesCommand,
} from '@aws-sdk/client-ec2'
import {mockClient} from 'aws-sdk-client-mock'

import {assertMatches} from '#sepal/testSupport/assert'

import {instanceName} from '../../instanceName.js'
import {INSTANCE_TYPES} from '../instanceTypes.js'
import {
    createAwsInstanceProvider,
    createInstanceTypeCodec,
    idleTags,
    launchTags,
    mkFilter,
    reserveTags,
} from './awsInstanceProvider.js'

const CONFIG = {
    workerAmiVersion: '5.0.0',
    region: 'eu-central-1',
    availabilityZone: 'eu-central-1a',
    environment: 'test-env',
    accessKey: 'AKIATEST',
    secretKey: 'secret',
}

const RESERVATION = {username: 'alice', workerType: 'SANDBOX'}

const makeAwsInstance = (overrides = {}) => ({
    InstanceId: 'i-0123456789abcdef0',
    InstanceType: 't3a.small',
    PublicIpAddress: '1.2.3.4',
    State: {Name: 'running'},
    LaunchTime: new Date().toISOString(),
    Tags: [
        {Key: 'State', Value: 'idle'},
        {Key: 'Username', Value: ''},
        {Key: 'WorkerType', Value: ''},
        {Key: 'Type', Value: 'Worker'},
        {Key: 'Environment', Value: 'test-env'},
        {Key: 'Version', Value: '5.0.0'},
    ],
    ...overrides,
})

// RunInstances answers BEFORE CreateTags runs, so its instances carry no tags. Never stub a
// RunInstances response with makeAwsInstance() — that is what hid the launchIdle reservation bug.
const makeRunInstancesResponse = (overrides = {}) => ({
    Instances: [makeAwsInstance({Tags: undefined, State: {Name: 'pending'}, PublicIpAddress: undefined, ...overrides})],
})

// A stopped instance has no public address; Version overrides the tag, since only it varies.
const makePooledAwsInstance = ({Version = '5.0.0', ...overrides} = {}) => makeAwsInstance({
    State: {Name: 'stopped'},
    PublicIpAddress: undefined,
    Tags: [
        {Key: 'State', Value: 'pooled'},
        {Key: 'Username', Value: ''},
        {Key: 'WorkerType', Value: ''},
        {Key: 'Type', Value: 'Worker'},
        {Key: 'Environment', Value: 'test-env'},
        {Key: 'Version', Value: Version},
    ],
    ...overrides,
})

const describeResponse = instances => ({
    Reservations: [{Instances: instances}],
})

const emptyDescribeResponse = () => ({Reservations: []})

// The provider's public surface speaks catalog IDS ("T3aSmall"); EC2 speaks NAMES ("t3a.small").
// Getting this backwards breaks every AWS deployment: RunInstances rejects an id, the
// `instance-type` filter matches nothing, and an instance read back with a name-shaped `type`
// misses sizeIdlePool's id-keyed target map and dockerInstanceProvisioner's instanceTypeById.
describe('instance-type id ↔ EC2 name translation', () => {
    const codec = createInstanceTypeCodec(INSTANCE_TYPES)

    test('catalog id → EC2 name', () => {
        assert.equal(codec.toAwsName('T3aSmall'), 't3a.small')
        assert.equal(codec.toAwsName('M6a12xlarge'), 'm6a.12xlarge')
        assert.equal(codec.toAwsName('G512xlarge'), 'g5.12xlarge')
    })

    test('EC2 name → catalog id', () => {
        assert.equal(codec.toCatalogId('t3a.small'), 'T3aSmall')
        assert.equal(codec.toCatalogId('m6a.12xlarge'), 'M6a12xlarge')
        assert.equal(codec.toCatalogId('g5.12xlarge'), 'G512xlarge')
    })

    test('every catalog id round-trips back to itself', () => {
        for (const {id} of INSTANCE_TYPES) {
            assert.equal(codec.toCatalogId(codec.toAwsName(id)), id)
        }
    })

    test('unknown values pass through untouched in both directions', () => {
        assert.equal(codec.toAwsName('NotInCatalog'), 'NotInCatalog')
        assert.equal(codec.toCatalogId('x9.42xlarge'), 'x9.42xlarge')
    })
})

describe('launchTags', () => {
    test('contains Environment, Type=Worker, Version, Starting=true', () => {
        const tags = launchTags('test-env', '5.0.0')
        assert.ok(
            tags.some(item => isDeepStrictEqual(item, {Key: 'Environment', Value: 'test-env'}))
        )
        assert.ok(tags.some(item => isDeepStrictEqual(item, {Key: 'Type', Value: 'Worker'})))
        assert.ok(
            tags.some(item => isDeepStrictEqual(item, {Key: 'Version', Value: '5.0.0'}))
        )
        assert.ok(
            tags.some(item => isDeepStrictEqual(item, {Key: 'Starting', Value: 'true'}))
        )
        assert.equal(tags.length, 4)
    })
})

describe('idleTags', () => {
    test('contains State=idle, Username="", WorkerType="", InStateSince, Name with Idle worker', () => {
        const tags = idleTags('test-env')
        assert.ok(tags.some(item => isDeepStrictEqual(item, {Key: 'State', Value: 'idle'})))
        assert.ok(tags.some(item => isDeepStrictEqual(item, {Key: 'Username', Value: ''})))
        assert.ok(tags.some(item => isDeepStrictEqual(item, {Key: 'WorkerType', Value: ''})))
        const name = tags.find(t => t.Key === 'Name')
        assert.notEqual(name, undefined)
        assert.equal(name.Value, 'test-env: Idle worker')
        const inState = tags.find(t => t.Key === 'InStateSince')
        assert.notEqual(inState, undefined)
        assert.equal(tags.length, 5)
    })
})

describe('reserveTags', () => {
    test('contains State=reserved, Username, WorkerType, InStateSince, Name with env+type+user+instance name', () => {
        const tags = reserveTags('test-env', {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'})
        assert.ok(
            tags.some(item => isDeepStrictEqual(item, {Key: 'State', Value: 'reserved'}))
        )
        assert.ok(
            tags.some(item => isDeepStrictEqual(item, {Key: 'Username', Value: 'alice'}))
        )
        assert.ok(
            tags.some(item => isDeepStrictEqual(item, {Key: 'WorkerType', Value: 'SANDBOX'}))
        )
        const name = tags.find(t => t.Key === 'Name')
        assert.notEqual(name, undefined)
        assert.equal(name.Value, `test-env: SANDBOX, alice, ${instanceName('s-42')}`)
        assert.equal(tags.length, 6)
    })

    // The name an operator reads in the console has to be the one the user quotes back at them.
    test('Name field carries the same two-word name as the container', () => {
        const tags = reserveTags('prod', {username: 'bob', workerType: 'SANDBOX', sessionId: 's-7'})
        const name = tags.find(t => t.Key === 'Name')
        assert.equal(name.Value.endsWith(`, ${instanceName('s-7')}`), true)
    })

    test('Name field falls back to "{env}: {workerType}, {username}" without a session id', () => {
        const tags = reserveTags('prod', {username: 'bob', workerType: 'sandbox'})
        const name = tags.find(t => t.Key === 'Name')
        assert.equal(name.Value, 'prod: sandbox, bob')
    })
})

// The container is named after the session, and on AWS the reservation is rebuilt from EC2 tags
// after a worker restart. Untagged, the session id would not survive that — and the provisioner
// could no longer name (or find) the container it created.
describe('session id survives the EC2 tag round-trip', () => {
    // mkTag stringifies, so a missing id would tag the literal "undefined" — which reads back as a
    // truthy session id and yields a confident, wrong container name instead of a loud failure.
    test('never tags the literal "undefined" for a missing session id', () => {
        const tags = reserveTags('test-env', {username: 'alice', workerType: 'SANDBOX'})
        const sessionId = tags.find(t => t.Key === 'SessionId')
        assert.notEqual(sessionId?.Value, 'undefined')
    })

    test('reserveTags carries the session id', () => {
        const tags = reserveTags('test-env', {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'})
        assert.ok(
            tags.some(item => isDeepStrictEqual(item, {Key: 'SessionId', Value: 's-42'}))
        )
    })
})

describe('mkFilter', () => {
    test('builds {Name, Values} shape', () => {
        const f = mkFilter('tag:State', 'idle')
        assert.deepEqual(f, {Name: 'tag:State', Values: ['idle']})
    })

    test('wraps a single value in an array', () => {
        const f = mkFilter('instance-state-name', 'running')
        assert.deepEqual(f.Values, ['running'])
    })

    test('passes array values through', () => {
        const f = mkFilter('instance-state-name', ['pending', 'running'])
        assert.deepEqual(f.Values, ['pending', 'running'])
    })
})

describe('launch params (RunInstancesCommand)', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    // RunInstances answers with a Reservation ITSELF, so the instances are top-level. Read from a
    // `Reservation` key instead, every launch resolved to [] and launchReserved threw a TypeError
    // on undefined.InstanceId three frames away, naming neither EC2 nor the instance type.
    test('reads the launched instances from the top level of the response', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-test123'}]})
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        const launched = await provider.launchIdle('T3aSmall', 1)
        provider.stop()

        assert.deepEqual(launched.map(i => i.id), ['i-0123456789abcdef0'])
    })

    test('throws FailedToLaunchInstance when EC2 returns no instances', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-test123'}]})
        ec2Mock.on(RunInstancesCommand).resolves({})
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        await assert.rejects(
            provider.launchReserved('T3aSmall', RESERVATION),
            /FailedToLaunchInstance.*t3a\.small/
        )
        provider.stop()
    })

    test('RunInstancesCommand uses correct params for launchIdle', async () => {
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        ec2Mock.on(DescribeImagesCommand).resolves({
            Images: [{ImageId: 'ami-test123'}],
        })
        await provider.start()

        ec2Mock.reset()
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        await provider.launchIdle('T3aSmall', 3)
        provider.stop()

        const runCalls = ec2Mock.commandCalls(RunInstancesCommand)
        assert.equal(runCalls.length, 1)
        const input = runCalls[0].args[0].input
        assert.equal(input.InstanceType, 't3a.small')
        assert.deepEqual(input.SecurityGroups, ['Sandbox'])
        assert.equal(input.MinCount, 3)
        assert.equal(input.MaxCount, 3)
        assert.equal(input.KeyName, 'eu-central-1')
        assert.deepEqual(input.Placement, {AvailabilityZone: 'eu-central-1a'})
        assert.equal(input.ImageId, 'ami-test123')
    })

    test('launches without volume overrides when no initialization rate is configured', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-test123'}]})
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        await provider.launchReserved('T3aSmall', RESERVATION)
        provider.stop()

        const [runCall] = ec2Mock.commandCalls(RunInstancesCommand)
        assert.equal(runCall.args[0].input.BlockDeviceMappings, undefined)
    })

    test('initializes both AMI volumes at the configured rate', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-test123'}]})
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider({...CONFIG, volumeInitializationRate: 300})
        await provider.start()

        await provider.launchIdle('T3aSmall', 1)
        provider.stop()

        const [runCall] = ec2Mock.commandCalls(RunInstancesCommand)
        assert.deepEqual(runCall.args[0].input.BlockDeviceMappings, [
            {DeviceName: '/dev/xvda', Ebs: {VolumeInitializationRate: 300}},
            {DeviceName: '/dev/xvdf', Ebs: {VolumeInitializationRate: 300}},
        ])
    })

    test('idle instances boot without user data unless prewarming is enabled', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-test123'}]})
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        await provider.launchIdle('T3aSmall', 1)
        provider.stop()

        const [runCall] = ec2Mock.commandCalls(RunInstancesCommand)
        assert.equal(runCall.args[0].input.UserData, undefined)
    })

    test('idle instances boot with the volume prewarm script as user data when enabled', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-test123'}]})
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider({...CONFIG, prewarmIdleVolumes: true})
        await provider.start()

        await provider.launchIdle('T3aSmall', 1)
        provider.stop()

        const [runCall] = ec2Mock.commandCalls(RunInstancesCommand)
        const userData = Buffer.from(runCall.args[0].input.UserData, 'base64').toString()
        assert.equal(
            userData,
            fs.readFileSync(new URL('./prewarmVolume.sh', import.meta.url), 'utf8')
        )
    })

    test('reserved instances boot without user data even when prewarming is enabled', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-test123'}]})
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider({...CONFIG, prewarmIdleVolumes: true})
        await provider.start()

        await provider.launchReserved('T3aSmall', RESERVATION)
        provider.stop()

        const [runCall] = ec2Mock.commandCalls(RunInstancesCommand)
        assert.equal(runCall.args[0].input.UserData, undefined)
    })

    test('CreateTagsCommand is called with launch+idle tags for launchIdle', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({
            Images: [{ImageId: 'ami-abc'}],
        })
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse({InstanceId: 'i-launch1'}))

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        ec2Mock.reset()
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse({InstanceId: 'i-launch1'}))
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        await provider.launchIdle('T3aSmall', 1)
        provider.stop()

        const tagCalls = ec2Mock.commandCalls(CreateTagsCommand)
        assert.ok(tagCalls.length >= 1)
        const firstTagInput = tagCalls[0].args[0].input
        assert.deepEqual(firstTagInput.Resources, ['i-launch1'])
        const keys = firstTagInput.Tags.map(t => t.Key)
        assert.ok(keys.includes('Environment'))
        assert.ok(keys.includes('Type'))
        assert.ok(keys.includes('Version'))
        assert.ok(keys.includes('Starting'))
        assert.ok(keys.includes('State'))
        assert.ok(keys.includes('Username'))
        assert.ok(keys.includes('WorkerType'))
        const stateTag = firstTagInput.Tags.find(t => t.Key === 'State')
        assert.equal(stateTag.Value, 'idle')
    })

    // RunInstances answers BEFORE the tags exist — this provider tags in a separate CreateTags
    // call — so the instances launchIdle builds from that answer carry no State tag. A stub that
    // hands back tags here would be unfaithful to EC2 and would hide the real bug this regression
    // test once caught: toWorkerInstance reading the missing tag as reserved-by-nobody instead of
    // idle.
    test('launchIdle returns idle instances even though RunInstances answers untagged', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-abc'}]})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse({InstanceId: 'i-pool1'}))

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        const [instance] = await provider.launchIdle('T3aSmall', 1)
        provider.stop()

        assert.equal(instance.reservation, null)
    })
})

describe('launchReserved', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('returns instance immediately when RunInstances returns a public IP', async () => {
        // When the launched instance already has a public IP in the RunInstances response,
        // no polling is needed (host != null → loop doesn't run).
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-poll'}]})
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [{
                InstanceId: 'i-immediate',
                InstanceType: 't3a.small',
                PublicIpAddress: '5.6.7.8',
                State: {Name: 'running'},
                LaunchTime: new Date().toISOString(),
                Tags: [],
            }],
        })

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        ec2Mock.reset()
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [{
                InstanceId: 'i-immediate',
                InstanceType: 't3a.small',
                PublicIpAddress: '5.6.7.8',
                State: {Name: 'running'},
                LaunchTime: new Date().toISOString(),
                Tags: [],
            }],
        })

        const inst = await provider.launchReserved('T3aSmall', RESERVATION)
        provider.stop()

        assert.equal(inst.host, '5.6.7.8')
        assert.deepEqual(inst.reservation, RESERVATION)
        // The catalog id round-trips: launchReserved takes an id and returns an id.
        assert.equal(inst.type, 'T3aSmall')
        const describeCalls = ec2Mock.commandCalls(DescribeInstancesCommand)
        assert.ok(describeCalls.length <= 1)
    })

    // launchReserved must NOT wait for the address: the caller records the claim that protects the
    // instance from ReleaseUnusedInstances, and only then calls awaitHost. Waiting here kept the
    // instance reserved, unclaimed and sessionless for the whole boot.
    test('returns as soon as the instance is tagged, leaving the address to awaitHost', {
        timeout: 10_000
    }, async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-poll'}]})
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [{
                InstanceId: 'i-poll2',
                InstanceType: 't3a.small',
                PublicIpAddress: null,  // no IP yet
                State: {Name: 'pending'},
                LaunchTime: new Date().toISOString(),
                Tags: [],
            }],
        })

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()
        ec2Mock.reset()
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([{
            InstanceId: 'i-poll2',
            InstanceType: 't3a.small',
            PublicIpAddress: '9.8.7.6',
            State: {Name: 'running'},
            LaunchTime: new Date().toISOString(),
            Tags: [{Key: 'State', Value: 'reserved'}, {Key: 'Username', Value: 'alice'}, {Key: 'WorkerType', Value: 'SANDBOX'}],
        }]))
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [{
                InstanceId: 'i-poll2',
                InstanceType: 't3a.small',
                PublicIpAddress: null,
                State: {Name: 'pending'},
                LaunchTime: new Date().toISOString(),
                Tags: [],
            }],
        })

        const inst = await provider.launchReserved('T3aSmall', RESERVATION)
        const describeCallsBeforeAwait = ec2Mock.commandCalls(DescribeInstancesCommand).length
        // The re-read awaitHost does derives the reservation from tags, which carry no SessionId —
        // the caller re-pins its own reservation afterwards.
        const ready = await provider.awaitHost(inst)
        provider.stop()

        assert.equal(inst.host, null)
        assert.deepEqual(inst.reservation, RESERVATION)
        assert.equal(describeCallsBeforeAwait, 0)
        assert.equal(ready.host, '9.8.7.6')
    })
})

describe('idleInstances — type filter', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('idleInstances(type) sends instance-type filter in DescribeInstances', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.idleInstances('T3aSmall')

        const calls = ec2Mock.commandCalls(DescribeInstancesCommand)
        const idleCall = calls[0]
        const filters = idleCall.args[0].input.Filters
        assert.notEqual(filters, undefined)
        const typeFilter = filters.find(f => f.Name === 'instance-type')
        assert.notEqual(typeFilter, undefined)
        assert.deepEqual(typeFilter.Values, ['t3a.small'])
    })

    test('idleInstances(type) includes State=idle filter', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.idleInstances('T3aSmall')

        const calls = ec2Mock.commandCalls(DescribeInstancesCommand)
        const idleCall = calls[0]
        const filters = idleCall.args[0].input.Filters
        const stateFilter = filters.find(f => f.Name === 'tag:State')
        assert.notEqual(stateFilter, undefined)
        assert.ok(stateFilter.Values.includes('idle'))
    })

    test('returned instances carry the catalog id as `type`, not the EC2 name', async () => {
        // sizeIdlePool groups by instance.type against an id-keyed target map, and
        // dockerInstanceProvisioner looks up instanceTypeById[instance.type]; a name here makes
        // both miss — the idle pool would be terminated every cycle and provisioning would throw.
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([makeAwsInstance()]))

        const provider = createAwsInstanceProvider(CONFIG)
        const instances = await provider.idleInstances('T3aSmall')

        assert.equal(instances.length, 1)
        assert.equal(instances[0].type, 'T3aSmall')
    })

    test('idleInstances() without type arg omits instance-type filter', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.idleInstances()

        const calls = ec2Mock.commandCalls(DescribeInstancesCommand)
        const idleCall = calls[0]
        const filters = idleCall.args[0].input.Filters
        const typeFilter = filters ? filters.find(f => f.Name === 'instance-type') : undefined
        assert.equal(typeFilter, undefined)
    })
})

// A deploy that reuses an earlier AMI moves the version back, and instances launched from a later
// AMI lack that version's sandbox image: every version but the current one is stale.
describe('idleInstances — version', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('leaves out idle instances of any version but the current one', async () => {
        const idleOfVersion = (InstanceId, version) => makeAwsInstance({
            InstanceId,
            Tags: [
                {Key: 'State', Value: 'idle'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: version},
            ],
        })
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([
            idleOfVersion('i-older', '4.0.0'),
            idleOfVersion('i-current', CONFIG.workerAmiVersion),
            idleOfVersion('i-newer', '6.0.0'),
        ]))
        const provider = createAwsInstanceProvider(CONFIG)

        const instances = await provider.idleInstances()

        assert.deepEqual(instances.map(({id}) => id), ['i-current'])
    })
})

describe('reads are free of side effects', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('idleInstances issues one DescribeInstances and terminates nothing', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-abc'}]})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()
        ec2Mock.reset()
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(TerminateInstancesCommand).resolves({})

        await provider.idleInstances('T3aSmall')
        provider.stop()

        assert.equal(ec2Mock.commandCalls(DescribeInstancesCommand).length, 1)
        assert.equal(ec2Mock.commandCalls(TerminateInstancesCommand).length, 0)
    })

    // The sweep is level-triggered by necessity: an untagged instance is one whose CreateTags
    // never ran, so there is no event to hang the work on.
    test('sweep terminates an idle instance of an older version', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-abc'}]})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()
        ec2Mock.reset()
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([
            makeAwsInstance({
                InstanceId: 'i-old',
                Tags: [
                    {Key: 'State', Value: 'idle'},
                    {Key: 'Type', Value: 'Worker'},
                    {Key: 'Environment', Value: 'test-env'},
                    {Key: 'Version', Value: '4.0.0'},
                ],
            }),
        ]))
        ec2Mock.on(TerminateInstancesCommand).resolves({})

        await provider.sweep()
        provider.stop()

        const terminated = ec2Mock.commandCalls(TerminateInstancesCommand)
        assert.ok(terminated.length >= 1)
        assert.deepEqual(terminated[0].args[0].input.InstanceIds, ['i-old'])
    })
})

describe('scratch volume', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    const withScratchVolume = volumeId => ({
        BlockDeviceMappings: [
            {DeviceName: '/dev/xvda', Ebs: {VolumeId: 'vol-root'}},
            {DeviceName: '/dev/xvdf', Ebs: {VolumeId: 'vol-docker'}},
            {DeviceName: '/dev/xvdg', Ebs: {VolumeId: volumeId}},
        ],
    })
    const instance = {id: 'i-0123456789abcdef0', type: 'M6aXlarge'}
    const commands = () => ec2Mock.calls().map(call => call.args[0])
    const indexOf = type => commands().findIndex(command => command instanceof type)

    test('attaches a new volume to an instance without local SSD and resolves its device', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([makeAwsInstance()]))
        ec2Mock.on(CreateVolumeCommand).resolves({VolumeId: 'vol-new'})
        ec2Mock.on(DescribeVolumesCommand)
            .resolvesOnce({Volumes: [{VolumeId: 'vol-new', State: 'available'}]})
            .resolves({Volumes: [{VolumeId: 'vol-new', State: 'in-use'}]})
        ec2Mock.on(AttachVolumeCommand).resolves({})
        ec2Mock.on(ModifyInstanceAttributeCommand).resolves({})

        const device = await createAwsInstanceProvider(CONFIG).attachScratchVolume(instance)

        assert.equal(device, '/dev/xvdg')
        const [create] = ec2Mock.commandCalls(CreateVolumeCommand)
        assertMatches(create.args[0].input, {
            AvailabilityZone: 'eu-central-1a',
            Size: 100,
            VolumeType: 'gp3',
            TagSpecifications: [{ResourceType: 'volume', Tags: [
                {Key: 'Type', Value: 'WorkerScratch'},
                {Key: 'Environment', Value: 'test-env'},
            ]}],
        })
        const [attach] = ec2Mock.commandCalls(AttachVolumeCommand)
        assert.deepEqual(
            attach.args[0].input,
            {InstanceId: instance.id, VolumeId: 'vol-new', Device: '/dev/xvdg'}
        )
        const [modify] = ec2Mock.commandCalls(ModifyInstanceAttributeCommand)
        assert.deepEqual(modify.args[0].input, {
            InstanceId: instance.id,
            BlockDeviceMappings: [{DeviceName: '/dev/xvdg', Ebs: {DeleteOnTermination: true}}],
        })
        assert.ok(indexOf(AttachVolumeCommand) < indexOf(ModifyInstanceAttributeCommand))
    })

    test('resolves no device for an instance type with local SSD', async () => {
        const device = await createAwsInstanceProvider(CONFIG).attachScratchVolume({...instance, type: 'M6idXlarge'})

        assert.equal(device, null)
        assert.equal(ec2Mock.calls().length, 0)
    })

    // A provisioning retry: the previous attempt attached the volume and failed later.
    test('reuses a volume already attached', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([makeAwsInstance(withScratchVolume('vol-1'))]))

        const device = await createAwsInstanceProvider(CONFIG).attachScratchVolume(instance)

        assert.equal(device, '/dev/xvdg')
        assert.equal(ec2Mock.commandCalls(CreateVolumeCommand).length, 0)
    })

    test('deleteScratchVolume detaches the volume, then deletes it', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([makeAwsInstance(withScratchVolume('vol-1'))]))
        ec2Mock.on(DetachVolumeCommand).resolves({})
        ec2Mock.on(DescribeVolumesCommand).resolves({Volumes: [{VolumeId: 'vol-1', State: 'available'}]})
        ec2Mock.on(DeleteVolumeCommand).resolves({})

        await createAwsInstanceProvider(CONFIG).deleteScratchVolume(instance.id)

        const [detach] = ec2Mock.commandCalls(DetachVolumeCommand)
        assert.deepEqual(detach.args[0].input, {InstanceId: instance.id, VolumeId: 'vol-1'})
        assert.deepEqual(
            ec2Mock.commandCalls(DeleteVolumeCommand).map(c => c.args[0].input),
            [{VolumeId: 'vol-1'}]
        )
        assert.ok(indexOf(DetachVolumeCommand) < indexOf(DeleteVolumeCommand))
    })

    test('deleteScratchVolume does nothing without a volume', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([makeAwsInstance()]))

        await createAwsInstanceProvider(CONFIG).deleteScratchVolume(instance.id)

        assert.equal(ec2Mock.commandCalls(DetachVolumeCommand).length, 0)
    })

    test('sweep deletes detached scratch volumes older than ten minutes', async () => {
        const minutesAgo = m => new Date(Date.now() - m * 60_000).toISOString()
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(DescribeVolumesCommand).resolves({Volumes: [
            {VolumeId: 'vol-orphan', State: 'available', CreateTime: minutesAgo(60)},
            {VolumeId: 'vol-attaching', State: 'available', CreateTime: minutesAgo(2)},
        ]})
        ec2Mock.on(DeleteVolumeCommand).resolves({})

        await createAwsInstanceProvider(CONFIG).sweep()

        const [describe] = ec2Mock.commandCalls(DescribeVolumesCommand)
        assert.deepEqual(describe.args[0].input.Filters, [
            {Name: 'tag:Type', Values: ['WorkerScratch']},
            {Name: 'tag:Environment', Values: ['test-env']},
            {Name: 'status', Values: ['available']},
        ])
        assert.deepEqual(
            ec2Mock.commandCalls(DeleteVolumeCommand).map(c => c.args[0].input),
            [{VolumeId: 'vol-orphan'}]
        )
    })
})

describe('stopped pool', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    const PREWARM_SCRIPT = fs.readFileSync(new URL('./prewarmVolume.sh', import.meta.url), 'utf8')

    test('pooledInstances counts every pooled instance of the current version, as unreserved', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([
            makePooledAwsInstance({InstanceId: 'i-current'}),
            makePooledAwsInstance({InstanceId: 'i-old', Version: '4.0.0'}),
        ]))
        const provider = createAwsInstanceProvider(CONFIG)

        const pooled = await provider.pooledInstances()

        assert.deepEqual(
            pooled.map(({id, reservation}) => ({id, reservation})),
            [{id: 'i-current', reservation: null}]
        )
        const filters = ec2Mock.commandCalls(DescribeInstancesCommand)[0].args[0].input.Filters
        assert.ok(
            filters.some(item => isDeepStrictEqual(item, {Name: 'tag:State', Values: ['pooled']}))
        )
        assert.ok(filters.some(item => isDeepStrictEqual(
            item,
            {Name: 'instance-state-name', Values: ['pending', 'running', 'stopping', 'stopped']}
        )))
    })

    test('pooledInstances leaves out pooled instances of a newer version', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([
            makePooledAwsInstance({InstanceId: 'i-current'}),
            makePooledAwsInstance({InstanceId: 'i-newer', Version: '6.0.0'}),
        ]))
        const provider = createAwsInstanceProvider(CONFIG)

        const pooled = await provider.pooledInstances()

        assert.deepEqual(pooled.map(({id}) => id), ['i-current'])
    })

    test('pooledInstances({ready: true}) asks only for stopped instances', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        const provider = createAwsInstanceProvider(CONFIG)

        await provider.pooledInstances({ready: true})

        const filters = ec2Mock.commandCalls(DescribeInstancesCommand)[0].args[0].input.Filters
        assert.ok(filters.some(
            item => isDeepStrictEqual(item, {Name: 'instance-state-name', Values: ['stopped']})
        ))
    })

    test('launchPooled warm-up launches T3aSmall instances that read their disk and stop themselves', async () => {
        const provider = await startedProvider()
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse({InstanceId: 'i-warm'}))
        ec2Mock.on(CreateTagsCommand).resolves({})

        await provider.launchPooled(2)

        const run = ec2Mock.commandCalls(RunInstancesCommand)[0].args[0].input
        const userData = Buffer.from(run.UserData, 'base64').toString()
        assert.partialDeepStrictEqual(
            run,
            {InstanceType: 't3a.small', MinCount: 2, MaxCount: 2, InstanceInitiatedShutdownBehavior: 'stop'}
        )
        assert.equal(userData.startsWith(PREWARM_SCRIPT), true)
        assert.equal(userData.trimEnd().split('\n').pop(), 'poweroff')
        const tags = ec2Mock.commandCalls(CreateTagsCommand).flatMap(c => c.args[0].input.Tags)
        assert.ok(
            tags.some(item => isDeepStrictEqual(item, {Key: 'State', Value: 'pooled'}))
        )
        assert.ok(
            !tags.some(item => isDeepStrictEqual(item, {Key: 'Starting', Value: 'true'}))
        )
    })

    test('pool tags an instance pooled before stopping it', async () => {
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(StopInstancesCommand).resolves({})
        const provider = createAwsInstanceProvider(CONFIG)

        await provider.pool('i-released')

        const [tag, stop] = ec2Mock.calls().map(call => call.args[0])
        assert.ok(tag instanceof CreateTagsCommand)
        assert.ok(
            tag.input.Tags.some(item => isDeepStrictEqual(item, {Key: 'State', Value: 'pooled'}))
        )
        assert.ok(
            tag.input.Tags.some(item => isDeepStrictEqual(item, {Key: 'Username', Value: ''}))
        )
        assert.ok(stop instanceof StopInstancesCommand)
        assert.deepEqual(stop.input.InstanceIds, ['i-released'])
    })

    // Tagged only once started: a stopped instance tagged reserved would be released to a stopped
    // idle instance that no query sees. Never Starting=true: the request provisions the instance
    // itself, and the started-instance poll would provision it a second time.
    test('startPooled changes the type, starts the instance, then tags the reservation', async () => {
        ec2Mock.on(ModifyInstanceAttributeCommand).resolves({})
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(StartInstancesCommand).resolves({})
        const provider = createAwsInstanceProvider(CONFIG)
        const pooled = (await pooledInstanceFrom(provider))
        const reservation = {...RESERVATION, sessionId: 's-42'}

        const started = await provider.startPooled(pooled, 'M6aXlarge', reservation)

        const [modify, start, tag] = ec2Mock.calls().map(call => call.args[0])
            .filter(command => !(command instanceof DescribeInstancesCommand))
        assert.deepEqual(
            modify.input,
            {InstanceId: 'i-pooled', InstanceType: {Value: 'm6a.xlarge'}}
        )
        assert.ok(
            tag.input.Tags.some(item => isDeepStrictEqual(item, {Key: 'State', Value: 'reserved'}))
        )
        assert.ok(
            tag.input.Tags.some(item => isDeepStrictEqual(item, {Key: 'SessionId', Value: 's-42'}))
        )
        assert.ok(
            !tag.input.Tags.some(item => isDeepStrictEqual(item, {Key: 'Starting', Value: 'true'}))
        )
        assert.deepEqual(start.input.InstanceIds, ['i-pooled'])
        assert.partialDeepStrictEqual(started, {id: 'i-pooled', type: 'M6aXlarge', host: null, reservation})
    })

    test('a failed start leaves the instance in the pool and rethrows', async () => {
        ec2Mock.on(ModifyInstanceAttributeCommand).resolves({})
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(StartInstancesCommand).rejects(new Error('InsufficientInstanceCapacity'))
        const provider = createAwsInstanceProvider(CONFIG)
        const pooled = await pooledInstanceFrom(provider)

        await assert.rejects(
            provider.startPooled(pooled, 'M6aXlarge', RESERVATION),
            /InsufficientInstanceCapacity/
        )

        assert.equal(ec2Mock.commandCalls(CreateTagsCommand).length, 0)
    })

    describe('sweep', () => {
        const hoursAgo = h => new Date(Date.now() - h * 3_600_000).toISOString()

        const sweepTerminating = async pooled => {
            ec2Mock.on(DescribeInstancesCommand).callsFake(input =>
                (input.Filters ?? []).some(f => f.Name === 'instance-state-name' && f.Values.includes('stopped'))
                    ? describeResponse(pooled)
                    : emptyDescribeResponse())
            ec2Mock.on(TerminateInstancesCommand).resolves({})
            await createAwsInstanceProvider(CONFIG).sweep()
            return ec2Mock.commandCalls(TerminateInstancesCommand).flatMap(c => c.args[0].input.InstanceIds)
        }

        test('terminates stopped pooled instances of an older version', async () => {
            const terminated = await sweepTerminating([makePooledAwsInstance({InstanceId: 'i-old', Version: '4.0.0'})])

            assert.deepEqual(terminated, ['i-old'])
        })

        test('terminates stopped pooled instances of a newer version', async () => {
            const terminated = await sweepTerminating([makePooledAwsInstance({InstanceId: 'i-newer', Version: '6.0.0'})])

            assert.deepEqual(terminated, ['i-newer'])
        })

        // A warm-up whose script never powered it off, or a pooling whose StopInstances failed.
        test('terminates a pooled instance still running an hour after its start', async () => {
            const terminated = await sweepTerminating([makePooledAwsInstance({
                InstanceId: 'i-stuck', State: {Name: 'running'}, LaunchTime: hoursAgo(1.5),
            })])

            assert.deepEqual(terminated, ['i-stuck'])
        })

        // Only the pool keeps instances stopped. A stopped reserved or idle instance — a start EC2
        // accepted and then failed, or an AWS-initiated stop — is invisible to every other query.
        test('terminates stopped worker instances outside the pool', async () => {
            const terminated = await sweepTerminating([
                makePooledAwsInstance({InstanceId: 'i-stopped-reserved', Tags: [
                    {Key: 'State', Value: 'reserved'},
                    {Key: 'Type', Value: 'Worker'},
                    {Key: 'Environment', Value: 'test-env'},
                    {Key: 'Version', Value: '5.0.0'},
                ]}),
            ])

            assert.deepEqual(terminated, ['i-stopped-reserved'])
        })

        test('keeps warming and stopped pooled instances of the current version', async () => {
            const terminated = await sweepTerminating([
                makePooledAwsInstance({InstanceId: 'i-warming', State: {Name: 'running'}, LaunchTime: hoursAgo(0.5)}),
                makePooledAwsInstance({InstanceId: 'i-ready', LaunchTime: hoursAgo(48)}),
            ])

            assert.deepEqual(terminated, [])
        })
    })

    // start() is only needed for the AMI id a launch sends; its polling is stopped straight away.
    const startedProvider = async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-test123'}]})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()
        provider.stop()
        ec2Mock.reset()
        return provider
    }

    const pooledInstanceFrom = async provider => {
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([makePooledAwsInstance({InstanceId: 'i-pooled'})]))
        const [pooled] = await provider.pooledInstances({ready: true})
        return pooled
    }
})

describe('awaitHost', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('returns an instance that already has an address without calling EC2', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-abc'}]})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()
        ec2Mock.reset()

        const instance = {id: 'i-ready', type: 'T3aSmall', host: '1.2.3.4', reservation: null}
        assert.equal(await provider.awaitHost(instance), instance)
        assert.equal(ec2Mock.commandCalls(DescribeInstancesCommand).length, 0)
        provider.stop()
    })

    test('polls until the address appears', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-abc'}]})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()
        ec2Mock.reset()
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([
            makeAwsInstance({InstanceId: 'i-booting', PublicIpAddress: '5.6.7.8'}),
        ]))

        const ready = await provider.awaitHost({
            id: 'i-booting', type: 'T3aSmall', host: null, reservation: null,
        })
        provider.stop()

        assert.equal(ready.host, '5.6.7.8')
    })
})

describe('terminateOldIdle', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('terminates idle instances with older Version tag', async () => {
        const oldIdleInstance = makeAwsInstance({
            InstanceId: 'i-old-idle',
            Tags: [
                {Key: 'State', Value: 'idle'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: '1.0.0'},  // older than CONFIG.workerAmiVersion=5.0.0
            ],
        })

        let terminateCallCount = 0
        ec2Mock.on(DescribeInstancesCommand).callsFake(input => {
            const filters = input.Filters ?? []
            const hasTypeFilter = filters.some(f => f.Name === 'tag:Type')
            if (!hasTypeFilter) {
                return emptyDescribeResponse()
            }
            return describeResponse([oldIdleInstance])
        })
        ec2Mock.on(TerminateInstancesCommand).callsFake(() => {
            terminateCallCount++
            return {TerminatingInstances: []}
        })

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.sweep()

        assert.ok(terminateCallCount >= 1)
        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        assert.ok(terminatedIds.includes('i-old-idle'))
    })

    test('terminates idle instances with a newer Version tag', async () => {
        const newerIdleInstance = makeAwsInstance({
            InstanceId: 'i-newer-idle',
            Tags: [
                {Key: 'State', Value: 'idle'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: '6.0.0'},
            ],
        })
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([newerIdleInstance]))
        ec2Mock.on(TerminateInstancesCommand).resolves({TerminatingInstances: []})

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.sweep()

        const terminatedIds = ec2Mock.commandCalls(TerminateInstancesCommand).flatMap(c => c.args[0].input.InstanceIds)
        assert.ok(terminatedIds.includes('i-newer-idle'))
    })

    test('does not terminate idle instances with current version', async () => {
        const currentIdleInstance = makeAwsInstance({
            InstanceId: 'i-current-idle',
            Tags: [
                {Key: 'State', Value: 'idle'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: '5.0.0'},  // same as CONFIG.workerAmiVersion
            ],
        })

        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([currentIdleInstance]))
        ec2Mock.on(TerminateInstancesCommand).resolves({TerminatingInstances: []})

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.sweep()

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        assert.ok(!terminatedIds.includes('i-current-idle'))
    })

    test('does not terminate reserved instances even if version is old', async () => {
        const oldReservedInstance = makeAwsInstance({
            InstanceId: 'i-old-reserved',
            Tags: [
                {Key: 'State', Value: 'reserved'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: '1.0.0'},
                {Key: 'Username', Value: 'bob'},
                {Key: 'WorkerType', Value: 'SANDBOX'},
            ],
        })

        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([oldReservedInstance]))
        ec2Mock.on(TerminateInstancesCommand).resolves({TerminatingInstances: []})

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.sweep()

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        assert.ok(!terminatedIds.includes('i-old-reserved'))
    })
})

describe('terminateUntagged', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('terminates running untagged instances older than 1 minute', async () => {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString()
        const untaggedOldInstance = {
            InstanceId: 'i-untagged-old',
            InstanceType: 't3a.small',
            PublicIpAddress: '1.2.3.4',
            State: {Name: 'running'},
            LaunchTime: twoMinutesAgo,
            Tags: [],
        }

        ec2Mock.on(DescribeInstancesCommand).callsFake(input => {
            const filters = input.Filters ?? []
            const hasTypeFilter = filters.some(f => f.Name === 'tag:Type')
            if (!hasTypeFilter) {
                return describeResponse([untaggedOldInstance])
            }
            return emptyDescribeResponse()
        })
        ec2Mock.on(TerminateInstancesCommand).resolves({TerminatingInstances: []})

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.sweep()

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        assert.ok(terminatedIds.includes('i-untagged-old'))
    })

    test('does NOT terminate running untagged instances younger than 1 minute', async () => {
        const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString()
        const untaggedNewInstance = {
            InstanceId: 'i-untagged-new',
            InstanceType: 't3a.small',
            PublicIpAddress: '1.2.3.4',
            State: {Name: 'running'},
            LaunchTime: thirtySecondsAgo,
            Tags: [],
        }

        ec2Mock.on(DescribeInstancesCommand).callsFake(input => {
            const filters = input.Filters ?? []
            const hasTypeFilter = filters.some(f => f.Name === 'tag:Type')
            if (!hasTypeFilter) {
                return describeResponse([untaggedNewInstance])
            }
            return emptyDescribeResponse()
        })
        ec2Mock.on(TerminateInstancesCommand).resolves({TerminatingInstances: []})

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.sweep()

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        assert.ok(!terminatedIds.includes('i-untagged-new'))
    })

    test('does NOT terminate tagged running instances', async () => {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString()
        const taggedInstance = makeAwsInstance({
            InstanceId: 'i-tagged',
            LaunchTime: twoMinutesAgo,
        })

        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([taggedInstance]))
        ec2Mock.on(TerminateInstancesCommand).resolves({TerminatingInstances: []})

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.sweep()

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        assert.ok(!terminatedIds.includes('i-tagged'))
    })
})

// terminateOldIdle / terminateUntagged are best-effort: a terminate failure during sweep must
// NOT reject sweep() itself, and a plain read taken afterwards still returns the survivors — the
// error is swallowed and logged. A caller-initiated terminate() MUST still reject after all
// retries fail.
describe('best-effort auto-cleanup — cleanup failure does not reject sweep', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('sweep() resolves, and idleInstances() still returns the survivor, when terminateOldIdle always fails', {
        timeout: 15_000
    }, async () => {
        const oldIdle = makeAwsInstance({
            InstanceId: 'i-old-cleanup',
            Tags: [
                {Key: 'State', Value: 'idle'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: '1.0.0'},  // older → will be auto-terminated
            ],
        })
        const currentIdle = makeAwsInstance({
            InstanceId: 'i-current-idle',
            Tags: [
                {Key: 'State', Value: 'idle'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: '5.0.0'},
            ],
        })

        ec2Mock.on(DescribeInstancesCommand).callsFake(input => {
            const filters = input.Filters ?? []
            const hasTypeFilter = filters.some(f => f.Name === 'tag:Type')
            if (hasTypeFilter) {
                return describeResponse([oldIdle, currentIdle])
            }
            return emptyDescribeResponse()
        })
        ec2Mock.on(TerminateInstancesCommand).rejects(new Error('terminate throttle'))

        const provider = createAwsInstanceProvider(CONFIG)

        assert.equal(await provider.sweep(), undefined)
        const result = await provider.idleInstances()
        const found = result.find(i => i.id === 'i-current-idle')
        assert.notEqual(found, undefined)
    })

    test('sweep() resolves, and reservedInstances() still returns the survivor, when terminateUntagged always fails', {
        timeout: 15_000
    }, async () => {
        const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString()
        const untaggedOld = {
            InstanceId: 'i-untagged-cleanup',
            InstanceType: 't3a.small',
            PublicIpAddress: '1.2.3.4',
            State: {Name: 'running'},
            LaunchTime: twoMinutesAgo,
            Tags: [],
        }
        const reservedInst = makeAwsInstance({
            InstanceId: 'i-res-survives',
            Tags: [
                {Key: 'State', Value: 'reserved'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: '5.0.0'},
                {Key: 'Username', Value: 'alice'},
                {Key: 'WorkerType', Value: 'SANDBOX'},
            ],
        })

        ec2Mock.on(DescribeInstancesCommand).callsFake(input => {
            const filters = input.Filters ?? []
            const hasTypeFilter = filters.some(f => f.Name === 'tag:Type')
            if (hasTypeFilter) {
                return describeResponse([reservedInst])
            }
            return describeResponse([untaggedOld])
        })
        ec2Mock.on(TerminateInstancesCommand).rejects(new Error('terminate throttle'))

        const provider = createAwsInstanceProvider(CONFIG)

        assert.equal(await provider.sweep(), undefined)
        const result = await provider.reservedInstances()
        const found = result.find(i => i.id === 'i-res-survives')
        assert.notEqual(found, undefined)
        assert.deepEqual(
            found.reservation,
            {username: 'alice', workerType: 'SANDBOX', sessionId: null}
        )
    })

    test('caller-initiated terminate() DOES reject after all retries fail', {
        timeout: 15_000
    }, async () => {
        ec2Mock.on(TerminateInstancesCommand).rejects(new Error('persistent failure'))

        const provider = createAwsInstanceProvider(CONFIG)

        await assert.rejects(provider.terminate('i-caller-fail'), /persistent failure/)
    })
})

describe('terminate retry(2)', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('retries up to 3 total attempts on TerminateInstancesCommand failure', {
        timeout: 15_000
    }, async () => {
        let callCount = 0
        ec2Mock.on(TerminateInstancesCommand).callsFake(() => {
            callCount++
            throw new Error('EC2 throttle')
        })

        const provider = createAwsInstanceProvider(CONFIG)

        await assert.rejects(provider.terminate('i-fail'), /EC2 throttle/)
        // retry(2) loop: retries = 0, 1, 2 → 3 total attempts
        assert.equal(callCount, 3)
    })  // allow time for exponential backoff (1s + 2s = 3s)

    test('succeeds on second attempt if first fails', {
        timeout: 5_000
    }, async () => {
        let callCount = 0
        ec2Mock.on(TerminateInstancesCommand).callsFake(() => {
            callCount++
            if (callCount === 1) throw new Error('transient')
            return {TerminatingInstances: []}
        })

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.terminate('i-retry-ok')
        assert.equal(callCount, 2)
    })
})

describe('tagInstance retry(4)', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('terminates instance and throws FailedToTagInstance when all 5 tag attempts fail', {
        timeout: 60_000
    }, async () => {
        let tagCallCount = 0
        let terminateCallCount = 0

        ec2Mock.on(CreateTagsCommand).callsFake(() => {
            tagCallCount++
            throw new Error('tagging failed')
        })
        ec2Mock.on(TerminateInstancesCommand).callsFake(() => {
            terminateCallCount++
            return {TerminatingInstances: []}
        })
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse({InstanceId: 'i-tag-fail'}))

        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-x'}]})

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        ec2Mock.reset()
        ec2Mock.on(CreateTagsCommand).callsFake(() => {
            tagCallCount++
            throw new Error('tagging failed')
        })
        ec2Mock.on(TerminateInstancesCommand).callsFake(() => {
            terminateCallCount++
            return {TerminatingInstances: []}
        })
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(RunInstancesCommand).resolves(makeRunInstancesResponse({InstanceId: 'i-tag-fail'}))

        tagCallCount = 0
        terminateCallCount = 0

        await assert.rejects(provider.launchIdle('T3aSmall', 1), /FailedToTagInstance/)
        provider.stop()

        // retry(4) = 5 total attempts
        assert.equal(tagCallCount, 5)
        assert.equal(terminateCallCount, 1)
    })  // Allow for exponential backoff across 5 attempts (up to ~31s)
})

describe('fetchImageId', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('throws UnableToGetImageId when no images found', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: []})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await assert.rejects(provider.start(), /UnableToGetImageId/)
        provider.stop()
    })

    test('sends DescribeImagesCommand with correct version and region filters', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-filter-test'}]})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()
        provider.stop()

        const imageCalls = ec2Mock.commandCalls(DescribeImagesCommand)
        assert.equal(imageCalls.length, 1)
        const filters = imageCalls[0].args[0].input.Filters
        assert.ok(
            filters.some(item => isDeepStrictEqual(item, {Name: 'tag:Version', Values: ['5.0.0']}))
        )
        assert.ok(filters.some(
            item => isDeepStrictEqual(item, {Name: 'tag:Region', Values: ['eu-central-1']})
        ))
    })

    test('constructing the provider does NOT issue any AWS calls (lazy init)', () => {
        ec2Mock.on(DescribeImagesCommand).rejects(new Error('should not be called'))
        ec2Mock.on(DescribeInstancesCommand).rejects(new Error('should not be called'))

        assert.doesNotThrow(() => createAwsInstanceProvider(CONFIG))

        const imageCalls = ec2Mock.commandCalls(DescribeImagesCommand)
        const describeCalls = ec2Mock.commandCalls(DescribeInstancesCommand)
        assert.equal(imageCalls.length, 0)
        assert.equal(describeCalls.length, 0)
    })
})

describe('restore', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    // Restoring is a local-provider concern. EC2 already answers correctly the moment the worker
    // comes back, and a restore that issued calls here would spend a DescribeInstances round trip
    // per open session on every boot.
    test('restore is a no-op that issues no EC2 calls', async () => {
        const provider = createAwsInstanceProvider(CONFIG, {instanceTypes: INSTANCE_TYPES})

        await provider.restore([{id: 'i-1'}])

        assert.equal(ec2Mock.calls().length, 0)
    })
})

describe('reservedInstances', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('sends State=reserved filter', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.reservedInstances()

        const calls = ec2Mock.commandCalls(DescribeInstancesCommand)
        const mainCall = calls[0]
        const filters = mainCall.args[0].input.Filters
        const stateFilter = filters.find(f => f.Name === 'tag:State')
        assert.notEqual(stateFilter, undefined)
        assert.ok(stateFilter.Values.includes('reserved'))
    })

    test('a reserved instance is rebuilt with its session id', async () => {
        const reservedInst = makeAwsInstance({
            InstanceId: 'i-res-session',
            Tags: [
                {Key: 'State', Value: 'reserved'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: '5.0.0'},
                {Key: 'Username', Value: 'alice'},
                {Key: 'WorkerType', Value: 'SANDBOX'},
                {Key: 'SessionId', Value: 's-42'},
            ],
        })
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([reservedInst]))

        const provider = createAwsInstanceProvider(CONFIG)
        const found = (await provider.reservedInstances()).find(i => i.id === 'i-res-session')

        assert.deepEqual(
            found.reservation,
            {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'}
        )
    })

    test('returns WorkerInstance objects with reservation set', async () => {
        const reservedInst = makeAwsInstance({
            InstanceId: 'i-res1',
            Tags: [
                {Key: 'State', Value: 'reserved'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: '5.0.0'},
                {Key: 'Username', Value: 'charlie'},
                {Key: 'WorkerType', Value: 'sandbox'},
            ],
        })

        // Route describe calls: main query (has tag:Type filter) → reserved instance;
        // terminateUntagged describe (running filter only, no tag:Type) → empty.
        // This ensures the reserved instance is not confused with untagged cleanup.
        ec2Mock.on(DescribeInstancesCommand).callsFake(input => {
            const filters = input.Filters ?? []
            const hasTypeFilter = filters.some(f => f.Name === 'tag:Type')
            if (hasTypeFilter) {
                return describeResponse([reservedInst])
            }
            return emptyDescribeResponse()
        })

        const provider = createAwsInstanceProvider(CONFIG)
        const instances = await provider.reservedInstances()

        const found = instances.find(i => i.id === 'i-res1')
        assert.notEqual(found, undefined)
        assert.equal(found.id, 'i-res1')
        assert.equal(found.type, 'T3aSmall')
        assert.deepEqual(
            found.reservation,
            {username: 'charlie', workerType: 'sandbox', sessionId: null}
        )
    })
})
