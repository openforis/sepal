import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

import {createLocalInstanceProvider, LOCAL_HOST} from '../hostingService/local/localInstanceProvider.js'
import {createDockerInstanceProvisioner} from './dockerInstanceProvisioner.js'
import {instanceEvents} from './events.js'
import {createWorkerInstanceComponent} from './index.js'
import {createInstanceManager} from './instanceManager.js'

test('canceling a provider-launched provision stops before Docker after scratch attachment finishes', async context => {
    const attachmentStarted = Promise.withResolvers()
    const attachment = Promise.withResolvers()
    const instance = reservedInstance()
    const dockerMethods = []
    const originalFetch = globalThis.fetch
    context.after(() => { globalThis.fetch = originalFetch })
    globalThis.fetch = async (url, options) => {
        dockerMethods.push(options?.method ?? 'GET')
        if (url.includes('/containers/json')) return response([])
        if (url.endsWith('/wait')) return response({StatusCode: 0})
        return response({Id: 'docker-resource'})
    }
    let launched
    const provider = {
        onInstanceLaunched: listener => { launched = listener },
        getInstance: async () => instance,
        attachScratchVolume: async () => {
            attachmentStarted.resolve()
            await attachment.promise
            return '/dev/xvdg'
        },
        deleteScratchVolume: async () => {},
        release: mock.fn(async () => {}),
        terminate: mock.fn(async () => {}),
    }
    const provisioner = createDockerInstanceProvisioner({
        config: {dockerPort: 2375, dockerEntryPoint: 'v1.44', sepalHostDataDir: '/data'},
        instanceTypes: [{id: 'T3aSmall', ramBytes: 2 ** 31, devices: []}],
        sandboxSessionApiKey: {apiKeyForSession: async () => 'session-key'},
        userPublicKeys: {publicKey: async () => ''},
    })
    const claims = {sessionIdForInstance: async () => instance.reservation.sessionId, release: mock.fn(async () => true)}
    const component = createWorkerInstanceComponent({claims, provider, provisioner, instanceTypes: []})
    context.after(() => instanceEvents.removeAllListeners())

    launched(instance)
    await attachmentStarted.promise
    await component.instanceManager.releaseInstance(instance.id, instance.reservation.sessionId, {retire: true})
    attachment.resolve()
    await flush()

    assert.deepEqual(callsOf(provider.terminate), [[instance.id]])
    assert.deepEqual(dockerMethods, [])
    assert.equal(provider.release.mock.callCount(), 0)
    assert.equal(claims.release.mock.callCount(), 0)
})

test('a late launch event for a closed session cannot mutate Docker after retirement completes', async context => {
    context.mock.timers.enable({apis: ['setTimeout']})
    const instance = reservedInstance()
    let owner = instance.reservation.sessionId
    let launched
    const methods = []
    const originalFetch = globalThis.fetch
    context.after(() => {
        globalThis.fetch = originalFetch
        instanceEvents.removeAllListeners()
    })
    globalThis.fetch = async (url, options) => {
        methods.push(options?.method ?? 'GET')
        if (url.includes('/containers/json')) return response([])
        if (url.endsWith('/wait')) return response({StatusCode: 0})
        return response({Id: 'created'})
    }
    const provider = {
        onInstanceLaunched: listener => { launched = listener },
        getInstance: async () => instance,
        attachScratchVolume: async () => null,
        deleteScratchVolume: async () => {},
        release: async () => {},
        terminate: async () => {},
    }
    const claims = {sessionIdForInstance: async () => owner, release: async () => true}
    const provisioner = createDockerInstanceProvisioner({
        config: {dockerPort: 2375, dockerEntryPoint: 'v1.44', sepalHostDataDir: '/data'},
        instanceTypes: [{id: 'T3aSmall', ramBytes: 2 ** 31, devices: []}],
        sandboxSessionApiKey: {apiKeyForSession: async () => null},
        userPublicKeys: {publicKey: async () => ''},
    })
    const {instanceManager: manager} = createWorkerInstanceComponent({claims, provider, provisioner, instanceTypes: []})

    await manager.releaseInstance(instance.id, instance.reservation.sessionId, {retire: true})
    launched(instance)
    await flush()
    owner = 's-next'
    context.mock.timers.tick(1000)
    await flush()

    assert.deepEqual(methods.filter(method => method !== 'GET'), [])
    assert.equal(manager.isProvisioning(instance.id), false)
})

