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

test('a different session replaces a release entry without reviving canceled callbacks', async () => {
    const registry = createProvisioningRegistry()
    const oldAttempt = deferred()
    const newAttempt = deferred()
    let oldIsCurrent
    const oldRunning = registry.run('i-1', 's-alice', isCurrent => {
        oldIsCurrent = isCurrent
        return oldAttempt.promise
    })
    const release = registry.beginRelease('i-1', 's-alice')
    const provision = mock.fn(() => newAttempt.promise)

    const newRunning = registry.run('i-1', 's-bob', provision)

    try {
        assert.equal(provision.mock.callCount(), 1)
        assert.equal(oldIsCurrent(), false)
        assert.equal(release.isCurrent(), false)
        registry.finishRelease('i-1', release)
        oldAttempt.resolve()
        await oldRunning
        assert.equal(registry.isProvisioning('i-1'), true)
    } finally {
        oldAttempt.resolve()
        newAttempt.resolve()
        await Promise.all([oldRunning, newRunning])
    }
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

test('a successful scratch retry cannot erase an earlier uncertain attachment', async () => {
    const registry = createProvisioningRegistry()
    const pending = deferred()
    const ready = deferred()
    const running = registry.run('i-1', 's-1', async (_isCurrent, {prepareScratch}) => {
        await assert.rejects(prepareScratch(() => { throw new Error('attachment response lost') }))
        await prepareScratch(() => '/dev/xvdg')
        ready.resolve()
        await pending.promise
    })
    await ready.promise
    const release = registry.beginRelease('i-1', 's-1', {retire: true})
    assert.equal(release.retire, true)
    await assert.rejects(release.scratch, /attachment response lost/)
    assert.equal(await registry.run('i-1', 's-1', async () => {}), false)
    assert.equal(release.isCurrent(), true)

    pending.resolve()
    await running
    registry.finishRelease('i-1', release)
})

test('release cancels an active provision and drops starts from the same session', async () => {
    const registry = createProvisioningRegistry()
    const abandoned = deferred()
    const successor = deferred()

    const first = registry.run('i-1', 's-1', () => abandoned.promise)
    const release = registry.beginRelease('i-1', 's-1')
    assert.equal(release.retire, true)
    assert.equal(await registry.run('i-1', 's-1', async () => {}), false)
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
    assert.equal(await registry.run('i-1', 's-1', async () => {}), false)
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
