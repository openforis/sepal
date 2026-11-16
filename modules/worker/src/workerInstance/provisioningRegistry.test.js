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

test('release cancels an active provision and gates new starts until retirement succeeds', async () => {
    const registry = createProvisioningRegistry()
    const abandoned = deferred()
    const successor = deferred()

    const first = registry.run('i-1', 's-1', () => abandoned.promise)
    const release = registry.beginRelease('i-1', 's-1')
    assert.equal(release.retire, true)
    assert.equal(await registry.run('i-1', 's-2', async () => {}), false)
    registry.finishRelease('i-1', release)

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

test('a canceled provision stays canceled even if its own session starts another attempt', async () => {
    const registry = createProvisioningRegistry()
    const abandoned = deferred()
    let isCurrent

    const first = registry.run('i-1', 's-1', current => {
        isCurrent = current
        return abandoned.promise
    })
    assert.equal(isCurrent(), true)

    const release = registry.beginRelease('i-1', 's-1')
    assert.equal(isCurrent(), false)
    registry.finishRelease('i-1', release)
    const second = registry.run('i-1', 's-1', async () => {})
    assert.equal(isCurrent(), false)

    abandoned.resolve()
    await Promise.all([first, second])
})

test('release gates an idle registry entry without requiring retirement', async () => {
    const registry = createProvisioningRegistry()

    const release = registry.beginRelease('i-1', 's-1')
    assert.equal(release.retire, false)
    assert.equal(await registry.run('i-1', 's-2', async () => {}), false)
    registry.finishRelease('i-1', release)
    assert.equal(registry.isProvisioning('i-1'), false)
})

test('retirement remains required after the canceled attempt settles', async () => {
    const registry = createProvisioningRegistry()
    const pending = deferred()
    const running = registry.run('i-1', 's-1', () => pending.promise)
    const firstRelease = registry.beginRelease('i-1', 's-1')
    pending.resolve()
    await running

    const retry = registry.beginRelease('i-1', 's-1')
    assert.equal(retry.retire, true)
    registry.finishRelease('i-1', firstRelease)
    assert.equal(registry.isProvisioning('i-1'), true)
    registry.finishRelease('i-1', retry)
})

test('a release cannot cancel another session\'s active provision', async () => {
    const registry = createProvisioningRegistry()
    const pending = deferred()
    let isCurrent
    const running = registry.run('i-1', 's-bob', current => {
        isCurrent = current
        return pending.promise
    })

    assert.equal(registry.beginRelease('i-1', 's-alice'), null)
    assert.equal(isCurrent(), true)
    pending.resolve()
    await running
})

test('pending release snapshots exclude provisions and become stale when their entry is replaced or cleared', async () => {
    const registry = createProvisioningRegistry()
    const pending = deferred()
    const running = registry.run('i-provision', 's-provision', () => pending.promise)
    registry.beginRelease('i-retire', 's-retire', {retire: true})
    const normalToken = registry.beginRelease('i-normal', 's-normal')
    const snapshot = registry.pendingReleases()

    assert.deepEqual(snapshot.map(({instanceId, sessionId}) => ({instanceId, sessionId})), [
        {instanceId: 'i-retire', sessionId: 's-retire'},
        {instanceId: 'i-normal', sessionId: 's-normal'},
    ])
    assert.equal(snapshot[0].isCurrent(), true)
    assert.equal(snapshot[1].isCurrent(), true)

    registry.beginRelease('i-retire', 's-retire', {retire: true})
    registry.finishRelease('i-normal', normalToken)
    assert.equal(snapshot[0].isCurrent(), false)
    assert.equal(snapshot[1].isCurrent(), false)
    snapshot[0].finish()
    assert.equal(registry.isProvisioning('i-retire'), true)

    pending.resolve()
    await running
})
