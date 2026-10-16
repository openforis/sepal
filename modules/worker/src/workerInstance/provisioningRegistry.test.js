import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

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
    const fn = mock.fn(() => first.promise)

    const running = registry.run('i-1', 's-1', fn)
    assert.equal(await registry.run('i-1', 's-2', fn), false)
    assert.equal(fn.mock.callCount(), 1)

    first.resolve()
    assert.equal(await running, true)
})

test('isProvisioning reports the in-flight instance and nothing else', async () => {
    const registry = createProvisioningRegistry()
    const first = deferred()

    const running = registry.run('i-1', 's-1', () => first.promise)
    assert.equal(registry.isProvisioning('i-1'), true)
    assert.equal(registry.isProvisioning('i-2'), false)

    first.resolve()
    await running
    assert.equal(registry.isProvisioning('i-1'), false)
})

test('the entry clears when the provision fails, so the next sweep may retry', async () => {
    const registry = createProvisioningRegistry()

    await assert.rejects(registry.run('i-1', 's-1', async () => {
        throw new Error('boom')
    }), /boom/)

    assert.equal(registry.isProvisioning('i-1'), false)
    assert.equal(await registry.run('i-1', 's-2', async () => {}), true)
})

test('different instances provision concurrently', async () => {
    const registry = createProvisioningRegistry()
    const a = deferred()
    const b = deferred()

    const runningA = registry.run('i-a', 's-a', () => a.promise)
    const runningB = registry.run('i-b', 's-b', () => b.promise)

    assert.equal(registry.isProvisioning('i-a'), true)
    assert.equal(registry.isProvisioning('i-b'), true)

    a.resolve()
    b.resolve()
    assert.equal(await runningA, true)
    assert.equal(await runningB, true)
})

// An instance handed back to the pool takes its entry with it: provisioning retries for up to
// seventeen minutes, and an entry nobody is waiting for drops the NEXT session's provisioning.
test('a forgotten instance may be provisioned again while the abandoned provision runs on', async () => {
    const registry = createProvisioningRegistry()
    const abandoned = deferred()
    const successor = deferred()

    const first = registry.run('i-1', 's-1', () => abandoned.promise)
    registry.forget('i-1')
    assert.equal(registry.isProvisioning('i-1'), false)

    const second = registry.run('i-1', 's-2', () => successor.promise)
    assert.equal(registry.isProvisioning('i-1'), true)

    // The abandoned provision settling must not clear the successor's entry.
    abandoned.resolve()
    assert.equal(await first, true)
    assert.equal(registry.isProvisioning('i-1'), true)

    successor.resolve()
    assert.equal(await second, true)
    assert.equal(registry.isProvisioning('i-1'), false)
})

test('forgetting an instance nobody is provisioning is harmless', () => {
    const registry = createProvisioningRegistry()

    assert.equal(registry.forget('i-1'), false)
    assert.equal(registry.isProvisioning('i-1'), false)
})