test('a new owner starts while the previous release waits for its committed claim deletion response', async context => {
    const provider = createLocalInstanceProvider()
    const alice = provider.launchReserved('T3aSmall', {username: 'alice', workerType: 'sandbox', sessionId: 's-alice'})
    const claims = claimsFor(alice)
    const deleted = Promise.withResolvers()
    const deleteResponse = Promise.withResolvers()
    const finishProvision = Promise.withResolvers()
    const releaseClaim = claims.release
    claims.release = async (instanceId, sessionId) => {
        const released = await releaseClaim(instanceId, sessionId)
        if (sessionId === 's-alice') {
            deleted.resolve()
            await deleteResponse.promise
        }
        return released
    }
    provider.onInstanceLaunched = () => {}
    const provisioner = {
        undeploy: async () => {},
        provisionInstance: mock.fn(() => finishProvision.promise),
    }
    const {instanceManager: manager} = createWorkerInstanceComponent({claims, provider, provisioner, instanceTypes: []})
    context.after(() => instanceEvents.removeAllListeners())
    const release = manager.releaseInstance(alice.id, 's-alice')

    try {
        await deleted.promise
        const bob = await manager.requestInstance({
            id: 's-bob', username: 'bob', workerType: 'sandbox', instanceType: 'T3aSmall',
        })
        await flush()

        assert.equal(bob.id, alice.id)
        assert.equal(provisioner.provisionInstance.mock.callCount(), 1)
        assert.equal(provisioner.provisionInstance.mock.calls[0].arguments[0].reservation.sessionId, 's-bob')
        deleteResponse.resolve()
        await release
        assert.equal(manager.isProvisioning(bob.id), true)
        assert.equal(await claims.sessionIdForInstance(bob.id), 's-bob')
        assert.equal(provider.getInstance(bob.id).reservation.sessionId, 's-bob')
    } finally {
        deleteResponse.resolve()
        finishProvision.resolve()
        await release
        await flush()
    }
})

test('a delayed foreign start cannot make reclaim drop a canceled owner before retirement', async context => {
    const provider = createLocalInstanceProvider()
    const oldSession = provider.launchReserved('T3aSmall', {username: 'old', workerType: 'sandbox', sessionId: 's-old'})
    const claims = claimsFor(oldSession)
    const readOwner = claims.sessionIdForInstance
    const foreignRead = Promise.withResolvers()
    const foreignResponse = Promise.withResolvers()
    let pauseForeignRead = false
    claims.sessionIdForInstance = async instanceId => {
        const owner = await readOwner(instanceId)
        if (pauseForeignRead) {
            pauseForeignRead = false
            foreignRead.resolve()
            await foreignResponse.promise
        }
        return owner
    }
    let launched
    provider.onInstanceLaunched = listener => { launched = listener }
    const acceptedDocker = Promise.withResolvers()
    const dockerResponse = Promise.withResolvers()
    const provisioner = {
        undeploy: async () => {},
        provisionInstance: mock.fn(async () => {
            acceptedDocker.resolve()
            await dockerResponse.promise
        }),
    }
    const {instanceManager: manager} = createWorkerInstanceComponent({claims, provider, provisioner, instanceTypes: []})
    const terminate = provider.terminate
    provider.terminate = mock.fn(terminate)
    context.after(() => instanceEvents.removeAllListeners())
    const releaseRead = Promise.withResolvers()
    const releaseResponse = Promise.withResolvers()
    let closing

    try {
        await manager.releaseInstance(oldSession.id, 's-old')
        const alice = await manager.requestInstance({
            id: 's-alice', username: 'alice', workerType: 'sandbox', instanceType: 'T3aSmall',
        })
        await acceptedDocker.promise
        assert.equal(alice.id, oldSession.id)
        const getInstance = provider.getInstance
        let pauseReleaseRead = true
        provider.getInstance = async instanceId => {
            const snapshot = getInstance(instanceId)
            if (pauseReleaseRead) {
                pauseReleaseRead = false
                releaseRead.resolve()
                await releaseResponse.promise
            }
            return snapshot
        }

        closing = manager.releaseInstance(alice.id, 's-alice', {retire: true})
        await releaseRead.promise
        pauseForeignRead = true
        launched(oldSession)
        await foreignRead.promise
        releaseResponse.resolve()
        await closing
        await manager.reclaimStaleClaims([], 0)

        assert.equal(await readOwner(alice.id), 's-alice')
        assert.equal(getInstance(alice.id).reservation.sessionId, 's-alice')
        assert.equal(provider.terminate.mock.callCount(), 0)
        foreignResponse.resolve()
        await flush()
        await manager.reclaimStaleClaims([], 0)

        assert.equal(getInstance(alice.id), null)
        assert.equal(await readOwner(alice.id), 's-alice')
        assert.deepEqual(callsOf(provider.terminate), [[alice.id]])
        await manager.reclaimStaleClaims([], 0)
        assert.equal(await readOwner(alice.id), null)
        assert.equal(manager.isProvisioning(alice.id), false)
        assert.equal(provisioner.provisionInstance.mock.callCount(), 1)
    } finally {
        releaseResponse.resolve()
        foreignResponse.resolve()
        dockerResponse.resolve()
        await closing
        await flush()
    }
})

