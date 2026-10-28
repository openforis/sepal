import assert from 'node:assert/strict'
import {describe, mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {createWorkerInstanceComponent} from './index.js'

// The jobs run in a promise chain that start() does not await, so drain before asserting.
const flush = async () => {
    for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setImmediate(resolve))
    }
}

const build = ({instanceTypes, idle = [], reserved = [], stoppedPoolSize, claims = {
    claim: mock.fn(async () => true),
    release: mock.fn(async () => true),
    all: mock.fn(async () => []),
}}) => {
    const provider = {
        start: mock.fn(async () => {}),
        stop: mock.fn(async () => {}),
        onInstanceLaunched: mock.fn(),
        idleInstances: mock.fn(async () => idle),
        reservedInstances: mock.fn(async () => reserved),
        launchIdle: mock.fn(async () => []),
        pooledInstances: mock.fn(async () => []),
        launchPooled: mock.fn(async () => []),
        terminate: mock.fn(async () => {}),
        sweep: mock.fn(async () => {}),
    }
    const component = createWorkerInstanceComponent({
        claims, provider, provisioner: {}, instanceTypes, stoppedPoolSize,
    })
    return {claims, component, provider}
}

// SizeIdlePool is the ONLY step that terminates a released instance: releaseInstance merely
// un-reserves it (on AWS, re-tags it State=idle), and the provider's own cleanup only sweeps idle
// instances of an OLDER version. If the sweep is not scheduled, released instances bill forever.
test('terminates surplus idle instances even when no type declares an idle pool', async () => {
    const {component, provider} = build({
        instanceTypes: [{id: 'M5aLarge', idleCount: 0}],
        idle: [{id: 'i-orphan', type: 'M5aLarge'}],
    })

    await component.start()
    await flush()
    component.stop()

    assert.deepEqual(callsOf(provider.terminate), [['i-orphan']])
})

test('still tops the pool up to target when a type declares one', async () => {
    const {component, provider} = build({
        instanceTypes: [{id: 'T3aSmall', idleCount: 1}],
        idle: [],
    })

    await component.start()
    await flush()
    component.stop()

    assert.deepEqual(callsOf(provider.launchIdle), [['T3aSmall', 1]])
})

test('fills the configured stopped pool on the pool cycle', async () => {
    const {component, provider} = build({instanceTypes: [], stoppedPoolSize: 2})

    await component.start()
    await flush()
    component.stop()

    assert.deepEqual(callsOf(provider.launchPooled), [[2]])
})

test('leaves the stopped pool alone by default', async () => {
    const {component, provider} = build({instanceTypes: []})

    await component.start()
    await flush()
    component.stop()

    assert.equal(provider.pooledInstances.mock.callCount(), 0)
})

// The provider sweep collects what no allocation path can see (older-version and untagged
// instances); it must run on the same tick as the sizing, not on its own separate schedule.
test('runs the provider sweep on every pool cycle', async () => {
    const {component, provider} = build({instanceTypes: [{id: 'T3aSmall', idleCount: 1}]})

    await component.start()
    await flush()
    component.stop()

    assert.ok(provider.sweep.mock.callCount() > 0)
})

// The sizing is what stops released instances billing forever; a sweep failure (an AWS API blip)
// must not take it down with it.
test('sizes the pool even when the provider sweep fails', async () => {
    const {component, provider} = build({instanceTypes: [{id: 'T3aSmall', idleCount: 1}]})
    provider.sweep.mock.mockImplementation(async () => {
        throw new Error('ec2 down')
    })

    await component.start()
    await flush()
    component.stop()

    assert.deepEqual(callsOf(provider.launchIdle), [['T3aSmall', 1]])
})

test('stop() halts the provider and the sweep', async () => {
    const {component, provider} = build({instanceTypes: [{id: 'T3aSmall', idleCount: 1}]})

    await component.start()
    await flush()
    await component.stop()

    assert.ok(provider.stop.mock.callCount() > 0)
})

describe('start — upgrade backfill', () => {
    test('claims each reserved instance that carries a session id', async () => {
        const {claims, component} = build({
            instanceTypes: [],
            reserved: [
                {id: 'i-1', reservation: {sessionId: 's-1'}},
                {id: 'i-2', reservation: {sessionId: null}},
            ],
        })

        await component.start()
        await flush()
        component.stop()

        assert.deepEqual(callsOf(claims.claim), [['i-1', 's-1']])
    })

    test('a backfill failure does not stop startup', async () => {
        const {component} = build({
            instanceTypes: [],
            reserved: [{id: 'i-1', reservation: {sessionId: 's-1'}}],
            claims: {
                claim: mock.fn(async () => { throw new Error('db down') }),
                release: mock.fn(async () => true),
                all: mock.fn(async () => []),
            },
        })

        assert.equal(await component.start(), undefined)
        await flush()
        component.stop()
    })
})

// A restoring provider (local dev) and backfillClaims read the same world, and backfill reads it
// through provider.reservedInstances() — so a restore that ran second would rebuild the claim
// table from an empty provider.
test('restores the open sessions instances before backfilling claims', async () => {
    const order = []
    const {provider} = build({instanceTypes: []})
    provider.restore = mock.fn(async () => {
        order.push('restore')
    })
    provider.reservedInstances = mock.fn(async () => {
        order.push('backfill')
        return []
    })

    const component = createWorkerInstanceComponent({
        claims: {claim: mock.fn(async () => true), release: mock.fn(async () => true), all: mock.fn(async () => [])},
        provider,
        provisioner: {},
        instanceTypes: [],
        openSessionInstances: async () => [{id: 'i-1'}],
    })
    await component.start()
    await flush()
    component.stop()

    assert.deepEqual(callsOf(provider.restore), [[[{id: 'i-1'}]]])
    assert.deepEqual(order.slice(0, 2), ['restore', 'backfill'])
})

// A restore that throws must not take the module down with it: everything downstream degrades to
// the behaviour that shipped before restore existed.
test('a failing restore does not stop the component from starting', async () => {
    const {provider} = build({instanceTypes: []})
    provider.restore = mock.fn(async () => {
        throw new Error('boom')
    })

    const component = createWorkerInstanceComponent({
        claims: {claim: mock.fn(async () => true), release: mock.fn(async () => true), all: mock.fn(async () => [])},
        provider,
        provisioner: {},
        instanceTypes: [],
        openSessionInstances: async () => [{id: 'i-1'}],
    })

    assert.equal(await component.start(), undefined)
    await flush()
    component.stop()
})
