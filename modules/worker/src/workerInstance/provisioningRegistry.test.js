// provisionInstance opens by deleting the instance's existing containers, so two overlapping
// provisions of one instance destroy each other's work. The registry is what makes the
// reconcile sweep safe to run next to the event-driven provisioning path.

import {jest} from '@jest/globals'

import {createProvisioningRegistry} from './provisioningRegistry.js'

// A promise the test resolves by hand, so a provision can be held open across assertions
// without a timer — fake timers delete globals in this setup.
const deferred = () => {
    let resolve, reject
    const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
    })
    return {promise, resolve, reject}
}

test('a second provision of the same instance while the first is in flight is dropped', async () => {
    const registry = createProvisioningRegistry()
    const first = deferred()
    const fn = jest.fn(() => first.promise)

    const running = registry.run('i-1', 's-1', fn)
    expect(await registry.run('i-1', 's-2', fn)).toBe(false)
    expect(fn).toHaveBeenCalledTimes(1)

    first.resolve()
    expect(await running).toBe(true)
})

test('isProvisioning reports the in-flight instance and nothing else', async () => {
    const registry = createProvisioningRegistry()
    const first = deferred()

    const running = registry.run('i-1', 's-1', () => first.promise)
    expect(registry.isProvisioning('i-1')).toBe(true)
    expect(registry.isProvisioning('i-2')).toBe(false)

    first.resolve()
    await running
    expect(registry.isProvisioning('i-1')).toBe(false)
})

test('the entry clears when the provision fails, so the next sweep may retry', async () => {
    const registry = createProvisioningRegistry()

    await expect(registry.run('i-1', 's-1', async () => {
        throw new Error('boom')
    })).rejects.toThrow('boom')

    expect(registry.isProvisioning('i-1')).toBe(false)
    expect(await registry.run('i-1', 's-2', async () => {})).toBe(true)
})

test('different instances provision concurrently', async () => {
    const registry = createProvisioningRegistry()
    const a = deferred()
    const b = deferred()

    const runningA = registry.run('i-a', 's-a', () => a.promise)
    const runningB = registry.run('i-b', 's-b', () => b.promise)

    expect(registry.isProvisioning('i-a')).toBe(true)
    expect(registry.isProvisioning('i-b')).toBe(true)

    a.resolve()
    b.resolve()
    expect(await runningA).toBe(true)
    expect(await runningB).toBe(true)
})

// An instance handed back to the pool takes its entry with it: provisioning retries for up to
// seventeen minutes, and an entry nobody is waiting for drops the NEXT session's provisioning.
test('a forgotten instance may be provisioned again while the abandoned provision runs on', async () => {
    const registry = createProvisioningRegistry()
    const abandoned = deferred()
    const successor = deferred()

    const first = registry.run('i-1', 's-1', () => abandoned.promise)
    registry.forget('i-1')
    expect(registry.isProvisioning('i-1')).toBe(false)

    const second = registry.run('i-1', 's-2', () => successor.promise)
    expect(registry.isProvisioning('i-1')).toBe(true)

    // The abandoned provision settling must not clear the successor's entry.
    abandoned.resolve()
    expect(await first).toBe(true)
    expect(registry.isProvisioning('i-1')).toBe(true)

    successor.resolve()
    expect(await second).toBe(true)
    expect(registry.isProvisioning('i-1')).toBe(false)
})

test('forgetting an instance nobody is provisioning is harmless', () => {
    const registry = createProvisioningRegistry()

    expect(registry.forget('i-1')).toBe(false)
    expect(registry.isProvisioning('i-1')).toBe(false)
})
