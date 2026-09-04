import {
    CreateTagsCommand,
    DescribeImagesCommand,
    DescribeInstancesCommand,
    EC2Client,
    RunInstancesCommand,
    TerminateInstancesCommand,
} from '@aws-sdk/client-ec2'
import {mockClient} from 'aws-sdk-client-mock'

import {AWS_INSTANCE_TYPES} from '../instanceTypes.js'
import {
    createAwsInstanceProvider,
    createInstanceTypeCodec,
    idleTags,
    isOlderVersion,
    launchTags,
    mkFilter,
    reserveTags,
} from './awsInstanceProvider.js'

const CONFIG = {
    sepalVersion: '5.0.0',
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

const describeResponse = instances => ({
    Reservations: [{Instances: instances}],
})

const emptyDescribeResponse = () => ({Reservations: []})

// The provider's public surface speaks catalog IDS ("T3aSmall"); EC2 speaks NAMES ("t3a.small").
// Getting this backwards breaks every AWS deployment: RunInstances rejects an id, the
// `instance-type` filter matches nothing, and an instance read back with a name-shaped `type`
// misses sizeIdlePool's id-keyed target map and dockerInstanceProvisioner's instanceTypeById.
describe('instance-type id ↔ EC2 name translation', () => {
    const codec = createInstanceTypeCodec(AWS_INSTANCE_TYPES)

    test('catalog id → EC2 name', () => {
        expect(codec.toAwsName('T3aSmall')).toBe('t3a.small')
        expect(codec.toAwsName('M6a12xlarge')).toBe('m6a.12xlarge')
        expect(codec.toAwsName('G512xlarge')).toBe('g5.12xlarge')
    })

    test('EC2 name → catalog id', () => {
        expect(codec.toCatalogId('t3a.small')).toBe('T3aSmall')
        expect(codec.toCatalogId('m6a.12xlarge')).toBe('M6a12xlarge')
        expect(codec.toCatalogId('g5.12xlarge')).toBe('G512xlarge')
    })

    test('every catalog id round-trips back to itself', () => {
        for (const {id} of AWS_INSTANCE_TYPES) {
            expect(codec.toCatalogId(codec.toAwsName(id))).toBe(id)
        }
    })

    test('unknown values pass through untouched in both directions', () => {
        expect(codec.toAwsName('NotInCatalog')).toBe('NotInCatalog')
        expect(codec.toCatalogId('x9.42xlarge')).toBe('x9.42xlarge')
    })
})

describe('isOlderVersion', () => {
    test('1 < 5 → true', () => expect(isOlderVersion('1.0.0', '5.0.0')).toBe(true))
    test('5 < 5 → false', () => expect(isOlderVersion('5.0.0', '5.0.0')).toBe(false))
    test('5 < 1 → false', () => expect(isOlderVersion('5.0.0', '1.0.0')).toBe(false))
    test('10 < 9 → false', () => expect(isOlderVersion('10.0.0', '9.0.0')).toBe(false))
    test('9 < 10 → true', () => expect(isOlderVersion('9.0.0', '10.0.0')).toBe(true))
    test('null < 5 → true (null leading digit is 0)', () => expect(isOlderVersion(null, '5.0.0')).toBe(true))
    test('0 < 5 → true', () => expect(isOlderVersion('0.1.2', '5.0.0')).toBe(true))
    test('equal versions → false', () => expect(isOlderVersion('12.3.4', '12.3.4')).toBe(false))
    test('extracts first run of digits (e.g. "v10.1" → 10)', () => expect(isOlderVersion('v10.1', '11.0')).toBe(true))
})

describe('launchTags', () => {
    test('contains Environment, Type=Worker, Version, Starting=true', () => {
        const tags = launchTags('test-env', '5.0.0')
        expect(tags).toContainEqual({Key: 'Environment', Value: 'test-env'})
        expect(tags).toContainEqual({Key: 'Type', Value: 'Worker'})
        expect(tags).toContainEqual({Key: 'Version', Value: '5.0.0'})
        expect(tags).toContainEqual({Key: 'Starting', Value: 'true'})
        expect(tags).toHaveLength(4)
    })
})

describe('idleTags', () => {
    test('contains State=idle, Username="", WorkerType="", InStateSince, Name with Idle worker', () => {
        const tags = idleTags('test-env')
        expect(tags).toContainEqual({Key: 'State', Value: 'idle'})
        expect(tags).toContainEqual({Key: 'Username', Value: ''})
        expect(tags).toContainEqual({Key: 'WorkerType', Value: ''})
        const name = tags.find(t => t.Key === 'Name')
        expect(name).toBeDefined()
        expect(name.Value).toBe('test-env: Idle worker')
        const inState = tags.find(t => t.Key === 'InStateSince')
        expect(inState).toBeDefined()
        expect(tags).toHaveLength(5)
    })
})

describe('reserveTags', () => {
    test('contains State=reserved, Username, WorkerType, InStateSince, Name with env+type+user', () => {
        const tags = reserveTags('test-env', {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'})
        expect(tags).toContainEqual({Key: 'State', Value: 'reserved'})
        expect(tags).toContainEqual({Key: 'Username', Value: 'alice'})
        expect(tags).toContainEqual({Key: 'WorkerType', Value: 'SANDBOX'})
        const name = tags.find(t => t.Key === 'Name')
        expect(name).toBeDefined()
        expect(name.Value).toBe('test-env: SANDBOX, alice')
        expect(tags).toHaveLength(6)
    })

    test('Name field exact format: "{env}: {workerType}, {username}"', () => {
        const tags = reserveTags('prod', {username: 'bob', workerType: 'TASK_EXECUTOR'})
        const name = tags.find(t => t.Key === 'Name')
        expect(name.Value).toBe('prod: TASK_EXECUTOR, bob')
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
        expect(sessionId?.Value).not.toBe('undefined')
    })

    test('reserveTags carries the session id', () => {
        const tags = reserveTags('test-env', {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'})
        expect(tags).toContainEqual({Key: 'SessionId', Value: 's-42'})
    })
})

describe('mkFilter', () => {
    test('builds {Name, Values} shape', () => {
        const f = mkFilter('tag:State', 'idle')
        expect(f).toEqual({Name: 'tag:State', Values: ['idle']})
    })

    test('wraps a single value in an array', () => {
        const f = mkFilter('instance-state-name', 'running')
        expect(f.Values).toEqual(['running'])
    })

    test('passes array values through', () => {
        const f = mkFilter('instance-state-name', ['pending', 'running'])
        expect(f.Values).toEqual(['pending', 'running'])
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
        ec2Mock.on(RunInstancesCommand).resolves({Instances: [makeAwsInstance()]})
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        const launched = await provider.launchIdle('T3aSmall', 1)
        provider.stop()

        expect(launched.map(i => i.id)).toEqual(['i-0123456789abcdef0'])
    })

    test('throws FailedToLaunchInstance when EC2 returns no instances', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-test123'}]})
        ec2Mock.on(RunInstancesCommand).resolves({})
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        await expect(provider.launchReserved('T3aSmall', RESERVATION))
            .rejects.toThrow(/FailedToLaunchInstance.*t3a\.small/)
        provider.stop()
    })

    test('RunInstancesCommand uses correct params for launchIdle', async () => {
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [makeAwsInstance({PublicIpAddress: undefined})],
        })
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        ec2Mock.on(DescribeImagesCommand).resolves({
            Images: [{ImageId: 'ami-test123'}],
        })
        await provider.start()

        ec2Mock.reset()
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [makeAwsInstance()],
        })
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        await provider.launchIdle('T3aSmall', 3)
        provider.stop()

        const runCalls = ec2Mock.commandCalls(RunInstancesCommand)
        expect(runCalls).toHaveLength(1)
        const input = runCalls[0].args[0].input
        expect(input.InstanceType).toBe('t3a.small')
        expect(input.SecurityGroups).toEqual(['Sandbox'])
        expect(input.MinCount).toBe(3)
        expect(input.MaxCount).toBe(3)
        expect(input.KeyName).toBe('eu-central-1')
        expect(input.Placement).toEqual({AvailabilityZone: 'eu-central-1a'})
        expect(input.ImageId).toBe('ami-test123')
    })

    test('CreateTagsCommand is called with launch+idle tags for launchIdle', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({
            Images: [{ImageId: 'ami-abc'}],
        })
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [makeAwsInstance({InstanceId: 'i-launch1'})],
        })

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.start()

        ec2Mock.reset()
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [makeAwsInstance({InstanceId: 'i-launch1'})],
        })
        ec2Mock.on(CreateTagsCommand).resolves({})
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        await provider.launchIdle('T3aSmall', 1)
        provider.stop()

        const tagCalls = ec2Mock.commandCalls(CreateTagsCommand)
        expect(tagCalls.length).toBeGreaterThanOrEqual(1)
        const firstTagInput = tagCalls[0].args[0].input
        expect(firstTagInput.Resources).toEqual(['i-launch1'])
        const keys = firstTagInput.Tags.map(t => t.Key)
        expect(keys).toContain('Environment')
        expect(keys).toContain('Type')
        expect(keys).toContain('Version')
        expect(keys).toContain('Starting')
        expect(keys).toContain('State')
        expect(keys).toContain('Username')
        expect(keys).toContain('WorkerType')
        const stateTag = firstTagInput.Tags.find(t => t.Key === 'State')
        expect(stateTag.Value).toBe('idle')
    })
})

