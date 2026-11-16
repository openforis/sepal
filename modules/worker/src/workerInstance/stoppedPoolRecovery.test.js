import assert from 'node:assert/strict'
import {test} from 'node:test'

import {sizeIdlePool} from './command/sizeIdlePool.js'

test('a recovered warmed host displaces a warming replacement when the stopped pool is full', async () => {
    const recovered = poolMember('recovered', {imageDiskWarm: true})
    const replacement = poolMember('replacement', {running: true})
    const scenario = poolScenario([recovered, replacement])

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(await scenario.provider.pooledInstances(), [recovered])
    assert.deepEqual(scenario.terminated, [replacement.id])
    assert.deepEqual(scenario.warmUps, [])
    assert.equal(await scenario.claims.sessionIdForInstance(replacement.id), null)
})

test('a known-warm stopped host is kept ahead of an ordinary stopped replacement', async () => {
    const recovered = poolMember('recovered', {imageDiskWarm: true, launchTime: new Date(1000)})
    const replacement = poolMember('replacement')
    const scenario = poolScenario([replacement, recovered])

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(await scenario.provider.pooledInstances(), [recovered])
    assert.deepEqual(scenario.terminated, [replacement.id])
})

test('a ready host is kept ahead of an equally warm pool member that is still running', async () => {
    const ready = poolMember('ready', {imageDiskWarm: true})
    const stopping = poolMember('stopping', {imageDiskWarm: true, running: true})
    const scenario = poolScenario([ready, stopping])

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(await scenario.provider.pooledInstances(), [ready])
    assert.deepEqual(scenario.terminated, [stopping.id])
})

test('a request winning a ready member after the claim snapshot does not evict its warmed replacement', async () => {
    const recovered = poolMember('recovered', {imageDiskWarm: true})
    const requested = poolMember('requested', {imageDiskWarm: true, launchTime: new Date(1000)})
    const scenario = poolScenario([recovered, requested])
    const readClaims = scenario.claims.all
    scenario.claims.all = async () => {
        const snapshot = await readClaims()
        await scenario.claims.claim(requested.id, 'new-session')
        return snapshot
    }

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(scenario.terminated, [])
    assert.equal(await scenario.claims.sessionIdForInstance(requested.id), 'new-session')
    scenario.members.delete(requested.id)

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(await scenario.provider.pooledInstances(), [recovered])
    assert.deepEqual(scenario.terminated, [])
    assert.deepEqual(scenario.warmUps, [])
})

test('a ready host already claimed by a request does not displace its warming replacement', async () => {
    const requested = poolMember('requested', {imageDiskWarm: true})
    const replacement = poolMember('replacement', {running: true})
    const scenario = poolScenario([requested, replacement], [{instanceId: requested.id, sessionId: 'new-session'}])

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(scenario.terminated, [])
    assert.equal(await scenario.claims.sessionIdForInstance(requested.id), 'new-session')
    scenario.members.delete(requested.id)

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(await scenario.provider.pooledInstances(), [replacement])
    assert.deepEqual(scenario.terminated, [])
    assert.deepEqual(scenario.warmUps, [])
})

test('a pooled host whose recovery claim is being deleted still counts toward future capacity', async () => {
    const recovered = poolMember('recovered', {imageDiskWarm: true})
    const scenario = poolScenario([recovered], [{
        instanceId: recovered.id, sessionId: 'old-session', recoveryStartedAt: new Date(0),
    }])

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(await scenario.provider.pooledInstances(), [recovered])
    assert.deepEqual(scenario.terminated, [])
    assert.deepEqual(scenario.warmUps, [])
})

test('an ordinary stopped pool at its target needs no eviction or warm-up', async () => {
    const members = [poolMember('first'), poolMember('second')]
    const scenario = poolScenario(members)

    await sizeIdlePool({}, members.length, scenario)

    assert.deepEqual(await scenario.provider.pooledInstances(), members)
    assert.deepEqual(scenario.terminated, [])
    assert.deepEqual(scenario.warmUps, [])
})

test('recovering reservations are protected and the pool is trimmed after recovery completes', async () => {
    const first = poolMember('first', {imageDiskWarm: true, reservation: {sessionId: 'old-first'}})
    const second = poolMember('second', {
        imageDiskWarm: true, reservation: {sessionId: 'old-second'}, launchTime: new Date(1000),
    })
    const scenario = poolScenario([first, second])

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(scenario.terminated, [])
    assert.deepEqual(scenario.warmUps, [])
    first.reservation = null
    second.reservation = null

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(await scenario.provider.pooledInstances(), [first])
    assert.deepEqual(scenario.terminated, [second.id])
})

test('recovering hosts count toward capacity and the two-warm-up limit', async () => {
    const recovering = poolMember('recovering', {reservation: {sessionId: 'old'}, running: true})
    const scenario = poolScenario([recovering])

    await sizeIdlePool({}, 10, scenario)

    assert.deepEqual(scenario.warmUps, [1])
    assert.deepEqual(scenario.terminated, [])
})

test('a failed replacement eviction is retried without discarding the recovered host', async () => {
    const recovered = poolMember('recovered', {imageDiskWarm: true})
    const replacement = poolMember('replacement', {running: true})
    const scenario = poolScenario([recovered, replacement])
    const terminate = scenario.provider.terminate
    scenario.provider.terminate = async () => { throw new Error('temporary EC2 failure') }

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(await scenario.provider.pooledInstances(), [recovered, replacement])
    assert.equal(await scenario.claims.sessionIdForInstance(replacement.id), null)
    scenario.provider.terminate = terminate

    await sizeIdlePool({}, 1, scenario)

    assert.deepEqual(await scenario.provider.pooledInstances(), [recovered])
    assert.deepEqual(scenario.terminated, [replacement.id])
})

const poolMember = (id, options = {}) => ({
    id, type: 'T3aSmall', running: false, imageDiskWarm: false, reservation: null,
    launchTime: new Date(0), ...options,
})

const poolScenario = (instances, initialClaims = []) => {
    const members = new Map(instances.map(instance => [instance.id, instance]))
    const owners = new Map(initialClaims.map(claim => [claim.instanceId, claim]))
    const terminated = []
    const warmUps = []
    const claims = {
        all: async () => [...owners.values()],
        sessionIdForInstance: async instanceId => owners.get(instanceId)?.sessionId ?? null,
        claim: async (instanceId, sessionId) => {
            if (owners.has(instanceId)) return false
            owners.set(instanceId, {instanceId, sessionId})
            return true
        },
        release: async (instanceId, sessionId) => {
            if (owners.get(instanceId)?.sessionId !== sessionId) return false
            return owners.delete(instanceId)
        },
    }
    const provider = {
        idleInstances: async () => [],
        pooledInstances: async ({ready = false} = {}) => [...members.values()]
            .filter(instance => !ready || !instance.running && !instance.reservation),
        terminate: async instanceId => {
            terminated.push(instanceId)
            members.delete(instanceId)
        },
        launchPooled: async count => { warmUps.push(count) },
    }
    return {provider, claims, members, terminated, warmUps}
}
