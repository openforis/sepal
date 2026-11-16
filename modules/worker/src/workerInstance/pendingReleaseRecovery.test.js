import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

import {DescribeInstancesCommand, EC2Client} from '@aws-sdk/client-ec2'
import {mockClient} from 'aws-sdk-client-mock'

import {createAwsInstanceProvider} from '../hostingService/aws/awsInstanceProvider.js'
import {reclaimStaleClaims} from './command/reclaimStaleClaims.js'
import {releaseInstance} from './command/releaseInstance.js'
import {createProvisioningRegistry} from './provisioningRegistry.js'

const INSTANCE_ID = 'i-0123456789abcdef0'
const SESSION_ID = 's-alice'
const GRACE_MS = 10 * 60_000

const setup = context => {
    const ec2 = mockClient(EC2Client)
    const clock = {now: 1_000_000}
    const lookup = {state: 'missing', beforeLookup: () => {}}
    mock.method(Date, 'now', () => clock.now)
    context.after(() => {
        ec2.restore()
        mock.restoreAll()
    })
    ec2.on(DescribeInstancesCommand).callsFake(input => {
        if (!input.InstanceIds) return {Reservations: []}
        lookup.beforeLookup()
        if (lookup.state === 'missing') {
            throw Object.assign(new Error('No such instance'), {name: 'InvalidInstanceID.NotFound'})
        }
        if (lookup.state !== 'present') {
            throw Object.assign(new Error('Lookup failed'), {name: lookup.state})
        }
        return {Reservations: [{Instances: [{
            InstanceId: INSTANCE_ID,
            InstanceType: 't3a.small',
            State: {Name: 'running'},
            LaunchTime: new Date(0),
            Tags: [{Key: 'State', Value: 'idle'}, {Key: 'Version', Value: 'old-version'}],
        }]}]}
    })
    const provider = createAwsInstanceProvider({
        region: 'eu-central-1', availabilityZone: 'eu-central-1a', environment: 'test',
        workerAmiVersion: 'current-version', accessKey: 'test', secretKey: 'test',
    })
    const provisioning = createProvisioningRegistry()
    const claims = {
        all: async () => [],
        sessionIdForInstance: async () => null,
        release: async () => false,
        claim: async () => false,
    }
    const deps = {provider, provisioning, claims, provisioner: {undeploy: async () => {}}, releasing: new Map()}
    const reconcile = () => reclaimStaleClaims([], GRACE_MS, deps)
    const byIdCalls = () => ec2.commandCalls(DescribeInstancesCommand)
        .filter(call => call.args[0].input.InstanceIds).length
    return {clock, lookup, provider, provisioning, reconcile, byIdCalls, deps}
}

test('persistent by-ID absence clears a claimless retirement gate and stops further lookups', async context => {
    const {clock, provisioning, reconcile, byIdCalls} = setup(context)
    const original = provisioning.beginRelease(INSTANCE_ID, SESSION_ID, {retire: true})
    await reconcile()
    assert.equal(provisioning.isProvisioning(INSTANCE_ID), true)

    clock.now += GRACE_MS / 2
    const retry = provisioning.beginRelease(INSTANCE_ID, SESSION_ID, {retire: true})
    assert.equal(retry.createdAt, original.createdAt)
    await reconcile()
    assert.equal(provisioning.isProvisioning(INSTANCE_ID), true)

    clock.now += GRACE_MS / 2 + 1
    await reconcile()
    assert.equal(provisioning.isProvisioning(INSTANCE_ID), false)
    const calls = byIdCalls()
    await reconcile()
    assert.equal(byIdCalls(), calls)
})

test('the first NotFound on an old gate remains uncertain for a full observation grace', async context => {
    const {clock, provisioning, reconcile} = setup(context)
    provisioning.beginRelease(INSTANCE_ID, SESSION_ID, {retire: true})
    clock.now += 2 * GRACE_MS
    await reconcile()
    assert.equal(provisioning.isProvisioning(INSTANCE_ID), true)

    clock.now += GRACE_MS - 1
    await reconcile()
    assert.equal(provisioning.isProvisioning(INSTANCE_ID), true)
    clock.now += 2
    await reconcile()
    assert.equal(provisioning.isProvisioning(INSTANCE_ID), false)
})

for (const state of ['UnauthorizedOperation', 'TimeoutError', 'present']) {
    test(`${state} resets missing evidence instead of authorizing gate cleanup`, async context => {
        const {clock, lookup, provider, provisioning, reconcile} = setup(context)
        provisioning.beginRelease(INSTANCE_ID, SESSION_ID, {retire: true})
        await reconcile()
        clock.now += GRACE_MS / 2
        lookup.state = state
        // A successful probe need not mean the subsequent release lookup also succeeds.
        if (state === 'present') {
            provider.getInstance = async () => { throw new Error('Release lookup unavailable') }
        }
        await reconcile()
        assert.equal(provisioning.isProvisioning(INSTANCE_ID), true)

        lookup.state = 'missing'
        clock.now += GRACE_MS
        await reconcile()
        assert.equal(provisioning.isProvisioning(INSTANCE_ID), true)
        clock.now += GRACE_MS + 1
        await reconcile()
        assert.equal(provisioning.isProvisioning(INSTANCE_ID), false)
    })
}

test('a missing-instance probe cannot clear a replacement gate', async context => {
    const {clock, lookup, provisioning, reconcile} = setup(context)
    const original = provisioning.beginRelease(INSTANCE_ID, SESSION_ID, {retire: true})
    await reconcile()
    clock.now += GRACE_MS + 1
    lookup.beforeLookup = () => {
        provisioning.finishRelease(INSTANCE_ID, original)
        provisioning.beginRelease(INSTANCE_ID, 's-bob', {retire: true})
        lookup.beforeLookup = () => {}
    }
    await reconcile()

    assert.equal(provisioning.isProvisioning(INSTANCE_ID), true)
    assert.equal(provisioning.pendingReleases()[0].sessionId, 's-bob')
})

for (const state of ['UnauthorizedOperation', 'TimeoutError']) {
    test(`an ordinary release retry with ${state} invalidates prior absence evidence`, async context => {
        const {clock, lookup, provisioning, reconcile, deps} = setup(context)
        provisioning.beginRelease(INSTANCE_ID, SESSION_ID, {retire: true})
        await reconcile()

        clock.now += GRACE_MS / 2
        lookup.state = state
        await releaseInstance(INSTANCE_ID, SESSION_ID, {...deps, retire: true})
        assert.equal(provisioning.isProvisioning(INSTANCE_ID), true)

        lookup.state = 'missing'
        clock.now += GRACE_MS / 2 + 1
        await reconcile()
        assert.equal(provisioning.isProvisioning(INSTANCE_ID), true)
        clock.now += GRACE_MS + 1
        await reconcile()
        assert.equal(provisioning.isProvisioning(INSTANCE_ID), false)
    })
}
