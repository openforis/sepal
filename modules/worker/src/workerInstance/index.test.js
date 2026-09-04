// Tests for the workerInstance component's scheduling. Only the immediate (initial-delay-0) run
// of SizeIdlePool is exercised — the 1-minute interval never fires within a test, and stop()
// clears it.

import {jest} from '@jest/globals'

import {createWorkerInstanceComponent} from './index.js'

// The jobs run in a promise chain that start() does not await, so drain before asserting.
const flush = async () => {
    for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setImmediate(resolve))
    }
}

const build = ({instanceTypes, idle = [], reserved = []}) => {
    const provider = {
        start: jest.fn(async () => {}),
        stop: jest.fn(async () => {}),
        onInstanceLaunched: jest.fn(),
        idleInstances: jest.fn(async () => idle),
        reservedInstances: jest.fn(async () => reserved),
        launchIdle: jest.fn(async () => []),
        terminate: jest.fn(async () => {}),
    }
    const repo = {
        launched: jest.fn(async () => {}),
        terminated: jest.fn(async () => {}),
        reconciled: jest.fn(async () => 0),
        forgotten: jest.fn(async () => 0),
    }
    const component = createWorkerInstanceComponent({
        repo, provider, provisioner: {}, instanceTypes,
    })
    return {component, provider, repo}
}

// SizeIdlePool is the ONLY step that terminates a released instance: releaseInstance merely
// un-reserves it (on AWS, re-tags it State=idle), and the provider's own cleanup only sweeps idle
// instances of an OLDER version. If the sweep is not scheduled, released instances bill forever.
test('terminates surplus idle instances even when no type declares an idle pool', async () => {
    const {component, provider, repo} = build({
        instanceTypes: [{id: 'M5aLarge', idleCount: 0}],
        idle: [{id: 'i-orphan', type: 'M5aLarge'}],
    })

    await component.start()
    await flush()
    component.stop()

    expect(provider.terminate).toHaveBeenCalledWith('i-orphan')
    expect(repo.terminated).toHaveBeenCalledWith('i-orphan')
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

// An idle instance with no row is invisible to RequestInstance but counted by SizeIdlePool, so
// the pool holds a slot open for an instance nobody can ever be given. Reconciling on the same
// tick is what stops that state from being permanent.
test('reconciles the repository against the provider on every sweep', async () => {
    const orphan = {id: 'i-orphan', type: 'T3aSmall'}
    const {component, repo} = build({
        instanceTypes: [{id: 'T3aSmall', idleCount: 1}],
        idle: [orphan],
    })

    await component.start()
    await flush()
    component.stop()

    expect(repo.reconciled).toHaveBeenCalledWith([orphan])
    expect(repo.forgotten).toHaveBeenCalledWith(['i-orphan'])
})

// The sizing is what stops released instances billing forever; a reconcile failure (a DB blip)
// must not take it down with it.
test('sizes the pool even when reconciliation fails', async () => {
    const {component, provider, repo} = build({instanceTypes: [{id: 'T3aSmall', idleCount: 1}]})
    repo.reconciled.mockRejectedValue(new Error('db down'))

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
