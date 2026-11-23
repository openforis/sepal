import assert from 'node:assert/strict'
import {test} from 'node:test'
import {setImmediate} from 'node:timers/promises'

import {
    CreateTagsCommand,
    DescribeInstancesCommand,
    DescribeVolumesCommand,
    EC2Client,
    ModifyInstanceAttributeCommand,
    StartInstancesCommand,
    StopInstancesCommand,
    TerminateInstancesCommand,
} from '@aws-sdk/client-ec2'
import {mockClient} from 'aws-sdk-client-mock'

import {createAwsInstanceProvider} from './awsInstanceProvider.js'

test('recovery requests a normal stop without waiting for shutdown or clearing its reservation', async context => {
    const scenario = aScenario(context)

    await scenario.provider.beginRecovery(INSTANCE_ID)

    assert.equal(scenario.machine.State.Name, 'stopping')
    assert.equal(scenario.ec2.commandCalls(DescribeInstancesCommand).length, 0)
    assert.deepEqual(scenario.ec2.commandCalls(StopInstancesCommand).map(call => call.args[0].input), [
        {InstanceIds: [INSTANCE_ID]},
    ])
    assert.deepEqual(scenario.stopStates, ['recovering'])
    assert.equal(tagValue(scenario.machine, 'State'), 'recovering')
    assert.equal(tagValue(scenario.machine, 'Starting'), '')
    const instance = await scenario.provider.getInstance(INSTANCE_ID)
    assert.deepEqual(instance.reservation, RESERVATION)
    assert.equal(instance.imageDiskWarm, true)
})

test('a failed recovery tag retains the host without sending a stop or termination', async context => {
    const scenario = aScenario(context)
    const error = new Error('recovery tag unavailable')
    scenario.ec2.on(CreateTagsCommand).rejects(error)
    context.mock.timers.enable({apis: ['setTimeout']})

    const rejected = assert.rejects(scenario.provider.beginRecovery(INSTANCE_ID), error)
    await advanceRetries(context)
    await rejected

    assert.equal(scenario.ec2.commandCalls(TerminateInstancesCommand).length, 0)
    assert.equal(scenario.ec2.commandCalls(StopInstancesCommand).length, 0)
    assert.equal(scenario.machine.State.Name, 'running')
})

test('a failed stop keeps recovery state without discarding the warmed host', async context => {
    const scenario = aScenario(context)
    const error = new Error('stop unavailable')
    scenario.ec2.on(StopInstancesCommand).rejects(error)
    context.mock.timers.enable({apis: ['setTimeout']})

    const rejected = assert.rejects(scenario.provider.beginRecovery(INSTANCE_ID), error)
    await advanceRetries(context)
    await rejected

    assert.equal(tagValue(scenario.machine, 'State'), 'recovering')
    assert.equal(scenario.ec2.commandCalls(TerminateInstancesCommand).length, 0)
})

test('shutdown confirmation reads the requested instance by ID', async context => {
    const scenario = aScenario(context, [anInstance({state: 'stopped', stage: 'recovering'})])

    await scenario.provider.awaitStopped(INSTANCE_ID)

    assert.deepEqual(scenario.ec2.commandCalls(DescribeInstancesCommand).map(call => call.args[0].input), [
        {InstanceIds: [INSTANCE_ID]},
    ])
    assert.equal(scenario.ec2.commandCalls(StopInstancesCommand).length, 0)
})

test('a terminated instance is not reported as a successfully stopped host', async context => {
    const scenario = aScenario(context, [anInstance({state: 'terminated', stage: 'recovering'})])

    await assert.rejects(scenario.provider.awaitStopped(INSTANCE_ID))

    assert.equal(scenario.ec2.commandCalls(TerminateInstancesCommand).length, 0)
})

test('shutdown confirmation times out rather than accepting a host that remains running', async context => {
    const scenario = aScenario(context)
    context.mock.timers.enable({apis: ['setTimeout', 'Date']})

    const rejected = assert.rejects(scenario.provider.awaitStopped(INSTANCE_ID), /timed out/i)
    for (let attempt = 0; attempt < 40; attempt++) {
        await setImmediate()
        context.mock.timers.tick(5_000)
    }
    await rejected

    assert.equal(scenario.ec2.commandCalls(TerminateInstancesCommand).length, 0)
})

test('a recovering host contributes future pool capacity but cannot be allocated', async context => {
    const scenario = aScenario(context)
    await scenario.provider.beginRecovery(INSTANCE_ID)
    scenario.machine.State.Name = 'stopped'

    assert.deepEqual((await scenario.provider.pooledInstances()).map(({id}) => id), [INSTANCE_ID])
    assert.deepEqual(await scenario.provider.pooledInstances({ready: true}), [])
    assert.deepEqual(await scenario.provider.idleInstances(), [])
    assert.deepEqual(await scenario.provider.reservedInstances(), [])
})

