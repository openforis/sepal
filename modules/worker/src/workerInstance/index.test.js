// Tests for the workerInstance component's scheduling and startup backfill. Only the immediate
// (initial-delay-0) run of SizeIdlePool is exercised — the 1-minute interval never fires within a
// test, and stop() clears it.

import {jest} from '@jest/globals'

import {createWorkerInstanceComponent} from './index.js'

// The jobs run in a promise chain that start() does not await, so drain before asserting.
const flush = async () => {
    for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setImmediate(resolve))
    }
}

const build = ({instanceTypes, idle = [], reserved = [], claims = {
    claim: jest.fn(async () => true),
    release: jest.fn(async () => true),
    all: jest.fn(async () => []),
}}) => {
    const provider = {
        start: jest.fn(async () => {}),
        stop: jest.fn(async () => {}),
        onInstanceLaunched: jest.fn(),
        idleInstances: jest.fn(async () => idle),
        reservedInstances: jest.fn(async () => reserved),
        launchIdle: jest.fn(async () => []),
        terminate: jest.fn(async () => {}),
        sweep: jest.fn(async () => {}),
    }
    const component = createWorkerInstanceComponent({
        claims, provider, provisioner: {}, instanceTypes,
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

    expect(provider.terminate).toHaveBeenCalledWith('i-orphan')
})

test('still tops the pool up to target when a type declares one', async () => {
    const {component, provider} = build({
        instanceTypes: [{id: 'T3aSmall', idleCount: 1}],
        idle: [],
    })

    await component.start()
    await flush()
    component.stop()

    expect(provider.launchIdle).toHaveBeenCalledWith('T3aSmall', 1)
})

// The provider sweep collects what no allocation path can see (older-version and untagged
// instances); it must run on the same tick as the sizing, not on its own separate schedule.
test('runs the provider sweep on every pool cycle', async () => {
    const {component, provider} = build({instanceTypes: [{id: 'T3aSmall', idleCount: 1}]})

    await component.start()
    await flush()
    component.stop()

    expect(provider.sweep).toHaveBeenCalled()
})

// The sizing is what stops released instances billing forever; a sweep failure (an AWS API blip)
// must not take it down with it.
test('sizes the pool even when the provider sweep fails', async () => {
    const {component, provider} = build({instanceTypes: [{id: 'T3aSmall', idleCount: 1}]})
    provider.sweep.mockRejectedValue(new Error('ec2 down'))

    await component.start()
    await flush()
    component.stop()

    expect(provider.launchIdle).toHaveBeenCalledWith('T3aSmall', 1)
})

test('stop() halts the provider and the sweep', async () => {
    const {component, provider} = build({instanceTypes: [{id: 'T3aSmall', idleCount: 1}]})

    await component.start()
    await flush()
    await component.stop()

    expect(provider.stop).toHaveBeenCalled()
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

        expect(claims.claim.mock.calls).toEqual([['i-1', 's-1']])
    })

    test('a backfill failure does not stop startup', async () => {
        const {component} = build({
            instanceTypes: [],
            reserved: [{id: 'i-1', reservation: {sessionId: 's-1'}}],
            claims: {
                claim: jest.fn(async () => { throw new Error('db down') }),
                release: jest.fn(async () => true),
                all: jest.fn(async () => []),
            },
        })

        await expect(component.start()).resolves.toBeUndefined()
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
    provider.restore = jest.fn(async () => {
        order.push('restore')
    })
    provider.reservedInstances = jest.fn(async () => {
        order.push('backfill')
        return []
    })

    const component = createWorkerInstanceComponent({
        claims: {claim: jest.fn(async () => true), release: jest.fn(async () => true), all: jest.fn(async () => [])},
        provider,
        provisioner: {},
        instanceTypes: [],
        openSessionInstances: async () => [{id: 'i-1'}],
    })
    await component.start()
    await flush()
    component.stop()

    expect(provider.restore).toHaveBeenCalledWith([{id: 'i-1'}])
    expect(order.slice(0, 2)).toEqual(['restore', 'backfill'])
})

// A restore that throws must not take the module down with it: everything downstream degrades to
// the behaviour that shipped before restore existed.
test('a failing restore does not stop the component from starting', async () => {
    const {provider} = build({instanceTypes: []})
    provider.restore = jest.fn(async () => {
        throw new Error('boom')
    })

    const component = createWorkerInstanceComponent({
        claims: {claim: jest.fn(async () => true), release: jest.fn(async () => true), all: jest.fn(async () => [])},
        provider,
        provisioner: {},
        instanceTypes: [],
        openSessionInstances: async () => [{id: 'i-1'}],
    })

    await expect(component.start()).resolves.toBeUndefined()
    await flush()
    component.stop()
})