describe('launchReserved public-IP polling', () => {
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

        expect(inst.host).toBe('5.6.7.8')
        expect(inst.reservation).toEqual(RESERVATION)
        // The catalog id round-trips: launchReserved takes an id and returns an id.
        expect(inst.type).toBe('T3aSmall')
        const describeCalls = ec2Mock.commandCalls(DescribeInstancesCommand)
        expect(describeCalls.length).toBeLessThanOrEqual(1)
    })

    test('polls getInstance until public IP is available (no IP then IP)', async () => {
        ec2Mock.on(DescribeImagesCommand).resolves({Images: [{ImageId: 'ami-poll'}]})
        ec2Mock.on(CreateTagsCommand).resolves({})

        ec2Mock.on(DescribeInstancesCommand).callsFake(input => {
            const ids = input.InstanceIds ?? []
            if (ids.length > 0) {
                return describeResponse([{
                    InstanceId: ids[0],
                    InstanceType: 't3a.small',
                    PublicIpAddress: '9.8.7.6',
                    State: {Name: 'running'},
                    LaunchTime: new Date().toISOString(),
                    Tags: [{Key: 'State', Value: 'reserved'}, {Key: 'Username', Value: 'alice'}, {Key: 'WorkerType', Value: 'SANDBOX'}],
                }])
            }
            return emptyDescribeResponse()
        })

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
        ec2Mock.on(DescribeInstancesCommand).callsFake(input => {
            const ids = input.InstanceIds ?? []
            if (ids.length > 0) {
                return describeResponse([{
                    InstanceId: ids[0],
                    InstanceType: 't3a.small',
                    PublicIpAddress: '9.8.7.6',
                    State: {Name: 'running'},
                    LaunchTime: new Date().toISOString(),
                    Tags: [{Key: 'State', Value: 'reserved'}, {Key: 'Username', Value: 'alice'}, {Key: 'WorkerType', Value: 'SANDBOX'}],
                }])
            }
            return emptyDescribeResponse()
        })
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
        provider.stop()

        expect(inst.host).toBe('9.8.7.6')
        expect(inst.reservation).toEqual({...RESERVATION, sessionId: null})
    }, 10_000)
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
        expect(filters).toBeDefined()
        const typeFilter = filters.find(f => f.Name === 'instance-type')
        expect(typeFilter).toBeDefined()
        expect(typeFilter.Values).toEqual(['t3a.small'])
    })

    test('idleInstances(type) includes State=idle filter', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.idleInstances('T3aSmall')

        const calls = ec2Mock.commandCalls(DescribeInstancesCommand)
        const idleCall = calls[0]
        const filters = idleCall.args[0].input.Filters
        const stateFilter = filters.find(f => f.Name === 'tag:State')
        expect(stateFilter).toBeDefined()
        expect(stateFilter.Values).toContain('idle')
    })

    test('returned instances carry the catalog id as `type`, not the EC2 name', async () => {
        // sizeIdlePool groups by instance.type against an id-keyed target map, and
        // dockerInstanceProvisioner looks up instanceTypeById[instance.type]; a name here makes
        // both miss — the idle pool would be terminated every cycle and provisioning would throw.
        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([makeAwsInstance()]))

        const provider = createAwsInstanceProvider(CONFIG)
        const instances = await provider.idleInstances('T3aSmall')

        expect(instances).toHaveLength(1)
        expect(instances[0].type).toBe('T3aSmall')
    })

    test('idleInstances() without type arg omits instance-type filter', async () => {
        ec2Mock.on(DescribeInstancesCommand).resolves(emptyDescribeResponse())

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.idleInstances()

        const calls = ec2Mock.commandCalls(DescribeInstancesCommand)
        const idleCall = calls[0]
        const filters = idleCall.args[0].input.Filters
        const typeFilter = filters ? filters.find(f => f.Name === 'instance-type') : undefined
        expect(typeFilter).toBeUndefined()
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
                {Key: 'Version', Value: '1.0.0'},  // older than CONFIG.sepalVersion=5.0.0
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
        await provider.idleInstances('T3aSmall')

        expect(terminateCallCount).toBeGreaterThanOrEqual(1)
        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        expect(terminatedIds).toContain('i-old-idle')
    })

    test('does not terminate idle instances with current version', async () => {
        const currentIdleInstance = makeAwsInstance({
            InstanceId: 'i-current-idle',
            Tags: [
                {Key: 'State', Value: 'idle'},
                {Key: 'Type', Value: 'Worker'},
                {Key: 'Environment', Value: 'test-env'},
                {Key: 'Version', Value: '5.0.0'},  // same as CONFIG.sepalVersion
            ],
        })

        ec2Mock.on(DescribeInstancesCommand).resolves(describeResponse([currentIdleInstance]))
        ec2Mock.on(TerminateInstancesCommand).resolves({TerminatingInstances: []})

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.idleInstances('T3aSmall')

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        expect(terminatedIds).not.toContain('i-current-idle')
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
        await provider.idleInstances('T3aSmall')

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        expect(terminatedIds).not.toContain('i-old-reserved')
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
        await provider.idleInstances()

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        expect(terminatedIds).toContain('i-untagged-old')
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
        await provider.idleInstances()

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        expect(terminatedIds).not.toContain('i-untagged-new')
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
        await provider.idleInstances()

        const terminateCalls = ec2Mock.commandCalls(TerminateInstancesCommand)
        const terminatedIds = terminateCalls.flatMap(c => c.args[0].input.InstanceIds)
        expect(terminatedIds).not.toContain('i-tagged')
    })
})

