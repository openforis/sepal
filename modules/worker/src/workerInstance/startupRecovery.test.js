import assert from 'node:assert/strict'
import {test} from 'node:test'

import {createInstanceManager} from './instanceManager.js'
import {createProvisioningRegistry} from './provisioningRegistry.js'

test('cancel returns after stop acceptance while a warmed host stays claimed until recovery finishes', async context => {
    const scenario = aRecovery(context)
    await scenario.start()

    await scenario.manager.releaseInstance(INSTANCE.id, SESSION_ID, CANCEL)
    await flush()

    assert.deepEqual(scenario.actions, ['stop'])
    assert.ok((await scenario.claims.all())[0].recoveryStartedAt)
    assert.equal(await scenario.claims.claim(INSTANCE.id, 'next-session'), false)
    assert.equal(scenario.isCurrent(), false)
    scenario.stopped.resolve()
    await scenario.pooled.promise
    await flush()
    assert.deepEqual(scenario.actions, ['stop', 'scratch', 'pool'])
    assert.equal(await scenario.claims.sessionIdForInstance(INSTANCE.id), null)
    assert.equal(scenario.manager.isProvisioning(INSTANCE.id), false)
})

test('a stopped host remains unavailable until its submitted scratch attachment finishes', async context => {
    const scenario = aRecovery(context)
    const attaching = Promise.withResolvers()
    await scenario.start(() => attaching.promise)

    await scenario.manager.releaseInstance(INSTANCE.id, SESSION_ID, CANCEL)
    scenario.stopped.resolve()
    await flush()

    assert.deepEqual(scenario.actions, ['stop'])
    assert.equal(await scenario.claims.claim(INSTANCE.id, 'next-session'), false)
    attaching.resolve('/dev/xvdg')
    await scenario.pooled.promise
    await flush()
    assert.deepEqual(scenario.scratchOptions, {requireAttached: true})
    assert.equal(await scenario.claims.sessionIdForInstance(INSTANCE.id), null)
})

test('an uncertain attachment retires the stopped host instead of making it available', async context => {
    const scenario = aRecovery(context)
    const attaching = Promise.withResolvers()
    await scenario.start(() => attaching.promise)

    await scenario.manager.releaseInstance(INSTANCE.id, SESSION_ID, CANCEL)
    scenario.stopped.resolve()
    attaching.reject(new Error('attachment response lost'))
    await scenario.terminated.promise
    await flush()

    assert.deepEqual(scenario.actions, ['stop', 'terminate'])
    assert.equal(await scenario.claims.sessionIdForInstance(INSTANCE.id), SESSION_ID)
    assert.equal((await scenario.claims.all())[0].recoveryStartedAt, null)
})

test('a scratch attachment that never settles reaches the recovery deadline and retires', async context => {
    context.mock.timers.enable({apis: ['setTimeout']})
    const scenario = aRecovery(context)
    const attaching = Promise.withResolvers()
    try {
        await scenario.start(() => attaching.promise)
        await scenario.manager.releaseInstance(INSTANCE.id, SESSION_ID, CANCEL)
        scenario.stopped.resolve()
        await flush()

        context.mock.timers.tick(10 * 60_000)
        await flush()

        assert.deepEqual(scenario.actions, ['stop', 'terminate'])
        assert.equal(await scenario.claims.sessionIdForInstance(INSTANCE.id), SESSION_ID)
        assert.equal((await scenario.claims.all())[0].recoveryStartedAt, null)
        assert.equal(scenario.manager.isProvisioning(INSTANCE.id), false)
        attaching.resolve('/dev/xvdg')
        await flush()
        assert.deepEqual(scenario.actions, ['stop', 'terminate'])
    } finally {
        attaching.resolve('/dev/xvdg')
    }
})

test('a missing attachment known to have succeeded causes retirement rather than a pool return', async context => {
    const scenario = aRecovery(context, {scratchError: new Error('expected attachment missing')})
    await scenario.start(() => '/dev/xvdg')

    await scenario.manager.releaseInstance(INSTANCE.id, SESSION_ID, CANCEL)
    scenario.stopped.resolve()
    await scenario.terminated.promise
    await flush()

    assert.deepEqual(scenario.actions, ['stop', 'scratch', 'terminate'])
    assert.equal(await scenario.claims.sessionIdForInstance(INSTANCE.id), SESSION_ID)
})

test('reclaim honors durable recovery before filtered absence or claim-age grace after restart', async context => {
    const scenario = aRecovery(context)
    await scenario.claims.startRecovery(INSTANCE.id, SESSION_ID)
    scenario.provider.idleInstances = async () => []
    scenario.provider.reservedInstances = async () => []

    await scenario.manager.reclaimStaleClaims([], 10 * 60_000)

    assert.deepEqual(scenario.actions, ['terminate'])
    assert.equal(await scenario.claims.sessionIdForInstance(INSTANCE.id), SESSION_ID)
    assert.equal((await scenario.claims.all())[0].recoveryStartedAt, null)
})