test('recovery discovery includes every nonterminal state and AMI version, without ordinary or foreign workers', async context => {
    const recovering = ['pending', 'running', 'stopping', 'stopped'].map((state, index) => anInstance({
        id: `i-recovering-${state}`,
        state,
        stage: 'recovering',
        version: index === 3 ? 'older-ami' : CONFIG.workerAmiVersion,
    }))
    const scenario = aScenario(context, [
        ...recovering,
        anInstance({id: 'i-pooled', state: 'stopped', stage: 'pooled'}),
        anInstance({id: 'i-reserved'}),
        anInstance({id: 'i-idle', stage: 'idle'}),
        anInstance({id: 'i-foreign', stage: 'recovering', environment: 'another-environment'}),
        anInstance({id: 'i-terminated', state: 'terminated', stage: 'recovering'}),
    ])

    const discovered = await scenario.provider.recoveringInstances()

    assert.deepEqual(discovered.map(({id}) => id).sort(), recovering.map(({InstanceId}) => InstanceId).sort())
    assert.deepEqual(discovered.find(({id}) => id === 'i-recovering-stopped').reservation, RESERVATION)
})

test('the stray sweep preserves stopped recovering hosts and still retires unrelated strays', async context => {
    const stray = anInstance({id: 'i-stray', state: 'stopped'})
    const scenario = aScenario(context, [anInstance({state: 'stopped', stage: 'recovering'}), stray])

    await scenario.provider.sweep()

    assert.deepEqual(scenario.ec2.commandCalls(TerminateInstancesCommand).map(call => call.args[0].input), [
        {InstanceIds: [stray.InstanceId]},
    ])
})

test('a ready stopped-pool allocation persists its warmed image disk across reservation reads', async context => {
    const machine = anInstance({state: 'stopped', stage: 'pooled', warm: false})
    const scenario = aScenario(context, [machine])
    const [pooled] = await scenario.provider.pooledInstances({ready: true})

    const started = await scenario.provider.startPooled(pooled, 'M6aXlarge', RESERVATION)

    assert.equal(started.imageDiskWarm, true)
    const observed = await scenario.provider.getInstance(INSTANCE_ID)
    assert.equal(observed.imageDiskWarm, true)
    assert.deepEqual(observed.reservation, RESERVATION)
})

test('a cold instance is not declared to have a warmed image disk', async context => {
    const scenario = aScenario(context, [anInstance({warm: false})])

    const instance = await scenario.provider.getInstance(INSTANCE_ID)

    assert.equal(instance.imageDiskWarm, false)
})

const INSTANCE_ID = 'i-0123456789abcdef0'
const RESERVATION = {username: 'alice', workerType: 'SANDBOX', sessionId: 'session-alice'}
const CONFIG = {
    workerAmiVersion: '5.0.0',
    region: 'eu-central-1',
    availabilityZone: 'eu-central-1a',
    environment: 'test-env',
    accessKey: 'test-access',
    secretKey: 'test-secret',
}

const anInstance = ({
    id = INSTANCE_ID,
    state = 'running',
    stage = 'reserved',
    warm = true,
    version = CONFIG.workerAmiVersion,
    environment = CONFIG.environment,
} = {}) => ({
    InstanceId: id,
    InstanceType: 't3a.small',
    State: {Name: state},
    LaunchTime: new Date(),
    Tags: Object.entries({
        Environment: environment,
        Type: 'Worker',
        Version: version,
        State: stage,
        Starting: 'true',
        Username: RESERVATION.username,
        WorkerType: RESERVATION.workerType,
        SessionId: RESERVATION.sessionId,
        ...(warm ? {ImageDiskWarm: 'true'} : {}),
    }).map(([Key, Value]) => ({Key, Value})),
})

const tagValue = (instance, key) => instance.Tags.find(tag => tag.Key === key)?.Value

const aScenario = (context, machines = [anInstance()]) => {
    const ec2 = mockClient(EC2Client)
    const stopStates = []
    context.after(() => ec2.restore())
    ec2.on(DescribeInstancesCommand).callsFake(input => ({Reservations: [{Instances: machines.filter(machine =>
        input.InstanceIds
            ? input.InstanceIds.includes(machine.InstanceId)
            : (input.Filters ?? []).every(({Name, Values}) => Values.includes(
                Name.startsWith('tag:') ? tagValue(machine, Name.slice(4))
                    : Name === 'instance-state-name' ? machine.State.Name : machine.InstanceType
            ))
    )}]}))
    ec2.on(CreateTagsCommand).callsFake(({Resources, Tags}) => {
        for (const machine of machines.filter(({InstanceId}) => Resources.includes(InstanceId))) {
            machine.Tags = [...machine.Tags.filter(({Key}) => !Tags.some(tag => tag.Key === Key)), ...Tags]
        }
        return {}
    })
    ec2.on(StopInstancesCommand).callsFake(({InstanceIds}) => {
        for (const machine of machines.filter(({InstanceId}) => InstanceIds.includes(InstanceId))) {
            stopStates.push(tagValue(machine, 'State'))
            machine.State.Name = 'stopping'
        }
        return {}
    })
    ec2.on(ModifyInstanceAttributeCommand).callsFake(({InstanceId, InstanceType}) => {
        machines.find(machine => machine.InstanceId === InstanceId).InstanceType = InstanceType.Value
        return {}
    })
    ec2.on(StartInstancesCommand).resolves({})
    ec2.on(TerminateInstancesCommand).resolves({})
    ec2.on(DescribeVolumesCommand).resolves({Volumes: []})
    return {ec2, machine: machines[0], provider: createAwsInstanceProvider(CONFIG), stopStates}
}

const advanceRetries = async context => {
    for (let attempt = 0; attempt < 5; attempt++) {
        await setImmediate()
        context.mock.timers.tick(10_000)
    }
}
