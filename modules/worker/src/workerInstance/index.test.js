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

const build = ({instanceTypes, idle = []}) => {
    const provider = {
        start: jest.fn(async () => {}),
        stop: jest.fn(async () => {}),
        onInstanceLaunched: jest.fn(),
        idleInstances: jest.fn(async () => idle),
        launchIdle: jest.fn(async () => []),
        terminate: jest.fn(async () => {}),
    }
    const repo = {launched: jest.fn(async () => {}), terminated: jest.fn(async () => {})}
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

test('stop() halts the provider and the sweep', async () => {
    const {component, provider} = build({instanceTypes: [{id: 'T3aSmall', idleCount: 1}]})

    await component.start()
    await flush()
    await component.stop()

    expect(provider.stop).toHaveBeenCalled()
})