for (const errorName of ['InvalidInstanceID.NotFound', 'TimeoutError', 'UnauthorizedOperation']) {
    test(`mature absent recovery clears only an unfiltered NotFound, not ${errorName === 'InvalidInstanceID.NotFound' ? 'from a fresh recovery' : errorName}`, async context => {
        const scenario = aRecovery(context)
        await scenario.claims.startRecovery(INSTANCE.id, SESSION_ID)
        scenario.provider.getInstance = async () => { throw Object.assign(new Error(errorName), {name: errorName}) }
        scenario.provider.reservedInstances = async () => []
        scenario.provider.recoveringInstances = async () => []

        await scenario.manager.reclaimStaleClaims([], 10 * 60_000)

        assert.equal(await scenario.claims.sessionIdForInstance(INSTANCE.id), SESSION_ID)
        scenario.claims.ageRecovery()
        await scenario.manager.reclaimStaleClaims([], 10 * 60_000)
        assert.equal(await scenario.claims.sessionIdForInstance(INSTANCE.id), errorName === 'InvalidInstanceID.NotFound' ? null : SESSION_ID)
        assert.deepEqual(scenario.actions, [])
    })
}

test('an orphan recovery that reappears remains discoverable and retires under a new claim', async context => {
    const scenario = aRecovery(context)
    await scenario.claims.release(INSTANCE.id, SESSION_ID)
    scenario.provider.reservedInstances = async () => []
    scenario.provider.recoveringInstances = async () => [{...INSTANCE, launchTime: new Date(0)}]

    await scenario.manager.releaseUnusedInstances([], 5, 'MINUTES')

    assert.deepEqual(scenario.actions, ['terminate'])
    assert.equal(await scenario.claims.sessionIdForInstance(INSTANCE.id), SESSION_ID)
})

const SESSION_ID = 'canceled-session'
const INSTANCE = {
    id: 'i-warmed', type: 'T3aSmall', host: 'worker', running: true, imageDiskWarm: true,
    reservation: {username: 'alice', workerType: 'sandbox', sessionId: SESSION_ID},
}
const CANCEL = {retire: true, recoverStartup: true}

const aRecovery = (context, {scratchError} = {}) => {
    const actions = []
    const stopped = Promise.withResolvers()
    const pooled = Promise.withResolvers()
    const terminated = Promise.withResolvers()
    const finishDocker = Promise.withResolvers()
    const claims = aClaim()
    const provisioning = createProvisioningRegistry()
    let current = () => false
    let scratchOptions
    let task
    const provider = {
        getInstance: async () => INSTANCE,
        idleInstances: async () => [],
        reservedInstances: async () => [INSTANCE],
        recoveringInstances: async () => [],
        beginRecovery: async () => { actions.push('stop') },
        awaitStopped: () => stopped.promise,
        deleteScratchVolume: async (_instanceId, options) => {
            actions.push('scratch')
            scratchOptions = options
            if (scratchError) throw scratchError
        },
        pool: async () => {
            actions.push('pool')
            pooled.resolve()
        },
        terminate: async () => {
            actions.push('terminate')
            terminated.resolve()
        },
    }
    const manager = createInstanceManager({provider, claims, provisioning, provisioner: {}, instanceTypes: []})
    context.after(async () => {
        stopped.resolve()
        finishDocker.resolve()
        await task
        await flush()
    })
    return {
        manager, provider, claims, actions, stopped, pooled, terminated,
        isCurrent: () => current(),
        get scratchOptions() { return scratchOptions },
        start: async (attach = () => null) => {
            const submitted = Promise.withResolvers()
            task = provisioning.run(INSTANCE.id, SESSION_ID, async (isCurrent, {prepareScratch}) => {
                current = isCurrent
                const attaching = prepareScratch(attach)
                submitted.resolve()
                await attaching
                await finishDocker.promise
            }).catch(() => {})
            await submitted.promise
            await flush()
        },
    }
}

const aClaim = () => {
    let owner = SESSION_ID
    let recoveryStartedAt = null
    return {
        claim: async (_id, sessionId) => {
            if (owner !== null) return false
            owner = sessionId
            return true
        },
        sessionIdForInstance: async () => owner,
        all: async () => owner === null ? [] : [{
            instanceId: INSTANCE.id, sessionId: owner, claimedAt: new Date(), recoveryStartedAt,
        }],
        startRecovery: async (_id, sessionId) => {
            if (owner !== sessionId) return false
            recoveryStartedAt ??= new Date()
            return true
        },
        finishRecovery: async (_id, sessionId) => {
            if (owner === sessionId) recoveryStartedAt = null
        },
        ageRecovery: () => { recoveryStartedAt = new Date(Date.now() - 11 * 60_000) },
        release: async (_id, sessionId) => {
            if (owner !== sessionId) return false
            owner = null
            return true
        },
    }
}

const flush = () => new Promise(resolve => setImmediate(resolve))