test('retired local cleanup continues after its gate finishes and removes only that instance', async context => {
    const provider = createLocalInstanceProvider()
    const retired = provider.launchReserved('T3aSmall', {username: 'alice', workerType: 'sandbox', sessionId: 's-alice'})
    const other = provider.launchReserved('T3aSmall', {username: 'bob', workerType: 'sandbox', sessionId: 's-bob'})
    const listing = Promise.withResolvers()
    const resume = Promise.withResolvers()
    const removed = []
    const originalFetch = globalThis.fetch
    context.after(() => { globalThis.fetch = originalFetch })
    globalThis.fetch = async (url, options) => {
        const path = new URL(url).pathname
        if (path.endsWith('/containers/json')) {
            listing.resolve()
            await resume.promise
            return response([
                {Id: 'retired-container', Names: [`/sandbox.alice.${retired.id}`]},
                {Id: 'other-container', Names: [`/sandbox.bob.${other.id}`]},
            ])
        }
        assert.equal(options.method, 'DELETE')
        removed.push(path)
        return response({})
    }
    const provisioner = createDockerInstanceProvisioner({
        config: {dockerPort: 2375, dockerEntryPoint: 'v1.44'}, instanceTypes: [],
    })
    const claims = {sessionIdForInstance: async () => 's-alice', release: mock.fn(async () => true)}
    const manager = createInstanceManager({provider, provisioner, claims, instanceTypes: []})

    try {
        await manager.releaseInstance(retired.id, 's-alice', {retire: true})
        await listing.promise
        assert.equal(manager.isProvisioning(retired.id), false)
    } finally {
        resume.resolve()
        await flush()
    }

    assert.deepEqual(removed, [
        '/v1.44/containers/retired-container',
        `/v1.44/volumes/sepal-tmp.${retired.id}`,
    ])
    assert.equal(provider.getInstance(retired.id), null)
    assert.equal(provider.getInstance(other.id), other)
    assert.equal(claims.release.mock.callCount(), 0)
})

test('the orphan sweep recovers local cleanup after a temporary daemon failure', async context => {
    const provider = createLocalInstanceProvider()
    const instance = provider.launchReserved('T3aSmall', {username: 'alice', workerType: 'sandbox', sessionId: 's-alice'})
    const claims = claimsFor(instance)
    const container = `/sandbox.alice.${instance.id}`
    const volume = `sepal-tmp.${instance.id}`
    const deleted = []
    let daemonAvailable = false
    const originalFetch = globalThis.fetch
    context.after(() => { globalThis.fetch = originalFetch })
    globalThis.fetch = async (url, options) => {
        if (!daemonAvailable) throw new Error('Docker temporarily unavailable')
        const path = new URL(url).pathname
        if (options?.method === 'DELETE') {
            deleted.push(path)
            return response({})
        }
        if (path.endsWith('/containers/json')) return response([{Id: 'orphan-container', Names: [container], Created: 0}])
        if (path.endsWith('/volumes')) return response({Volumes: [{Name: volume, CreatedAt: new Date(0).toISOString()}]})
        assert.fail(`Unexpected Docker request: ${path}`)
    }
    const provisioner = createDockerInstanceProvisioner({
        config: {dockerPort: 2375, dockerEntryPoint: 'v1.44'}, instanceTypes: [], defaultDaemonHost: LOCAL_HOST,
    })
    const manager = createInstanceManager({claims, provider, provisioner, instanceTypes: []})

    await manager.releaseInstance(instance.id, 's-alice', {retire: true})
    await flush()
    assert.equal(provider.getInstance(instance.id), null)
    assert.equal(manager.isProvisioning(instance.id), false)
    assert.deepEqual(deleted, [])
    daemonAvailable = true
    const removed = await manager.removeOrphanedContainers([])

    assert.deepEqual(removed, [container, volume])
    assert.deepEqual(deleted, ['/v1.44/containers/orphan-container', `/v1.44/volumes/${volume}`])
})

const reservedInstance = () => ({
    id: 'i-pending', type: 'T3aSmall', host: 'worker-host', running: true,
    reservation: {username: 'alice', workerType: 'sandbox', sessionId: 's-alice'},
})

const flush = () => new Promise(resolve => setImmediate(resolve))
const response = body => ({ok: true, status: 200, text: async () => JSON.stringify(body)})

const claimsFor = instance => {
    const owners = new Map([[instance.id, instance.reservation.sessionId]])
    return {
        sessionIdForInstance: async instanceId => owners.get(instanceId) ?? null,
        all: async () => [...owners].map(([instanceId, sessionId]) => ({instanceId, sessionId, claimedAt: new Date(0)})),
        claim: async (instanceId, sessionId) => {
            if (owners.has(instanceId)) return false
            owners.set(instanceId, sessionId)
            return true
        },
        release: async (instanceId, sessionId) => {
            if (owners.get(instanceId) !== sessionId) return false
            return owners.delete(instanceId)
        },
    }
}