// terminateOldIdle / terminateUntagged are best-effort: a terminate failure during auto-cleanup
// must NOT reject idleInstances() / reservedInstances() — the surviving list is still returned
// and the error is swallowed and logged. A caller-initiated terminate() MUST still reject after
// all retries fail.
describe('best-effort auto-cleanup — cleanup failure does not reject query', () => {
    let ec2Mock

    beforeEach(() => {
        ec2Mock = mockClient(EC2Client)
        ec2Mock.reset()
    })

    afterEach(() => {
        ec2Mock.restore()
    })

    test('idleInstances() resolves even when terminateOldIdle terminate always fails', async () => {
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

        await expect(provider.idleInstances()).resolves.toBeDefined()
        const result = await provider.idleInstances()
        const found = result.find(i => i.id === 'i-current-idle')
        expect(found).toBeDefined()
    }, 15_000)

    test('reservedInstances() resolves even when terminateUntagged terminate always fails', async () => {
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

        const result = await provider.reservedInstances()
        const found = result.find(i => i.id === 'i-res-survives')
        expect(found).toBeDefined()
        expect(found.reservation).toEqual({username: 'alice', workerType: 'SANDBOX', sessionId: null})
    }, 15_000)

    test('caller-initiated terminate() DOES reject after all retries fail', async () => {
        ec2Mock.on(TerminateInstancesCommand).rejects(new Error('persistent failure'))

        const provider = createAwsInstanceProvider(CONFIG)

        await expect(provider.terminate('i-caller-fail')).rejects.toThrow('persistent failure')
    }, 15_000)
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

    test('retries up to 3 total attempts on TerminateInstancesCommand failure', async () => {
        let callCount = 0
        ec2Mock.on(TerminateInstancesCommand).callsFake(() => {
            callCount++
            throw new Error('EC2 throttle')
        })

        const provider = createAwsInstanceProvider(CONFIG)

        await expect(provider.terminate('i-fail')).rejects.toThrow('EC2 throttle')
        // retry(2) loop: retries = 0, 1, 2 → 3 total attempts
        expect(callCount).toBe(3)
    }, 15_000)  // allow time for exponential backoff (1s + 2s = 3s)

    test('succeeds on second attempt if first fails', async () => {
        let callCount = 0
        ec2Mock.on(TerminateInstancesCommand).callsFake(() => {
            callCount++
            if (callCount === 1) throw new Error('transient')
            return {TerminatingInstances: []}
        })

        const provider = createAwsInstanceProvider(CONFIG)
        await provider.terminate('i-retry-ok')
        expect(callCount).toBe(2)
    }, 5_000)
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

    test('terminates instance and throws FailedToTagInstance when all 5 tag attempts fail', async () => {
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
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [makeAwsInstance({InstanceId: 'i-tag-fail', PublicIpAddress: undefined})],
        })

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
        ec2Mock.on(RunInstancesCommand).resolves({
            Instances: [makeAwsInstance({InstanceId: 'i-tag-fail', PublicIpAddress: undefined})],
        })

        tagCallCount = 0
        terminateCallCount = 0

        await expect(provider.launchIdle('T3aSmall', 1)).rejects.toThrow('FailedToTagInstance')
        provider.stop()

        // retry(4) = 5 total attempts
        expect(tagCallCount).toBe(5)
        expect(terminateCallCount).toBe(1)
    }, 60_000)  // Allow for exponential backoff across 5 attempts (up to ~31s)
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
        await expect(provider.start()).rejects.toThrow('UnableToGetImageId')
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
        expect(imageCalls).toHaveLength(1)
        const filters = imageCalls[0].args[0].input.Filters
        expect(filters).toContainEqual({Name: 'tag:Version', Values: ['5.0.0']})
        expect(filters).toContainEqual({Name: 'tag:Region', Values: ['eu-central-1']})
    })

    test('constructing the provider does NOT issue any AWS calls (lazy init)', () => {
        ec2Mock.on(DescribeImagesCommand).rejects(new Error('should not be called'))
        ec2Mock.on(DescribeInstancesCommand).rejects(new Error('should not be called'))

        expect(() => createAwsInstanceProvider(CONFIG)).not.toThrow()

        const imageCalls = ec2Mock.commandCalls(DescribeImagesCommand)
        const describeCalls = ec2Mock.commandCalls(DescribeInstancesCommand)
        expect(imageCalls).toHaveLength(0)
        expect(describeCalls).toHaveLength(0)
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
        expect(stateFilter).toBeDefined()
        expect(stateFilter.Values).toContain('reserved')
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

        expect(found.reservation).toEqual({username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'})
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
                {Key: 'WorkerType', Value: 'TASK_EXECUTOR'},
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
        expect(found).toBeDefined()
        expect(found.id).toBe('i-res1')
        expect(found.type).toBe('T3aSmall')
        expect(found.reservation).toEqual({username: 'charlie', workerType: 'TASK_EXECUTOR', sessionId: null})
    })
})
