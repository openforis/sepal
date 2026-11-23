import assert from 'node:assert/strict'
import {before, beforeEach, describe, mock, test} from 'node:test'

import {callsOf, inSequence} from '#sepal/testSupport/mock'

import {reclaimStaleClaims as reconcileGoneClaims} from './command/reclaimStaleClaims.js'
import {createProvisioningRegistry} from './provisioningRegistry.js'

const makeInstance = (overrides = {}) => ({
    id: 'i-001',
    type: 'T3aSmall',
    host: 'host.docker.internal',
    running: true,
    launchTime: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago
    reservation: null,
    ...overrides,
})

const makeReservedInstance = (overrides = {}) =>
    makeInstance({reservation: {username: 'alice', workerType: 'SANDBOX'}, ...overrides})

describe('events — routing keys and payload shapes', () => {
    let events
    const collected = {}

    before(async () => {
        events = await import('./events.js')
        const keys = [
            'instanceLaunched$',
            'instancePendingProvisioning$',
            'instanceProvisioned$',
            'instanceReleased$',
            'failedToProvisionInstance$',
            'failedToReleaseInstance$',
            'failedToRequestInstance$',
        ]
        for (const k of keys) {
            collected[k] = []
            events[k].subscribe(v => collected[k].push(v))
        }
    })

    beforeEach(() => {
        for (const k of Object.keys(collected)) collected[k] = []
    })

    test('WORKER_INSTANCE_PUBLISHERS has all 7 routing keys', () => {
        const keys = events.WORKER_INSTANCE_PUBLISHERS.map(p => p.key)
        assert.ok(keys.includes('workerInstance.InstanceLaunched'))
        assert.ok(keys.includes('workerInstance.InstancePendingProvisioning'))
        assert.ok(keys.includes('workerInstance.InstanceProvisioned'))
        assert.ok(keys.includes('workerInstance.InstanceReleased'))
        assert.ok(keys.includes('workerInstance.FailedToProvisionInstance'))
        assert.ok(keys.includes('workerInstance.FailedToReleaseInstance'))
        assert.ok(keys.includes('workerInstance.FailedToRequestInstance'))
        assert.equal(keys.length, 7)
    })

    test('emitInstanceLaunched publishes {instance} to instanceLaunched$', () => {
        const inst = makeInstance()
        events.emitInstanceLaunched(inst)
        assert.equal(collected['instanceLaunched$'].length, 1)
        assert.deepEqual(collected['instanceLaunched$'][0], {instance: inst})
    })

    test('emitInstancePendingProvisioning publishes {instance} + fires in-proc event', () => {
        const inst = makeReservedInstance()
        const inProcPayloads = []
        events.instanceEvents.once('InstancePendingProvisioning', i => inProcPayloads.push(i))
        events.emitInstancePendingProvisioning(inst)
        assert.equal(collected['instancePendingProvisioning$'].length, 1)
        assert.deepEqual(collected['instancePendingProvisioning$'][0], {instance: inst})
        assert.equal(inProcPayloads.length, 1)
        assert.equal(inProcPayloads[0], inst)
    })

    test('emitInstanceProvisioned publishes {instance} + fires in-proc InstanceProvisioned', () => {
        const inst = makeReservedInstance()
        const inProcPayloads = []
        events.instanceEvents.once('InstanceProvisioned', i => inProcPayloads.push(i))
        events.emitInstanceProvisioned(inst)
        assert.equal(collected['instanceProvisioned$'].length, 1)
        assert.deepEqual(collected['instanceProvisioned$'][0], {instance: inst})
        assert.equal(inProcPayloads.length, 1)
    })

    test('emitInstanceReleased publishes {instance}', () => {
        const inst = makeInstance()
        events.emitInstanceReleased(inst)
        assert.deepEqual(collected['instanceReleased$'][0], {instance: inst})
    })

    test('emitFailedToProvisionInstance publishes {instance, error} (string)', () => {
        const inst = makeInstance()
        const err = new Error('docker timeout')
        events.emitFailedToProvisionInstance(inst, err)
        const payload = collected['failedToProvisionInstance$'][0]
        assert.equal(payload.instance, inst)
        assert.equal(typeof payload.error, 'string')
        assert.equal(payload.error, 'docker timeout')
    })

    test('emitFailedToReleaseInstance publishes {instanceId, error} — NOT instance object', () => {
        events.emitFailedToReleaseInstance('i-999', new Error('ssh fail'))
        const payload = collected['failedToReleaseInstance$'][0]
        assert.equal(payload.instanceId, 'i-999')
        assert.equal(payload.error, 'ssh fail')
        assert.ok(!('instance' in Object(payload)))
    })

    test('emitFailedToRequestInstance publishes {workerType, instanceType, exception}', () => {
        events.emitFailedToRequestInstance('SANDBOX', 'T3aSmall', new Error('quota'))
        const payload = collected['failedToRequestInstance$'][0]
        assert.equal(payload.workerType, 'SANDBOX')
        assert.equal(payload.instanceType, 'T3aSmall')
        assert.equal(payload.exception, 'quota')
    })
})

describe('requestInstance', () => {
    let requestInstance, events

    before(async () => {
        ;({requestInstance} = await import('./command/requestInstance.js'))
        events = await import('./events.js')
    })

    const makeClaims = (overrides = {}) => ({
        claim: mock.fn(async () => true),
        release: mock.fn(async () => true),
        ...overrides,
    })

    const makeProvider = (overrides = {}) => ({
        idleInstances: mock.fn(async () => []),
        pooledInstances: mock.fn(async () => []),
        startPooled: mock.fn(async (instance, instanceType, reservation) =>
            ({...instance, type: instanceType, host: null, reservation})),
        launchReserved: mock.fn(async () => makeReservedInstance({id: 'i-new'})),
        reserve: mock.fn(async () => undefined),
        awaitHost: mock.fn(async instance => instance),
        ...overrides,
    })

    const REQUEST = {workerType: 'SANDBOX', instanceType: 'T3aSmall', username: 'alice', sessionId: 's-42'}

    test('no idle instance: launches, records the claim, emits InstanceLaunched', async () => {
        const launched = []
        events.instanceLaunched$.subscribe(v => launched.push(v))
        const claims = makeClaims()
        const provider = makeProvider()

        const result = await requestInstance(REQUEST, {claims, provider})

        assert.deepEqual(callsOf(provider.launchReserved), [
            ['T3aSmall', {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'}]
        ])
        assert.deepEqual(callsOf(claims.claim), [['i-new', 's-42']])
        assert.equal(result.id, 'i-new')
        assert.ok(launched.length >= 1)
    })

    test('idle instance: claims it, tags the reservation, emits InstancePendingProvisioning', async () => {
        const pending = []
        events.instancePendingProvisioning$.subscribe(v => pending.push(v))
        const idle = makeInstance({id: 'i-idle', host: '1.2.3.4', running: true})
        const claims = makeClaims()
        const provider = makeProvider({idleInstances: mock.fn(async () => [idle])})

        const result = await requestInstance(REQUEST, {claims, provider})

        assert.deepEqual(callsOf(claims.claim), [['i-idle', 's-42']])
        assert.equal(provider.launchReserved.mock.callCount(), 0)
        assert.deepEqual(
            provider.reserve.mock.calls[0].arguments[0].reservation,
            {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'}
        )
        assert.equal(result.id, 'i-idle')
        assert.ok(pending.length >= 1)
    })

    // The behaviour this redesign exists for: a lost race must not launch while idle instances remain.
    test('lost claim on the first candidate: claims the second instead of launching', async () => {
        const idle1 = makeInstance({id: 'i-1', host: '1.1.1.1', running: true})
        const idle2 = makeInstance({id: 'i-2', host: '2.2.2.2', running: true})
        const claims = makeClaims({
            claim: mock.fn(inSequence([async () => false, async () => true])),
        })
        const provider = makeProvider({idleInstances: mock.fn(async () => [idle1, idle2])})

        const result = await requestInstance(REQUEST, {claims, provider})

        assert.deepEqual(callsOf(claims.claim).map(([id]) => id), ['i-1', 'i-2'])
        assert.equal(provider.launchReserved.mock.callCount(), 0)
        assert.equal(result.id, 'i-2')
    })

    test('every candidate taken: falls back to launching', async () => {
        const idle = makeInstance({id: 'i-1', host: '1.1.1.1', running: true})
        const claims = makeClaims({claim: mock.fn(inSequence([async () => false, async () => true]))})
        const provider = makeProvider({idleInstances: mock.fn(async () => [idle])})

        const result = await requestInstance(REQUEST, {claims, provider})

        assert.equal(provider.launchReserved.mock.callCount(), 1)
        assert.equal(result.id, 'i-new')
    })

    // Booted before booting; oldest first within each group.
    test('prefers a booted instance over a booting one, oldest first', async () => {
        const booting = makeInstance({id: 'i-booting', host: null, running: false, launchTime: new Date(1000)})
        const newBooted = makeInstance({id: 'i-new-booted', host: '2.2.2.2', running: true, launchTime: new Date(3000)})
        const oldBooted = makeInstance({id: 'i-old-booted', host: '1.1.1.1', running: true, launchTime: new Date(2000)})
        const claims = makeClaims()
        const provider = makeProvider({
            idleInstances: mock.fn(async () => [booting, newBooted, oldBooted]),
        })

        await requestInstance(REQUEST, {claims, provider})

        assert.equal(claims.claim.mock.calls[0].arguments[0], 'i-old-booted')
    })

    test('claims a booting instance and waits for its address', async () => {
        const booting = makeInstance({id: 'i-booting', host: null, running: false})
        const claims = makeClaims()
        const provider = makeProvider({
            idleInstances: mock.fn(async () => [booting]),
            awaitHost: mock.fn(async instance => ({...instance, host: '9.9.9.9'})),
        })

        const result = await requestInstance(REQUEST, {claims, provider})

        assert.equal(provider.awaitHost.mock.callCount(), 1)
        assert.equal(result.host, '9.9.9.9')
    })

    const RESERVATION = {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'}

    // Without this the instance is claimed forever with no session behind it — the exact
    // failure mode this redesign removes.
    test('a failure after claiming releases the claim', async () => {
        const idle = makeInstance({id: 'i-idle', host: '1.2.3.4', running: true})
        const claims = makeClaims()
        const provider = makeProvider({
            idleInstances: mock.fn(async () => [idle]),
            reserve: mock.fn(async () => {
                throw new Error('tagging failed')
            }),
        })

        await assert.rejects(requestInstance(REQUEST, {claims, provider}), /tagging failed/)
        assert.deepEqual(callsOf(claims.release), [['i-idle', REQUEST.sessionId]])
    })

    // A failed launch-path claim costs the instance its protection from ReleaseUnusedInstances,
    // but failing the request would strand a running machine — the worse of the two.
    test('a failed claim on the launch path does not fail the request', async () => {
        const claims = makeClaims({claim: mock.fn(async () => {
            throw new Error('db down')
        })})
        const provider = makeProvider()

        const result = await requestInstance(REQUEST, {claims, provider})

        assert.equal(result.id, 'i-new')
    })

    // launchReserved returns as soon as the instance is tagged State=reserved; waiting for its
    // address after that can take minutes. Claiming only afterwards leaves an instance reserved
    // with no claim and no session — ReleaseUnusedInstances hands it to somebody else mid-request.
    test('the launch path records the claim before waiting for the address', async () => {
        const claims = makeClaims()
        let claimedBeforeWait = null
        const provider = makeProvider({
            launchReserved: mock.fn(
                async () => makeReservedInstance({id: 'i-new', host: null, running: false})
            ),
            awaitHost: mock.fn(async instance => {
                claimedBeforeWait = claims.claim.mock.callCount() > 0
                return {...instance, host: '9.9.9.9'}
            }),
        })

        const result = await requestInstance(REQUEST, {claims, provider})

        assert.equal(claimedBeforeWait, true)
        assert.equal(result.host, '9.9.9.9')
    })

    // Provisioning starts from the request, as for an idle instance, rather than waiting for the
    // started-instance poll to notice the start.
    test('no idle instance: starts the oldest ready pooled instance as the requested type', async () => {
        const pending = []
        events.instancePendingProvisioning$.subscribe(v => pending.push(v))
        const older = makeInstance({id: 'i-pooled-old', type: 'T3aSmall', host: null, running: false, launchTime: new Date(1000)})
        const newer = makeInstance({id: 'i-pooled-new', type: 'T3aSmall', host: null, running: false, launchTime: new Date(2000)})
        const claims = makeClaims()
        const provider = makeProvider({
            pooledInstances: mock.fn(async () => [newer, older]),
            awaitHost: mock.fn(async instance => ({...instance, host: '9.9.9.9'})),
        })

        const result = await requestInstance({...REQUEST, instanceType: 'M6aXlarge'}, {claims, provider})

        assert.deepEqual(callsOf(provider.pooledInstances), [[{ready: true}]])
        assert.deepEqual(callsOf(claims.claim), [['i-pooled-old', 's-42']])
        assert.deepEqual(callsOf(provider.startPooled), [[older, 'M6aXlarge', RESERVATION]])
        assert.equal(provider.launchReserved.mock.callCount(), 0)
        assert.partialDeepStrictEqual(
            result,
            {id: 'i-pooled-old', type: 'M6aXlarge', host: '9.9.9.9', reservation: RESERVATION}
        )
        assert.partialDeepStrictEqual(
            pending[pending.length - 1].instance,
            {id: 'i-pooled-old', type: 'M6aXlarge', reservation: RESERVATION}
        )
    })

    test('an idle instance of the requested type is used before a pooled one', async () => {
        const idle = makeInstance({id: 'i-idle', host: '1.2.3.4', running: true})
        const pooled = makeInstance({id: 'i-pooled', host: null, running: false})
        const provider = makeProvider({
            idleInstances: mock.fn(async () => [idle]),
            pooledInstances: mock.fn(async () => [pooled]),
        })

        const result = await requestInstance(REQUEST, {claims: makeClaims(), provider})

        assert.equal(result.id, 'i-idle')
        assert.equal(provider.startPooled.mock.callCount(), 0)
    })

    // Capacity and type-compatibility failures belong to the requested type, not to the pooled
    // instance, so a second pooled candidate would fail the same way: launch instead.
    test('a failed pooled start releases the claim and launches', async () => {
        const pooled = makeInstance({id: 'i-pooled', host: null, running: false, launchTime: new Date(1000)})
        const another = makeInstance({id: 'i-pooled-another', host: null, running: false, launchTime: new Date(2000)})
        const claims = makeClaims()
        const provider = makeProvider({
            pooledInstances: mock.fn(async () => [pooled, another]),
            startPooled: mock.fn(async () => {
                throw new Error('InsufficientInstanceCapacity')
            }),
        })

        const result = await requestInstance(REQUEST, {claims, provider})

        assert.deepEqual(callsOf(provider.startPooled), [[pooled, REQUEST.instanceType, RESERVATION]])
        assert.deepEqual(callsOf(claims.release), [['i-pooled', REQUEST.sessionId]])
        assert.equal(result.id, 'i-new')
    })

    // Simultaneous requests all see the same oldest pooled instance; the losers must not cold-launch
    // while the pool still holds instances.
    test('a lost claim on a pooled instance starts the next one', async () => {
        const taken = makeInstance({id: 'i-pooled-taken', host: null, running: false, launchTime: new Date(1000)})
        const next = makeInstance({id: 'i-pooled-next', host: null, running: false, launchTime: new Date(2000)})
        const claims = makeClaims({claim: mock.fn(async instanceId => instanceId !== taken.id)})
        const provider = makeProvider({pooledInstances: mock.fn(async () => [next, taken])})

        const result = await requestInstance(REQUEST, {claims, provider})

        assert.deepEqual(callsOf(provider.startPooled), [[next, REQUEST.instanceType, RESERVATION]])
        assert.equal(provider.launchReserved.mock.callCount(), 0)
        assert.equal(result.id, next.id)
    })

    test('launches when every pooled claim is lost', async () => {
        const pooled = makeInstance({id: 'i-pooled', host: null, running: false})
        const claims = makeClaims({claim: mock.fn(async instanceId => instanceId !== pooled.id)})
        const provider = makeProvider({pooledInstances: mock.fn(async () => [pooled])})

        const result = await requestInstance(REQUEST, {claims, provider})

        assert.equal(provider.startPooled.mock.callCount(), 0)
        assert.equal(result.id, 'i-new')
    })

    test('on exception: emits FailedToRequestInstance and rethrows', async () => {
        const failed = []
        events.failedToRequestInstance$.subscribe(v => failed.push(v))
        const claims = makeClaims()
        const provider = makeProvider({
            idleInstances: mock.fn(async () => {
                throw new Error('ec2 down')
            }),
        })

        await assert.rejects(requestInstance(REQUEST, {claims, provider}), /ec2 down/)

        const payload = failed[failed.length - 1]
        assert.equal(payload.workerType, 'SANDBOX')
        assert.equal(payload.instanceType, 'T3aSmall')
    })
})

describe('provisionInstance', () => {
    let provisionInstance, events

    before(async () => {
        ;({provisionInstance} = await import('./command/provisionInstance.js'))
        events = await import('./events.js')
    })

    const noDelay = () => Promise.resolve()
    const claims = {sessionIdForInstance: async () => null}
    const noScratchVolume = {getInstance: async () => makeReservedInstance(), attachScratchVolume: async () => null}

    test('provisions on the scratch volume the provider attached', async () => {
        const provider = {...noScratchVolume, attachScratchVolume: mock.fn(async () => '/dev/xvdg')}
        let device
        const provisioner = {provisionInstance: mock.fn(async (_instance, {attachScratchVolume}) => {
            device = await attachScratchVolume()
        })}
        const inst = makeReservedInstance()

        await provisionInstance(inst, {claims, provider, provisioner, _delayFn: noDelay})

        assert.deepEqual(callsOf(provider.attachScratchVolume), [[inst]])
        assert.equal(device, '/dev/xvdg')
    })

    test('retries a failed scratch volume attachment', async () => {
        const provider = {...noScratchVolume, attachScratchVolume: mock.fn(async () => '/dev/xvdg', async () => {
            throw new Error('IncorrectState')
        }, {times: 1})}
        const provisioner = {provisionInstance: mock.fn(async (_instance, {attachScratchVolume}) => {
            await attachScratchVolume()
        })}

        await provisionInstance(makeReservedInstance(), {claims, provider, provisioner, _delayFn: noDelay})

        assert.equal(provider.attachScratchVolume.mock.callCount(), 2)
        assert.equal(provisioner.provisionInstance.mock.callCount(), 2)
    })

    test('success on first try: emits InstanceProvisioned', async () => {
        const provisioned = []
        events.instanceProvisioned$.subscribe(v => provisioned.push(v))

        const provisioner = {provisionInstance: mock.fn(async () => undefined)}
        const inst = makeReservedInstance()
        await provisionInstance(inst, {claims, provider: noScratchVolume, provisioner, _delayFn: noDelay})

        assert.equal(provisioner.provisionInstance.mock.callCount(), 1)
        assert.ok(provisioned.length >= 1)
        assert.equal(provisioned[provisioned.length - 1].instance, inst)
    })

    test('all 10 retries fail: emits FailedToProvisionInstance, attempt count = 10', async () => {
        const failed = []
        events.failedToProvisionInstance$.subscribe(v => failed.push(v))

        const provisioner = {
            provisionInstance: mock.fn(async () => {
                throw new Error('docker unreachable')
            })
        }
        const inst = makeReservedInstance({id: 'i-fail'})

        await assert.rejects(
            provisionInstance(inst, {claims, provider: noScratchVolume, provisioner, _delayFn: noDelay}),
            /docker unreachable/
        )

        assert.equal(provisioner.provisionInstance.mock.callCount(), 10)
        assert.ok(failed.length >= 1)
        const payload = failed[failed.length - 1]
        assert.equal(payload.instance, inst)
        assert.equal(typeof payload.error, 'string')
    })

    test('succeeds on attempt 3: exact call count = 3', async () => {
        const provisioner = {
            provisionInstance: mock.fn(inSequence([async () => {
                throw new Error('fail1')
            }, async () => {
                throw new Error('fail2')
            }], async () => undefined)),
        }
        const inst = makeReservedInstance()
        await provisionInstance(inst, {claims, provider: noScratchVolume, provisioner, _delayFn: noDelay})
        assert.equal(provisioner.provisionInstance.mock.callCount(), 3)
    })

    test('backs off nine times and reports the final error after ten failed attempts', async () => {
        const errors = Array.from({length: 10}, (_, index) => new Error(`failure ${index + 1}`))
        const provisioner = {provisionInstance: mock.fn(inSequence(errors.map(error => async () => {
            throw error
        })))}
        const delay = mock.fn(noDelay)
        const failed = []
        const onFailure = (instance, error) => failed.push(error)
        events.instanceEvents.on('FailedToProvisionInstance', onFailure)
        try {
            await assert.rejects(provisionInstance(makeReservedInstance(), {
                claims, provider: noScratchVolume, provisioner, _delayFn: delay,
            }), error => error === errors.at(-1))
        } finally {
            events.instanceEvents.off('FailedToProvisionInstance', onFailure)
        }

        assert.equal(provisioner.provisionInstance.mock.callCount(), 10)
        assert.deepEqual(callsOf(delay), [1000, 2000, 4000, 8000, 16000, 32000, 64000, 128000, 256000].map(ms => [ms]))
        assert.deepEqual(failed, [errors.at(-1)])
    })

    test('cancellation during retry backoff prevents another attempt', async () => {
        let current = true
        const provisioner = {provisionInstance: mock.fn(async () => { throw new Error('unavailable') })}
        const delay = mock.fn(async () => { current = false })
        await provisionInstance(makeReservedInstance(), {
            claims, provider: noScratchVolume, provisioner, isCurrent: () => current, _delayFn: delay,
        })

        assert.equal(provisioner.provisionInstance.mock.callCount(), 1)
        assert.deepEqual(callsOf(delay), [[1000]])
    })

    test('in-proc InstanceProvisioned fires on success', async () => {
        const inProcPayloads = []
        const {instanceEvents: ev} = await import('./events.js')
        ev.once('InstanceProvisioned', i => inProcPayloads.push(i))

        const provisioner = {provisionInstance: mock.fn(async () => undefined)}
        const inst = makeReservedInstance({id: 'i-inproc'})
        await provisionInstance(inst, {claims, provider: noScratchVolume, provisioner, _delayFn: noDelay})

        assert.equal(inProcPayloads.length, 1)
        assert.equal(inProcPayloads[0], inst)
    })

    test('in-proc FailedToProvisionInstance fires on total failure', async () => {
        const inProcPayloads = []
        const {instanceEvents: ev} = await import('./events.js')
        ev.once('FailedToProvisionInstance', (i, e) => inProcPayloads.push({i, e}))

        const provisioner = {
            provisionInstance: mock.fn(async () => {
                throw new Error('fail')
            })
        }
        const inst = makeReservedInstance({id: 'i-inproc-fail'})
        await provisionInstance(inst, {claims, provider: noScratchVolume, provisioner, _delayFn: noDelay}).catch(() => {})

        assert.equal(inProcPayloads.length, 1)
        assert.equal(inProcPayloads[0].i, inst)
    })

    // Releasing the instance hands it to the next session: a provision that kept retrying would
    // rebuild it, and giving up would close that session.
    test('stops quietly once its session no longer holds the instance', async () => {
        const failures = []
        const {instanceEvents: ev} = await import('./events.js')
        const onFailure = i => failures.push(i)
        ev.on('FailedToProvisionInstance', onFailure)
        let current = true
        const provisioner = {
            provisionInstance: mock.fn(async () => {
                current = false
                throw new Error('docker unreachable')
            })
        }

        await provisionInstance(makeReservedInstance(), {
            claims, provider: noScratchVolume, provisioner, isCurrent: () => current, _delayFn: noDelay
        })
        ev.off('FailedToProvisionInstance', onFailure)

        assert.equal(provisioner.provisionInstance.mock.callCount(), 1)
        assert.deepEqual(failures, [])
    })

    test('does not report success when its session lost the instance during the attempt', async () => {
        const provisioned = []
        const {instanceEvents: ev} = await import('./events.js')
        const onProvisioned = i => provisioned.push(i)
        ev.on('InstanceProvisioned', onProvisioned)
        let current = true
        const provisioner = {
            provisionInstance: mock.fn(async () => {
                current = false
            })
        }

        await provisionInstance(makeReservedInstance(), {
            claims, provider: noScratchVolume, provisioner, isCurrent: () => current, _delayFn: noDelay
        })
        ev.off('InstanceProvisioned', onProvisioned)

        assert.deepEqual(provisioned, [])
    })

    test('a queued old provision cannot attach scratch to another session\'s claim', async () => {
        const provider = {attachScratchVolume: mock.fn(async () => null)}
        const provisioner = {provisionInstance: mock.fn(async () => {})}

        await provisionInstance(makeReservedInstance({reservation: {username: 'alice', sessionId: 's-alice'}}), {
            claims: {sessionIdForInstance: async () => 's-bob'}, provider, provisioner, _delayFn: noDelay
        })

        assert.equal(provider.attachScratchVolume.mock.callCount(), 0)
        assert.equal(provisioner.provisionInstance.mock.callCount(), 0)
    })

    test('a matching claim permits provisioning before EC2 reservation tags become visible', async () => {
        const provider = {...noScratchVolume, getInstance: mock.fn(async () => { throw new Error('tags not visible') })}
        const provisioner = {provisionInstance: mock.fn(async () => {})}

        await provisionInstance(makeReservedInstance({reservation: {username: 'alice', sessionId: 's-alice'}}), {
            claims: {sessionIdForInstance: async () => 's-alice'}, provider, provisioner, _delayFn: noDelay
        })

        assert.equal(provider.getInstance.mock.callCount(), 0)
        assert.equal(provisioner.provisionInstance.mock.callCount(), 1)
    })

    test('cancellation during the scratch callback prevents activation after it finishes', async () => {
        const attached = Promise.withResolvers()
        const started = Promise.withResolvers()
        let current = true
        const provider = {
            ...noScratchVolume,
            attachScratchVolume: async () => {
                started.resolve()
                return attached.promise
            }
        }
        const provisioner = {provisionInstance: mock.fn(async (_instance, {attachScratchVolume}) => {
            await attachScratchVolume()
        })}
        const provisioned = []
        const onProvisioned = instance => provisioned.push(instance)
        events.instanceEvents.on('InstanceProvisioned', onProvisioned)
        const running = provisionInstance(makeReservedInstance(), {
            claims, provider, provisioner, isCurrent: () => current, _delayFn: noDelay
        })
        await started.promise
        current = false
        attached.resolve('/dev/xvdg')
        await running
        events.instanceEvents.off('InstanceProvisioned', onProvisioned)

        assert.equal(provisioner.provisionInstance.mock.callCount(), 1)
        assert.deepEqual(provisioned, [])
    })

    for (const phase of ['claim lookup', 'Docker completion']) {
        test(`cancellation immediately after ${phase} resolves prevents the next phase`, async () => {
            let current = true
            const resolveThenCancel = value => ({then: resolve => {
                resolve(value)
                queueMicrotask(() => { current = false })
            }})
            const provider = {...noScratchVolume, attachScratchVolume: mock.fn(async () => null)}
            const provisioner = {provisionInstance: mock.fn((_instance, {attachScratchVolume}) =>
                Promise.resolve(attachScratchVolume()).then(() =>
                    phase === 'Docker completion' ? resolveThenCancel(undefined) : undefined))}
            const provisioned = []
            const onProvisioned = instance => provisioned.push(instance)
            events.instanceEvents.on('InstanceProvisioned', onProvisioned)
            try {
                await provisionInstance(makeReservedInstance(), {
                    claims: phase === 'claim lookup' ? {sessionIdForInstance: () => resolveThenCancel('')} : claims,
                    provider, provisioner, isCurrent: () => current, _delayFn: noDelay,
                })
            } finally {
                events.instanceEvents.off('InstanceProvisioned', onProvisioned)
            }

            assert.equal(provider.attachScratchVolume.mock.callCount(), phase === 'claim lookup' ? 0 : 1)
            assert.deepEqual(provisioned, [])
        })
    }
})

describe('releaseInstance', () => {
    let releaseInstance, requestInstance, createInstanceManager, createLocalInstanceProvider, events

    before(async () => {
        ;({releaseInstance} = await import('./command/releaseInstance.js'))
        ;({requestInstance} = await import('./command/requestInstance.js'))
        ;({createInstanceManager} = await import('./instanceManager.js'))
        ;({createLocalInstanceProvider} = await import('../hostingService/local/localInstanceProvider.js'))
        events = await import('./events.js')
    })

    const SESSION_ID = 's-1'

    const reservedForSession = (overrides = {}) =>
        makeReservedInstance({reservation: {username: 'alice', workerType: 'SANDBOX', sessionId: SESSION_ID}, ...overrides})

    const makeClaims = (overrides = {}) => ({
        sessionIdForInstance: mock.fn(async () => null),
        claim: mock.fn(async () => true),
        release: mock.fn(async () => true),
        ...overrides,
    })

    const makeDeps = (overrides = {}) => ({
        claims: makeClaims(),
        provider: {
            getInstance: mock.fn(async () => reservedForSession()),
            release: mock.fn(async () => undefined),
            terminate: mock.fn(async () => undefined),
            deleteScratchVolume: mock.fn(async () => undefined),
        },
        provisioner: {
            undeploy: mock.fn(async () => undefined),
        },
        ...overrides,
    })

    const makeLocalDeps = () => {
        const provider = createLocalInstanceProvider()
        const instance = provider.launchReserved('T3aSmall', {username: 'alice', workerType: 'SANDBOX', sessionId: SESSION_ID})
        const owners = new Map([[instance.id, SESSION_ID]])
        const claims = {
            sessionIdForInstance: mock.fn(async instanceId => owners.get(instanceId) ?? null),
            claim: mock.fn(async (instanceId, sessionId) => {
                if (owners.has(instanceId)) return false
                owners.set(instanceId, sessionId)
                return true
            }),
            release: mock.fn(async (instanceId, sessionId) => {
                if (owners.get(instanceId) !== sessionId) return false
                return owners.delete(instanceId)
            }),
            all: async () => [...owners].map(([instanceId, sessionId]) => ({instanceId, sessionId, claimedAt: new Date(0)})),
        }
        provider.terminate = mock.fn(provider.terminate)
        return {instance, deps: makeDeps({provider, claims, provisioning: createProvisioningRegistry()})}
    }

    const BOB_REQUEST = {workerType: 'SANDBOX', instanceType: 'T3aSmall', username: 'bob', sessionId: 's-bob'}

    test('reclaim retries an empty orphan claim after its session tag becomes visible', async () => {
        const {instance, deps} = makeLocalDeps()
        const {provider, claims} = deps
        await claims.release(instance.id, SESSION_ID)
        provider.reserve({...instance, launchTime: new Date(0), reservation: {...instance.reservation, sessionId: null}})
        const terminate = provider.terminate
        provider.terminate = mock.fn(async () => { throw new Error('Termination unavailable') })
        const manager = createInstanceManager({...deps, instanceTypes: []})

        await manager.releaseUnusedInstances([], 0, 'MILLISECONDS')
        assert.equal(await claims.sessionIdForInstance(instance.id), '')

        provider.reserve(instance)
        provider.terminate = mock.fn(terminate)
        await manager.reclaimStaleClaims([], 0)

        assert.equal(provider.getInstance(instance.id), null)
        assert.deepEqual(callsOf(provider.terminate), [[instance.id]])
        assert.equal(await claims.sessionIdForInstance(instance.id), '')
    })

    test('accepted retirement stops reporting busy while retaining its durable claim', async () => {
        const {instance, deps} = makeLocalDeps()
        const manager = createInstanceManager({...deps, instanceTypes: []})

        await manager.releaseInstance(instance.id, SESSION_ID, {retire: true})

        assert.equal(manager.isProvisioning(instance.id), false)
        assert.equal(deps.provider.getInstance(instance.id), null)
        assert.equal(await deps.claims.sessionIdForInstance(instance.id), SESSION_ID)
    })

    for (const failedRead of ['provider', 'claim']) {
        test(`a claimless retirement with a failed ${failedRead} read leaves no busy entry`, async () => {
            const {instance, deps} = makeLocalDeps()
            const manager = createInstanceManager({...deps, instanceTypes: []})
            await manager.releaseInstance(instance.id, SESSION_ID)
            const owner = failedRead === 'provider' ? deps.provider : deps.claims
            const method = failedRead === 'provider' ? 'getInstance' : 'sessionIdForInstance'
            owner[method] = async () => { throw new Error('Ownership read unavailable') }

            await manager.releaseInstance(instance.id, SESSION_ID, {retire: true})

            assert.equal(manager.isProvisioning(instance.id), false)
        })
    }

    test('gone-claim deletion owns the release slot before a queued orphan release can read stale ownership', async () => {
        const startedAt = Date.now()
        let now = startedAt
        const clock = mock.method(Date, 'now', () => now)
        const provider = createLocalInstanceProvider()
        provider.terminate = mock.fn(provider.terminate)
        const owners = new Map()
        const orphanSelected = Promise.withResolvers()
        const deliverOrphanSnapshot = Promise.withResolvers()
        const cleanupStarted = Promise.withResolvers()
        const finishCleanup = Promise.withResolvers()
        const idleRead = Promise.withResolvers()
        const tagged = Promise.withResolvers()
        const normalReleaseDone = Promise.withResolvers()
        const goneDeleteStarted = Promise.withResolvers()
        const commitGoneDelete = Promise.withResolvers()
        const deliverLateOwner = Promise.withResolvers()
        let failLaunchClaim = true
        let queueOrphanSnapshot = false
        let delayLateOwner = false
        let aliceDeletes = 0
        const claims = {
            claim: mock.fn(async (instanceId, sessionId) => {
                if (failLaunchClaim) {
                    failLaunchClaim = false
                    throw new Error('initial launch claim INSERT failed')
                }
                if (owners.has(instanceId)) return false
                owners.set(instanceId, {sessionId, claimedAt: new Date(now)})
                return true
            }),
            sessionIdForInstance: async instanceId => {
                const owner = owners.get(instanceId)?.sessionId ?? null
                if (delayLateOwner && owner === SESSION_ID) await deliverLateOwner.promise
                return owner
            },
            release: mock.fn(async (instanceId, sessionId) => {
                if (sessionId === SESSION_ID) {
                    aliceDeletes++
                    if (aliceDeletes === 1) throw new Error('own DELETE failed before commit')
                    if (aliceDeletes === 2) {
                        goneDeleteStarted.resolve()
                        await commitGoneDelete.promise
                    }
                }
                if (owners.get(instanceId)?.sessionId !== sessionId) return false
                return owners.delete(instanceId)
            }),
            all: async () => {
                const snapshot = [...owners].map(([instanceId, row]) => ({instanceId, ...row}))
                if (queueOrphanSnapshot) {
                    queueOrphanSnapshot = false
                    orphanSelected.resolve()
                    await deliverOrphanSnapshot.promise
                }
                return snapshot
            },
        }
        const provisioning = createProvisioningRegistry()
        provisioning.beginRelease = mock.fn(provisioning.beginRelease)
        const provisioner = {
            undeploy: mock.fn(async () => {
                cleanupStarted.resolve()
                await finishCleanup.promise
            }),
            provisionInstance: mock.fn(async () => {}),
        }
        const manager = createInstanceManager({claims, provider, provisioning, provisioner, instanceTypes: []})
        try {
            const instance = await manager.requestInstance({
                id: SESSION_ID, username: 'alice', workerType: 'SANDBOX', instanceType: 'T3aSmall',
            })
            now += 6 * 60_000
            queueOrphanSnapshot = true
            const orphanSweep = manager.releaseUnusedInstances([], 5, 'MINUTES')
            await orphanSelected.promise
            const normalRelease = manager.releaseInstance(instance.id, SESSION_ID)
            await cleanupStarted.promise
            const claimedAt = owners.get(instance.id).claimedAt.getTime()
            now += 11 * 60_000

            const idleInstances = provider.idleInstances
            const reservedInstances = provider.reservedInstances
            const release = provider.release
            provider.idleInstances = type => {
                const idle = idleInstances(type)
                idleRead.resolve()
                return idle
            }
            provider.reservedInstances = async () => {
                await tagged.promise
                await normalReleaseDone.promise
                return reservedInstances()
            }
            provider.release = instanceId => {
                release(instanceId)
                tagged.resolve()
            }
            const reclaiming = manager.reclaimStaleClaims([], 10 * 60_000)
            await idleRead.promise
            finishCleanup.resolve()
            await normalRelease
            normalReleaseDone.resolve()
            await goneDeleteStarted.promise

            delayLateOwner = true
            deliverOrphanSnapshot.resolve()
            await new Promise(resolve => setImmediate(resolve))
            commitGoneDelete.resolve()
            assert.equal(await reclaiming, 1)
            const session = {...BOB_REQUEST, id: 's-bob'}
            const next = await manager.requestInstance(session)
            const provisioned = await manager.reprovisionInstance({...session, instance: next})
            deliverLateOwner.resolve()
            await orphanSweep

            assert.equal(claimedAt, startedAt + 6 * 60_000)
            assert.equal(next.id, instance.id)
            assert.equal(provisioned, true)
            assert.equal(provider.getInstance(next.id)?.reservation.sessionId, 's-bob')
            assert.equal(await claims.sessionIdForInstance(next.id), 's-bob')
            assert.equal(provider.terminate.mock.callCount(), 0)
            assert.equal(provisioning.beginRelease.mock.callCount(), 2)
        } finally {
            clock.mock.restore()
        }
    })

    test('inventory reads straddling an in-flight idle transition cannot release its mature claim', async () => {
        const {instance, deps} = makeLocalDeps()
        const {claims, provider, provisioning, provisioner} = deps
        provisioner.provisionInstance = mock.fn(async () => {})
        const manager = createInstanceManager({...deps, instanceTypes: []})
        const idleRead = Promise.withResolvers()
        const tagged = Promise.withResolvers()
        const response = Promise.withResolvers()
        const idleInstances = provider.idleInstances
        const reservedInstances = provider.reservedInstances
        const release = provider.release
        provider.idleInstances = async type => {
            const idle = idleInstances(type)
            idleRead.resolve()
            return idle
        }
        provider.reservedInstances = async () => {
            await tagged.promise
            return reservedInstances()
        }
        provider.release = async instanceId => {
            release(instanceId)
            tagged.resolve()
            await response.promise
            throw new Error('idle tags applied but response lost')
        }

        const reclaiming = manager.reclaimStaleClaims([], 0)
        await idleRead.promise
        const releasing = manager.releaseInstance(instance.id, SESSION_ID)
        await tagged.promise
        await reclaiming
        const ownerBeforeCompletion = await claims.sessionIdForInstance(instance.id)
        const gateBeforeCompletion = provisioning.isProvisioning(instance.id)
        const session = {...BOB_REQUEST, id: 's-bob'}
        const next = await manager.requestInstance(session)
        assert.equal(await manager.reprovisionInstance({...session, instance: next}), true)
        response.resolve()
        await releasing

        assert.equal(ownerBeforeCompletion, SESSION_ID)
        assert.equal(gateBeforeCompletion, true)
        assert.notEqual(next.id, instance.id)
        assert.equal(provider.getInstance(next.id)?.reservation.sessionId, 's-bob')
        assert.equal(await claims.sessionIdForInstance(next.id), 's-bob')
        assert.deepEqual(callsOf(provider.terminate), [[instance.id]])
    })

    test('a gone-claim cleanup does not hold another instance release behind its DELETE', async () => {
        const {instance, deps} = makeLocalDeps()
        const {claims, provider} = deps
        deps.releasing = new Map()
        provider.idleInstances = async () => []
        provider.reservedInstances = async () => []
        const deleteStarted = Promise.withResolvers()
        const finishDelete = Promise.withResolvers()
        const releaseClaim = claims.release
        claims.release = async (instanceId, sessionId) => {
            if (instanceId === instance.id) {
                deleteStarted.resolve()
                await finishDelete.promise
            }
            return releaseClaim(instanceId, sessionId)
        }
        const reclaiming = reconcileGoneClaims([], 0, deps)
        await deleteStarted.promise
        const other = provider.launchReserved('T3aSmall', {username: 'carol', workerType: 'SANDBOX', sessionId: 's-carol'})
        await claims.claim(other.id, 's-carol')
        const releasingOther = releaseInstance(other.id, 's-carol', deps)
        await new Promise(resolve => setImmediate(resolve))
        const otherOwnerBeforeDelete = await claims.sessionIdForInstance(other.id)
        finishDelete.resolve()
        await Promise.all([reclaiming, releasingOther])

        assert.equal(otherOwnerBeforeDelete, null)
        assert.equal(provider.getInstance(other.id)?.reservation, null)
        assert.equal(provider.terminate.mock.callCount(), 0)
    })

    test('an abandoned-claim snapshot taken before normal release cannot retire the idle unclaimed host', async () => {
        const {instance, deps} = makeLocalDeps()
        const {claims, provider, provisioning, provisioner} = deps
        provisioner.provisionInstance = mock.fn(async () => {})
        const manager = createInstanceManager({...deps, instanceTypes: []})
        const snapshotTaken = Promise.withResolvers()
        const response = Promise.withResolvers()
        const all = claims.all
        claims.all = async () => {
            const snapshot = await all()
            snapshotTaken.resolve()
            await response.promise
            return snapshot
        }

        const reclaiming = manager.reclaimStaleClaims([], 0)
        await snapshotTaken.promise
        await manager.releaseInstance(instance.id, SESSION_ID)
        response.resolve()
        await reclaiming
        const session = {...BOB_REQUEST, id: 's-bob'}
        const next = await manager.requestInstance(session)
        assert.equal(await manager.reprovisionInstance({...session, instance: next}), true)

        assert.equal(next.id, instance.id)
        assert.equal(provider.getInstance(next.id)?.reservation.sessionId, 's-bob')
        assert.equal(await claims.sessionIdForInstance(next.id), 's-bob')
        assert.equal(provider.terminate.mock.callCount(), 0)
        assert.equal(provisioning.isProvisioning(next.id), false)
    })

    for (const [phase, fails] of [
        ['undeploy', false],
        ['undeploy', true],
        ['scratch deletion', false],
        ['scratch deletion', true],
        ['idle transition', true],
    ]) {
        test(`a replaced release gate stops after ${phase} ${fails ? 'fails' : 'succeeds'}`, async () => {
            const {instance, deps} = makeLocalDeps()
            const {claims, provider, provisioning, provisioner} = deps
            provisioner.provisionInstance = mock.fn(async () => {})
            const manager = createInstanceManager({...deps, instanceTypes: []})
            const entered = Promise.withResolvers()
            const response = Promise.withResolvers()
            const pause = async () => {
                entered.resolve()
                await response.promise
                if (fails) throw new Error(`${phase} response lost`)
            }
            const release = provider.release
            provider.release = mock.fn(phase === 'idle transition'
                ? async instanceId => { release(instanceId); await pause() }
                : release)
            provider.deleteScratchVolume = mock.fn(phase === 'scratch deletion' ? pause : async () => {})
            provisioner.undeploy = mock.fn(phase === 'undeploy' ? pause : async () => {})
            const beginRelease = provisioning.beginRelease
            let releaseToken
            provisioning.beginRelease = (...args) => {
                const token = beginRelease(...args)
                if (args[1] === SESSION_ID) releaseToken = token
                return token
            }

            const releasing = manager.releaseInstance(instance.id, SESSION_ID)
            await entered.promise
            await claims.release(instance.id, SESSION_ID)
            release(instance.id)
            provisioning.finishRelease(instance.id, releaseToken)
            const session = {...BOB_REQUEST, id: 's-bob'}
            const next = await manager.requestInstance(session)
            assert.equal(next.id, instance.id)
            assert.equal(await manager.reprovisionInstance({...session, instance: next}), true)
            response.resolve()
            await releasing

            assert.equal(provider.getInstance(next.id)?.reservation.sessionId, 's-bob')
            assert.equal(await claims.sessionIdForInstance(next.id), 's-bob')
            assert.equal(provider.terminate.mock.callCount(), 0)
            assert.equal(provider.release.mock.callCount(), phase === 'idle transition' ? 1 : 0)
            assert.equal(provider.deleteScratchVolume.mock.callCount(), phase === 'undeploy' ? 0 : 1)
        })
    }

    test('an idle retirement retry recognizes a matching empty legacy claim', async () => {
        const deps = {...makeDeps(), provisioning: createProvisioningRegistry(), retire: true}
        deps.provider.getInstance = async () => makeInstance()
        deps.claims.sessionIdForInstance = async () => ''

        await releaseInstance('i-001', undefined, deps)

        assert.deepEqual(callsOf(deps.provider.terminate), [['i-001']])
        assert.equal(deps.claims.release.mock.callCount(), 0)
    })

    test('happy path: undeploy + release + emits InstanceReleased', async () => {
        const released = []
        events.instanceReleased$.subscribe(v => released.push(v))

        const deps = makeDeps()
        await releaseInstance('i-001', SESSION_ID, deps)

        assert.equal(deps.provisioner.undeploy.mock.callCount(), 1)
        assert.deepEqual(callsOf(deps.provider.release), [['i-001']])
        assert.ok(released.length >= 1)
        const payload = released[released.length - 1]
        assert.notEqual(payload.instance, undefined)
        assert.equal(payload.instance.reservation, null)  // release() clears reservation
    })

    test('instance not found in provider: returns without action', async () => {
        const released = []
        events.instanceReleased$.subscribe(v => released.push(v))

        const deps = makeDeps()
        deps.provider.getInstance = mock.fn(async () => null)

        await releaseInstance('i-missing', SESSION_ID, deps)

        assert.deepEqual(callsOf(deps.claims.release), [['i-missing', SESSION_ID]])
        assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
        assert.equal(released.length, 0)
    })

    // The claim is the only durable record that this instance may still be carrying a container.
    // Dropping it first and dying before the undeploy stranded the previous user's container on
    // an instance ReleaseUnusedInstances went on to tag idle, ports published and home mounted.
    test('undeploys before dropping the claim, so an interrupted release can be retried', async () => {
        const order = []
        const deps = makeDeps()
        deps.provisioner.undeploy = mock.fn(async () => {
            order.push('undeploy')
        })
        deps.claims.release = mock.fn(async () => {
            order.push('claim')
            return true
        })

        await releaseInstance('i-001', SESSION_ID, deps)

        assert.deepEqual(order, ['undeploy', 'claim'])
    })

    // The scratch volume is mounted until the containers are gone, and the claim keeps a failed
    // deletion retriable.
    test('deletes the scratch volume after the undeploy and before dropping the claim', async () => {
        const order = []
        const deps = makeDeps()
        deps.provisioner.undeploy = mock.fn(async () => { order.push('undeploy') })
        deps.provider.deleteScratchVolume = mock.fn(async () => { order.push('scratch') })
        deps.claims.release = mock.fn(async () => {
            order.push('claim')
            return true
        })

        await releaseInstance('i-001', SESSION_ID, deps)

        assert.deepEqual(callsOf(deps.provider.deleteScratchVolume), [['i-001']])
        assert.deepEqual(order, ['undeploy', 'scratch', 'claim'])
    })

    test('a claim already gone still undeploys, and still releases and emits', async () => {
        // The claim delete no longer elects the undeployer. Undeploy is a force-delete by
        // container name, so a concurrent releaser doing the same thing finds nothing to do —
        // while skipping it is what left a live container behind.
        const released = []
        events.instanceReleased$.subscribe(v => released.push(v))

        const deps = makeDeps()
        deps.claims.release = mock.fn(async () => false)

        await releaseInstance('i-raced', SESSION_ID, deps)

        assert.equal(deps.provisioner.undeploy.mock.callCount(), 1)
        assert.deepEqual(callsOf(deps.claims.release), [['i-raced', SESSION_ID]])
        assert.deepEqual(callsOf(deps.provider.release), [['i-raced']])
        assert.ok(released.length >= 1)
        const payload = released[released.length - 1]
        assert.notEqual(payload.instance, undefined)
    })

    test('failure path: emits FailedToReleaseInstance and terminates while retaining the claim', async () => {
        const failed = []
        events.failedToReleaseInstance$.subscribe(v => failed.push(v))

        const deps = makeDeps()
        deps.provisioner.undeploy = mock.fn(async () => {
            throw new Error('ssh error')
        })

        await releaseInstance('i-fail', SESSION_ID, deps)

        assert.ok(failed.length >= 1)
        const payload = failed[failed.length - 1]
        assert.equal(payload.instanceId, 'i-fail')
        assert.equal(typeof payload.error, 'string')
        assert.deepEqual(callsOf(deps.provider.terminate), [['i-fail']])
        assert.equal(deps.claims.release.mock.callCount(), 0)
    })

    test('failure path: terminate failure is swallowed (does not throw)', async () => {
        const deps = makeDeps()
        deps.provisioner.undeploy = mock.fn(async () => {
            throw new Error('undeploy fail')
        })
        deps.provider.terminate = mock.fn(async () => {
            throw new Error('terminate fail')
        })

        assert.equal(await releaseInstance('i-cascade', SESSION_ID, deps), undefined)
        assert.equal(deps.claims.release.mock.callCount(), 0)
    })

    test('failed retirement retains its claim so reclaim retries retirement after the old attempt settles', async () => {
        const provisioning = createProvisioningRegistry()
        const pending = Promise.withResolvers()
        const running = provisioning.run('i-001', SESSION_ID, () => pending.promise)
        const deps = {...makeDeps(), provisioning}
        deps.claims.sessionIdForInstance = async () => SESSION_ID
        deps.claims.all = async () => [{instanceId: 'i-001', sessionId: SESSION_ID, claimedAt: new Date(0)}]
        deps.provider.idleInstances = async () => []
        deps.provider.reservedInstances = async () => [reservedForSession()]
        deps.provider.recoveringInstances = async () => []
        let terminationFails = true
        deps.provider.terminate = mock.fn(async () => {
            if (terminationFails) throw new Error('EC2 unavailable')
        })

        await releaseInstance('i-001', SESSION_ID, deps)
        assert.equal(deps.claims.release.mock.callCount(), 0)
        assert.equal(provisioning.isProvisioning('i-001'), false)
        pending.resolve()
        await running

        terminationFails = false
        await reconcileGoneClaims([], 0, deps)

        assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
        assert.equal(deps.provider.release.mock.callCount(), 0)
        assert.equal(deps.claims.release.mock.callCount(), 0)
        assert.equal(provisioning.isProvisioning('i-001'), false)
        assert.equal(deps.provider.terminate.mock.callCount(), 3)

        await reconcileGoneClaims([], 0, {
            ...deps,
            claims: {...deps.claims, all: async () => [{instanceId: 'i-001', sessionId: SESSION_ID, claimedAt: new Date(0)}]},
            provider: {idleInstances: async () => [], reservedInstances: async () => [], recoveringInstances: async () => []}
        })
        assert.deepEqual(callsOf(deps.claims.release), [['i-001', SESSION_ID]])
        assert.equal(provisioning.isProvisioning('i-001'), false)
    })

    test('explicit startup cancellation retires the host even after the registry was lost on restart', async () => {
        const deps = {...makeDeps(), provisioning: createProvisioningRegistry(), retire: true}

        await releaseInstance('i-001', SESSION_ID, deps)

        assert.deepEqual(callsOf(deps.provider.terminate), [['i-001']])
        assert.equal(deps.provider.release.mock.callCount(), 0)
        assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
        assert.equal(deps.claims.release.mock.callCount(), 0)
        assert.equal(deps.provisioning.isProvisioning('i-001'), false)
    })

    test('a failed idle transition retains its claim and is retired by reclaim', async () => {
        const provisioning = createProvisioningRegistry()
        const deps = {...makeDeps(), provisioning}
        deps.claims.sessionIdForInstance = async () => SESSION_ID
        deps.claims.all = async () => [{instanceId: 'i-001', sessionId: SESSION_ID, claimedAt: new Date(0)}]
        const instance = reservedForSession()
        deps.provider.getInstance = async () => instance
        deps.provider.idleInstances = async () => [instance]
        deps.provider.reservedInstances = async () => []
        deps.provider.recoveringInstances = async () => []
        deps.provider.release = mock.fn(async () => {
            instance.reservation = null
            throw new Error('idle tags applied but response lost')
        })
        let terminationFails = true
        deps.provider.terminate = mock.fn(async () => {
            if (terminationFails) throw new Error('EC2 unavailable')
        })

        await releaseInstance('i-001', SESSION_ID, deps)
        assert.equal(deps.claims.release.mock.callCount(), 0)
        assert.equal(provisioning.isProvisioning('i-001'), false)
        terminationFails = false
        await reconcileGoneClaims([], 0, deps)

        assert.equal(deps.provider.release.mock.callCount(), 1)
        assert.equal(deps.provisioner.undeploy.mock.callCount(), 1)
        assert.equal(deps.claims.release.mock.callCount(), 0)
        assert.equal(provisioning.isProvisioning('i-001'), false)
        assert.equal(deps.provider.terminate.mock.callCount(), 2)
    })

    test('a committed claim DELETE with a lost response cannot terminate the next session', async () => {
        const {instance, deps} = makeLocalDeps()
        const {claims, provider, provisioning} = deps
        const releaseClaim = claims.release
        let next
        claims.release = mock.fn(async (instanceId, sessionId) => {
            assert.equal(await releaseClaim(instanceId, sessionId), true)
            next = await requestInstance(BOB_REQUEST, {claims, provider})
            throw new Error('DELETE committed but its response was lost')
        })

        await releaseInstance(instance.id, SESSION_ID, deps)

        assert.equal(next.id, instance.id)
        assert.equal(provider.getInstance(instance.id)?.reservation.sessionId, 's-bob')
        assert.equal(await claims.sessionIdForInstance(instance.id), 's-bob')
        assert.equal(provider.terminate.mock.callCount(), 0)
        assert.equal(await provisioning.run(instance.id, 's-bob', async () => {}), true)
    })

    test('a failed claim DELETE before commit leaves recovery a claim without blocking provisioning', async () => {
        const {instance, deps} = makeLocalDeps()
        const {claims, provider, provisioning} = deps
        const releaseClaim = claims.release
        claims.release = mock.fn(async () => { throw new Error('DELETE failed before commit') })

        await releaseInstance(instance.id, SESSION_ID, deps)

        assert.equal(provider.getInstance(instance.id)?.reservation, null)
        assert.equal(await claims.sessionIdForInstance(instance.id), SESSION_ID)
        assert.equal(provider.terminate.mock.callCount(), 0)
        assert.equal(provisioning.isProvisioning(instance.id), false)

        claims.release = releaseClaim
        await reconcileGoneClaims([], 0, deps)
        assert.equal(provider.getInstance(instance.id), null)
        assert.equal(await claims.sessionIdForInstance(instance.id), SESSION_ID)
        await reconcileGoneClaims([], 0, deps)
        assert.equal(await claims.sessionIdForInstance(instance.id), null)
        assert.equal(provisioning.isProvisioning(instance.id), false)
    })

    test('contradictory reservation tags retain the matching claim for retirement through reclaim', async () => {
        const {instance, deps} = makeLocalDeps()
        const {claims, provider, provisioning} = deps
        const pending = Promise.withResolvers()
        const running = provisioning.run(instance.id, SESSION_ID, () => pending.promise)
        const getInstance = provider.getInstance
        provider.getInstance = async instanceId => ({
            ...getInstance(instanceId),
            reservation: {username: 'previous-user', workerType: 'SANDBOX', sessionId: 's-previous'},
        })

        await releaseInstance(instance.id, SESSION_ID, deps)

        assert.equal(await claims.sessionIdForInstance(instance.id), SESSION_ID)
        assert.equal(provisioning.isProvisioning(instance.id), false)
        assert.equal(provider.terminate.mock.callCount(), 0)
        provider.idleInstances = async () => [{...instance, reservation: null}]
        const next = await requestInstance(BOB_REQUEST, {claims, provider})
        assert.notEqual(next.id, instance.id)
        assert.equal(await claims.sessionIdForInstance(instance.id), SESSION_ID)

        pending.resolve()
        await running
        provider.getInstance = getInstance
        await reconcileGoneClaims(['s-bob'], 0, deps)
        assert.equal(provider.getInstance(instance.id), null)
        assert.equal(provider.getInstance(next.id)?.reservation.sessionId, 's-bob')
    })

    for (const failedRead of ['provider', 'claim']) {
        test(`a claimless retirement with a failed ${failedRead} read does not delay the next owner`, async () => {
            const {instance, deps} = makeLocalDeps()
            const {claims, provider, provisioning} = deps
            await releaseInstance(instance.id, SESSION_ID, deps)

            const owner = failedRead === 'provider' ? provider : claims
            const method = failedRead === 'provider' ? 'getInstance' : 'sessionIdForInstance'
            const read = owner[method]
            owner[method] = async () => { throw new Error('ownership read failed') }
            await releaseInstance(instance.id, SESSION_ID, {...deps, retire: true})
            owner[method] = read

            assert.equal(provisioning.isProvisioning(instance.id), false)
            assert.equal(await claims.sessionIdForInstance(instance.id), null)
            const next = await requestInstance(BOB_REQUEST, {claims, provider})
            assert.equal(next.id, instance.id)
            assert.equal(provider.getInstance(next.id)?.reservation.sessionId, 's-bob')
            assert.equal(await claims.sessionIdForInstance(next.id), 's-bob')
            assert.equal(provider.terminate.mock.callCount(), 0)
            assert.equal(await provisioning.run(next.id, 's-bob', async () => {}), true)
            await releaseInstance(next.id, 's-bob', deps)
            assert.equal(await claims.sessionIdForInstance(next.id), null)
            assert.equal(provider.getInstance(next.id)?.reservation, null)
        })

        test(`a claimless duplicate release with a failed ${failedRead} read does not strand the next session`, async () => {
            const {instance, deps} = makeLocalDeps()
            const {claims, provider, provisioning} = deps
            await releaseInstance(instance.id, SESSION_ID, deps)
            assert.equal(await claims.sessionIdForInstance(instance.id), null)

            const owner = failedRead === 'provider' ? provider : claims
            const method = failedRead === 'provider' ? 'getInstance' : 'sessionIdForInstance'
            const read = owner[method]
            owner[method] = async () => { throw new Error('ownership read failed') }
            await releaseInstance(instance.id, SESSION_ID, deps)
            owner[method] = read

            assert.equal(provisioning.isProvisioning(instance.id), false)
            const next = await requestInstance(BOB_REQUEST, {claims, provider})
            assert.equal(next.id, instance.id)
            assert.equal(await provisioning.run(next.id, 's-bob', async () => {}), true)
            await releaseInstance(next.id, 's-bob', deps)
            assert.equal(await claims.sessionIdForInstance(instance.id), null)
            assert.equal(provider.getInstance(instance.id)?.reservation, null)
            assert.equal(provisioning.isProvisioning(instance.id), false)
        })
    }

    for (const failedRead of ['provider', 'claim']) {
        test(`explicit retirement preserves its claim after a failed ${failedRead} ownership read without blocking starts`, async () => {
            const deps = {...makeDeps(), provisioning: createProvisioningRegistry(), retire: true}
            const failure = async () => { throw new Error('ownership unknown') }
            if (failedRead === 'provider') deps.provider.getInstance = failure
            else deps.claims.sessionIdForInstance = failure

            await releaseInstance('i-001', SESSION_ID, deps)

            assert.equal(deps.provisioning.isProvisioning('i-001'), false)
            assert.equal(deps.claims.release.mock.callCount(), 0)
            assert.equal(deps.provider.terminate.mock.callCount(), 0)
        })

        test(`release cancels before a failed ${failedRead} ownership read`, async () => {
            const provisioning = createProvisioningRegistry()
            const pending = Promise.withResolvers()
            let isCurrent
            const running = provisioning.run('i-001', SESSION_ID, current => {
                isCurrent = current
                return pending.promise
            })
            const deps = {...makeDeps(), provisioning}
            const failure = async () => { throw new Error('ownership unknown') }
            if (failedRead === 'provider') deps.provider.getInstance = failure
            else deps.claims.sessionIdForInstance = failure

            await releaseInstance('i-001', SESSION_ID, deps)

            assert.equal(isCurrent(), false)
            assert.equal(deps.claims.release.mock.callCount(), 0)
            assert.equal(deps.provider.terminate.mock.callCount(), 0)
            assert.equal(provisioning.isProvisioning('i-001'), false)
            pending.resolve()
            await running
        })
    }

    test('a newer durable claim prevents release even when EC2 still reports the old reservation', async () => {
        const deps = {...makeDeps(), provisioning: createProvisioningRegistry()}
        deps.claims.sessionIdForInstance = async () => 's-bob'

        await releaseInstance('i-001', SESSION_ID, deps)

        assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
        assert.equal(deps.provider.terminate.mock.callCount(), 0)
        assert.equal(deps.provider.release.mock.callCount(), 0)
        assert.equal(deps.provisioning.isProvisioning('i-001'), false)
        assert.deepEqual(callsOf(deps.claims.release), [['i-001', SESSION_ID]])
    })

    test('a release whose ownership read finishes after gate replacement cannot touch the next owner', async () => {
        const {instance, deps} = makeLocalDeps()
        const {claims, provider, provisioning} = deps
        const reading = Promise.withResolvers()
        const resume = Promise.withResolvers()
        const gated = Promise.withResolvers()
        const beginRelease = provisioning.beginRelease
        provisioning.beginRelease = (...args) => {
            const token = beginRelease(...args)
            gated.resolve(token)
            return token
        }
        const readOwner = claims.sessionIdForInstance
        claims.sessionIdForInstance = async instanceId => {
            const owner = await readOwner(instanceId)
            reading.resolve()
            await resume.promise
            return owner
        }

        const closing = releaseInstance(instance.id, SESSION_ID, {...deps, retire: true})
        await reading.promise
        await claims.release(instance.id, SESSION_ID)
        provider.release(instance.id)
        provisioning.finishRelease(instance.id, await gated.promise)
        const next = await requestInstance(BOB_REQUEST, {claims, provider})
        const pending = Promise.withResolvers()
        const provisioningNext = provisioning.run(next.id, 's-bob', () => pending.promise)
        resume.resolve()
        await closing

        try {
            assert.equal(next.id, instance.id)
            assert.equal(provider.getInstance(next.id)?.reservation.sessionId, 's-bob')
            assert.equal(await readOwner(next.id), 's-bob')
            assert.equal(provider.terminate.mock.callCount(), 0)
            assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
            assert.equal(provisioning.isProvisioning(next.id), true)
        } finally {
            pending.resolve()
            await provisioningNext
        }
    })

    test('an orphan claimed by another requester during release is left alone', async () => {
        const deps = {...makeDeps(), provisioning: createProvisioningRegistry()}
        deps.claims.claim = mock.fn(async () => false)

        await releaseInstance('i-001', SESSION_ID, deps)

        assert.deepEqual(callsOf(deps.claims.claim), [['i-001', SESSION_ID]])
        assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
        assert.equal(deps.provider.terminate.mock.callCount(), 0)
        assert.equal(deps.claims.release.mock.callCount(), 0)
        assert.equal(deps.provisioning.isProvisioning('i-001'), false)
    })

    test('a non-running historical instance is never accessed through its old Docker address', async () => {
        const deps = {...makeDeps(), provisioning: createProvisioningRegistry()}
        deps.provider.getInstance = async () => reservedForSession({running: false, host: 'old-address'})

        await releaseInstance('i-001', SESSION_ID, deps)

        assert.equal(deps.provider.terminate.mock.callCount(), 1)
        assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
        assert.equal(deps.provider.release.mock.callCount(), 0)
        assert.equal(deps.claims.release.mock.callCount(), 0)
    })

    test('a legacy reservation without a session id uses one consistent claim key', async () => {
        const deps = {...makeDeps(), provisioning: createProvisioningRegistry()}
        deps.provider.getInstance = async () => makeReservedInstance()

        await releaseInstance('i-001', undefined, deps)

        assert.deepEqual(callsOf(deps.claims.claim), [['i-001', '']])
        assert.deepEqual(callsOf(deps.claims.release), [['i-001', '']])
        assert.equal(deps.provider.release.mock.callCount(), 1)
    })

    test('local retirement starts scoped cleanup without waiting for a stalled daemon', async () => {
        const provisioning = createProvisioningRegistry()
        const pending = Promise.withResolvers()
        const running = provisioning.run('i-001', SESSION_ID, () => pending.promise)
        const cleanup = Promise.withResolvers()
        const deps = {...makeDeps(), provisioning}
        deps.provider.getInstance = async () => reservedForSession({daemonHost: 'dev-daemon'})
        deps.provisioner.undeploy = mock.fn(() => cleanup.promise)

        await releaseInstance('i-001', SESSION_ID, deps)

        assert.equal(deps.provisioner.undeploy.mock.callCount(), 1)
        assert.equal(deps.provider.release.mock.callCount(), 0)
        assert.equal(deps.claims.release.mock.callCount(), 0)
        cleanup.resolve()
        pending.resolve()
        await running
    })

    test('a normal release gates provisioning until cleanup and the idle transition finish', async () => {
        const provisioning = createProvisioningRegistry()
        const idle = Promise.withResolvers()
        const started = Promise.withResolvers()
        const deps = {...makeDeps(), provisioning}
        deps.provider.release = async () => {
            started.resolve()
            return idle.promise
        }
        const running = releaseInstance('i-001', SESSION_ID, deps)
        await started.promise

        assert.equal(deps.claims.release.mock.callCount(), 0)
        assert.equal(await provisioning.run('i-001', SESSION_ID, async () => {}), false)
        idle.resolve()
        await running
        assert.equal(await provisioning.run('i-001', 's-next', async () => {}), true)
    })

    test('instance with no host: skips undeploy but still releases', async () => {
        const released = []
        events.instanceReleased$.subscribe(v => released.push(v))

        const deps = makeDeps()
        deps.provider.getInstance = mock.fn(async () => reservedForSession({host: null}))

        await releaseInstance('i-nohost', SESSION_ID, deps)

        assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
        assert.equal(deps.provider.release.mock.callCount(), 1)
        assert.ok(released.length >= 1)
    })

    // A release that runs late — ReclaimStaleClaims acting on a claim it read before the Stop
    // finished — must not undeploy, or tag idle, the instance of the session it went to next.
    test('leaves an instance reserved for another session alone, dropping only its own claim', async () => {
        const deps = makeDeps()
        deps.provider.getInstance = mock.fn(async () =>
            reservedForSession({reservation: {username: 'bob', workerType: 'SANDBOX', sessionId: 's-next'}}))

        await releaseInstance('i-001', SESSION_ID, deps)

        assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
        assert.equal(deps.provider.release.mock.callCount(), 0)
        assert.equal(deps.provider.terminate.mock.callCount(), 0)
        assert.deepEqual(callsOf(deps.claims.release), [['i-001', SESSION_ID]])
    })

    test('leaves an instance already back in the pool alone', async () => {
        const deps = makeDeps()
        deps.provider.getInstance = mock.fn(async () => makeInstance())

        await releaseInstance('i-001', SESSION_ID, deps)

        assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
        assert.equal(deps.provider.release.mock.callCount(), 0)
        assert.deepEqual(callsOf(deps.claims.release), [['i-001', SESSION_ID]])
    })

    // Stop and ReclaimStaleClaims both release a closed session's instance. Run side by side,
    // the slower one re-tagged the instance idle after the next session had reserved it.
    test('a second release of the same session joins the one in flight', async () => {
        let finishUndeploy
        const deps = {...makeDeps(), releasing: new Map()}
        deps.provisioner.undeploy = mock.fn(() => new Promise(resolve => {
            finishUndeploy = resolve
        }))

        const first = releaseInstance('i-001', SESSION_ID, deps)
        const second = releaseInstance('i-001', SESSION_ID, deps)
        await new Promise(resolve => setImmediate(resolve))
        finishUndeploy()
        await Promise.all([first, second])

        assert.equal(deps.provisioner.undeploy.mock.callCount(), 1)
        assert.equal(deps.provider.release.mock.callCount(), 1)
    })
})

describe('sizeIdlePool', () => {
    let sizeIdlePool

    before(async () => {
        ;({sizeIdlePool} = await import('./command/sizeIdlePool.js'))
    })

    const makeProvider = ({idleInstances = [], pooledInstances = [], launchResult = [makeInstance({id: 'i-new'})]} = {}) => ({
        idleInstances: mock.fn(async () => idleInstances),
        pooledInstances: mock.fn(async () => pooledInstances),
        launchIdle: mock.fn(async () => launchResult),
        launchPooled: mock.fn(async () => []),
        pool: mock.fn(async () => undefined),
        terminate: mock.fn(async () => undefined),
    })

    const minutesAgo = m => new Date(Date.now() - m * 60_000)

    const makeClaims = (claimed = []) => ({
        claim: mock.fn(async instanceId => !claimed.includes(instanceId)),
        release: mock.fn(async () => true),
        all: async () => claimed.map(instanceId => ({instanceId, sessionId: 'allocating'})),
    })

    // A request claims an idle instance before tagging it reserved; stopping or terminating it in
    // that window costs the user their session.
    test('a surplus instance a request has claimed is neither pooled nor terminated', async () => {
        const idleInstances = [
            makeInstance({id: 'i-requested', type: 'T3aSmall', launchTime: minutesAgo(10)}),
            makeInstance({id: 'i-free', type: 'T3aSmall', launchTime: minutesAgo(5)}),
        ]
        const provider = makeProvider({idleInstances})
        await sizeIdlePool({}, 1, {provider, claims: makeClaims(['i-requested'])})

        assert.deepEqual(callsOf(provider.pool).map(([id]) => id), ['i-free'])
        assert.equal(provider.terminate.mock.callCount(), 0)
    })

    test('holds the claim on a surplus instance only while pooling or terminating it', async () => {
        const idleInstances = [
            makeInstance({id: 'i-pooled', type: 'T3aSmall', launchTime: minutesAgo(10)}),
            makeInstance({id: 'i-terminated', type: 'T3aSmall', launchTime: minutesAgo(5)}),
        ]
        const provider = makeProvider({idleInstances})
        const claims = makeClaims()
        await sizeIdlePool({}, 1, {provider, claims})

        assert.deepEqual(callsOf(claims.claim).map(([id]) => id), ['i-pooled', 'i-terminated'])
        assert.deepEqual(callsOf(claims.release).map(([id]) => id), ['i-pooled', 'i-terminated'])
    })

    test('the pool slot of an instance a request took is warm-up launched', async () => {
        const idleInstances = [makeInstance({id: 'i-requested', type: 'T3aSmall'})]
        const provider = makeProvider({idleInstances})
        await sizeIdlePool({}, 1, {provider, claims: makeClaims(['i-requested'])})

        assert.equal(provider.pool.mock.callCount(), 0)
        assert.deepEqual(callsOf(provider.launchPooled), [[1]])
    })

    test('a stopped pool of size 0 is never queried, filled or launched', async () => {
        const provider = makeProvider({idleInstances: [makeInstance({id: 'i-a'}), makeInstance({id: 'i-b'})]})
        await sizeIdlePool({'T3aSmall': 1}, 0, {provider, claims: makeClaims()})

        assert.equal(provider.pooledInstances.mock.callCount(), 0)
        assert.equal(provider.pool.mock.callCount(), 0)
        assert.equal(provider.launchPooled.mock.callCount(), 0)
    })

    // The oldest surplus instances have read the most of their disk, so they are the warmest to keep.
    test('surplus idle instances fill the stopped pool oldest first; the rest are terminated', async () => {
        const idleInstances = [
            makeInstance({id: 'i-kept', type: 'T3aSmall', launchTime: minutesAgo(120)}),
            makeInstance({id: 'i-old', type: 'T3aSmall', launchTime: minutesAgo(90)}),
            makeInstance({id: 'i-new', type: 'T3aSmall', launchTime: minutesAgo(1)}),
            makeInstance({id: 'i-mid', type: 'M6aXlarge', launchTime: minutesAgo(30)}),
        ]
        const provider = makeProvider({idleInstances, pooledInstances: [makeInstance({id: 'i-pooled'})]})
        await sizeIdlePool({'T3aSmall': 1}, 3, {provider, claims: makeClaims()})

        assert.deepEqual(callsOf(provider.pool).map(([id]) => id), ['i-old', 'i-mid'])
        assert.deepEqual(callsOf(provider.terminate).map(([id]) => id), ['i-new'])
        assert.equal(provider.launchPooled.mock.callCount(), 0)
    })

    test('the deficit surplus cannot fill is warm-up launched', async () => {
        const idleInstances = [makeInstance({id: 'i-surplus', type: 'T3aSmall'})]
        const provider = makeProvider({idleInstances, pooledInstances: [makeInstance({id: 'i-pooled'})]})
        await sizeIdlePool({}, 4, {provider, claims: makeClaims()})

        assert.deepEqual(callsOf(provider.pool), [['i-surplus']])
        assert.deepEqual(callsOf(provider.launchPooled), [[2]])
    })

    test('a full stopped pool takes no surplus and launches no warm-up', async () => {
        const idleInstances = [makeInstance({id: 'i-surplus', type: 'T3aSmall'})]
        const pooledInstances = [makeInstance({id: 'i-p1'}), makeInstance({id: 'i-p2'})]
        const provider = makeProvider({idleInstances, pooledInstances})
        await sizeIdlePool({}, 2, {provider, claims: makeClaims()})

        assert.equal(provider.pool.mock.callCount(), 0)
        assert.equal(provider.launchPooled.mock.callCount(), 0)
        assert.deepEqual(callsOf(provider.terminate), [['i-surplus']])
    })

    // The deficit is recomputed every cycle, so a failed pooling or warm-up is retried next minute
    // rather than failing the sizing of everything else.
    test('a failed pooling or warm-up launch does not fail the cycle', async () => {
        const idleInstances = [
            makeInstance({id: 'i-fails', type: 'T3aSmall', launchTime: minutesAgo(10)}),
            makeInstance({id: 'i-pools', type: 'T3aSmall', launchTime: minutesAgo(5)}),
        ]
        const provider = makeProvider({idleInstances})
        provider.pool.mock.mockImplementationOnce(async () => {
            throw new Error('stop failed')
        })
        provider.launchPooled.mock.mockImplementation(async () => {
            throw new Error('launch failed')
        })

        assert.equal(await sizeIdlePool({}, 3, {provider, claims: makeClaims()}), undefined)
        assert.deepEqual(callsOf(provider.pool).map(([id]) => id), ['i-fails', 'i-pools'])
    })

    test('current < target: calls launchIdle with deficit count', async () => {
        const provider = makeProvider({idleInstances: []})
        await sizeIdlePool({'T3aSmall': 2}, 0, {provider, claims: makeClaims()})

        assert.deepEqual(callsOf(provider.launchIdle), [['T3aSmall', 2]])
        assert.equal(provider.terminate.mock.callCount(), 0)
    })

    test('current > target: terminates the surplus', async () => {
        const surplus = [
            makeInstance({id: 'i-a', type: 'T3aSmall'}),
            makeInstance({id: 'i-b', type: 'T3aSmall'}),
            makeInstance({id: 'i-c', type: 'T3aSmall'}),
        ]
        const provider = makeProvider({idleInstances: surplus})
        await sizeIdlePool({'T3aSmall': 1}, 0, {provider, claims: makeClaims()})

        assert.equal(provider.terminate.mock.callCount(), 2)
        assert.equal(provider.launchIdle.mock.callCount(), 0)
    })

    // The surplus is almost always the replacement launched the moment the previous idle instance
    // was reserved, racing the released instance coming back. Dropping the oldest keeps the one
    // that may still be booting and throws away the warm one, so the next session pays for a cold
    // boot that the pool exists to avoid.
    test('current > target: terminates the most recently launched, keeping the warm one', async () => {
        const idleInstances = [
            makeInstance({id: 'i-warm', type: 'T3aSmall', launchTime: minutesAgo(90)}),
            makeInstance({id: 'i-cold', type: 'T3aSmall', launchTime: minutesAgo(1)}),
        ]
        const provider = makeProvider({idleInstances})
        await sizeIdlePool({'T3aSmall': 1}, 0, {provider, claims: makeClaims()})

        assert.equal(provider.terminate.mock.callCount(), 1)
        assert.deepEqual(callsOf(provider.terminate), [['i-cold']])
    })

    test('current == target: no-op', async () => {
        const idle = [makeInstance({id: 'i-x', type: 'T3aSmall'})]
        const provider = makeProvider({idleInstances: idle})
        await sizeIdlePool({'T3aSmall': 1}, 0, {provider, claims: makeClaims()})

        assert.equal(provider.launchIdle.mock.callCount(), 0)
        assert.equal(provider.terminate.mock.callCount(), 0)
    })

    test('multiple types: launches for under-target, terminates for over-target', async () => {
        const idleInstances = [
            makeInstance({id: 'i-big-1', type: 'C5aXlarge'}),
            makeInstance({id: 'i-big-2', type: 'C5aXlarge'}),
            makeInstance({id: 'i-big-3', type: 'C5aXlarge'}),
        ]
        const provider = makeProvider({idleInstances})
        await sizeIdlePool({'T3aSmall': 1, 'C5aXlarge': 1}, 0, {provider, claims: makeClaims()})

        assert.deepEqual(callsOf(provider.launchIdle), [['T3aSmall', 1]])
        assert.equal(provider.terminate.mock.callCount(), 2)
    })

    test('accepts Map instead of plain object', async () => {
        const provider = makeProvider({idleInstances: []})
        await sizeIdlePool(new Map([['T3aSmall', 1]]), 0, {provider, claims: makeClaims()})
        assert.deepEqual(callsOf(provider.launchIdle), [['T3aSmall', 1]])
    })

    test('terminates all idle instances of types NOT in the target map (non-target type → target=0)', async () => {
        // A type with idle instances but no entry in the target map gets target=0, so all of its idle
        // instances are terminated.
        const nonTargetInstances = [
            makeInstance({id: 'i-extra-1', type: 'C5aXlarge'}),
            makeInstance({id: 'i-extra-2', type: 'C5aXlarge'}),
        ]
        const provider = makeProvider({idleInstances: nonTargetInstances})
        await sizeIdlePool({'T3aSmall': 1}, 0, {provider, claims: makeClaims()})

        assert.deepEqual(callsOf(provider.launchIdle), [['T3aSmall', 1]])
        assert.equal(provider.terminate.mock.callCount(), 2)
        const terminatedIds = callsOf(provider.terminate).map(c => c[0])
        assert.ok(terminatedIds.includes('i-extra-1'))
        assert.ok(terminatedIds.includes('i-extra-2'))
    })
})

describe('reclaimStaleClaims', () => {
    let reclaimStaleClaims, releaseUnusedInstances

    before(async () => {
        ;({reclaimStaleClaims} = await import('./command/reclaimStaleClaims.js'))
        ;({releaseUnusedInstances} = await import('./command/releaseUnusedInstances.js'))
    })

    const GRACE_MS = 10 * 60 * 1000
    const claimOn = (instanceId, sessionId, ageMs) => ({
        instanceId, sessionId, claimedAt: new Date(Date.now() - ageMs),
    })

    const makeProvider = (idle = [], reserved = []) => ({
        idleInstances: mock.fn(async () => idle),
        reservedInstances: mock.fn(async () => reserved),
        recoveringInstances: async () => [],
    })

    test('deletes a claim whose instance the hosting service no longer reports', async () => {
        const claims = {
            all: mock.fn(async () => [claimOn('i-gone', 's-1', GRACE_MS + 1000)]),
            release: mock.fn(async () => true),
        }
        const reclaimed = await reclaimStaleClaims(['s-1'], GRACE_MS, {claims, provider: makeProvider()})

        assert.deepEqual(callsOf(claims.release), [['i-gone', 's-1']])
        assert.equal(reclaimed, 1)
    })

    test('retires an abandoned live instance after restart and retains its claim until it is gone', async () => {
        const claims = {
            sessionIdForInstance: mock.fn(async () => 's-missing'),
            all: mock.fn(async () => [claimOn('i-1', 's-missing', GRACE_MS + 1000)]),
            release: mock.fn(async () => true),
        }
        const instance = makeReservedInstance({id: 'i-1', host: '1.2.3.4'})
        const provider = {
            ...makeProvider([instance]),
            getInstance: mock.fn(async () => instance),
            release: mock.fn(async () => undefined),
            terminate: mock.fn(async () => undefined),
            deleteScratchVolume: mock.fn(async () => undefined),
        }
        const provisioner = {undeploy: mock.fn(async () => undefined)}

        const provisioning = createProvisioningRegistry()
        await reclaimStaleClaims([], GRACE_MS, {claims, provider, provisioner, provisioning})
        await reclaimStaleClaims([], GRACE_MS, {claims, provider, provisioner, provisioning: createProvisioningRegistry()})

        assert.equal(claims.release.mock.callCount(), 0)
        assert.equal(provisioner.undeploy.mock.callCount(), 0)
        assert.equal(provider.release.mock.callCount(), 0)
        assert.deepEqual(callsOf(provider.terminate), [['i-1'], ['i-1']])
        assert.equal(provisioning.isProvisioning('i-1'), false)
    })

    // Tag reads are eventually consistent: between claiming an idle candidate and its State tag
    // flipping to reserved, an instance matches neither filter. Deleting on that alone takes the
    // claim away from a request still in flight.
    test('keeps a fresh claim whose instance neither filter reports yet', async () => {
        const claims = {
            all: mock.fn(async () => [claimOn('i-retagging', 's-pending', 1000)]),
            release: mock.fn(async () => true),
        }

        assert.equal(
            await reclaimStaleClaims([], GRACE_MS, {claims, provider: makeProvider()}),
            0
        )
        assert.equal(claims.release.mock.callCount(), 0)
    })

    // The grace must outlast the address wait, or an allocation in flight is reclaimed.
    test('keeps a claim within grace whose session has not appeared yet', async () => {
        const claims = {
            all: mock.fn(async () => [claimOn('i-1', 's-pending', 1000)]),
            release: mock.fn(async () => true),
        }
        const provider = makeProvider([{id: 'i-1'}])

        assert.equal(await reclaimStaleClaims([], GRACE_MS, {claims, provider}), 0)
        assert.equal(claims.release.mock.callCount(), 0)
    })

    test('retirement keeps the claim so ReleaseUnusedInstances cannot return the host to idle', async () => {
        const rows = new Map([['i-1', 's-dead']])
        const claims = {
            sessionIdForInstance: mock.fn(async instanceId => rows.get(instanceId) ?? null),
            all: mock.fn(async () => [...rows].map(([instanceId, sessionId]) =>
                ({instanceId, sessionId, claimedAt: new Date(Date.now() - GRACE_MS - 1000)}))),
            release: mock.fn(async instanceId => rows.delete(instanceId)),
        }
        const instance = makeReservedInstance({id: 'i-1', host: '1.2.3.4'})
        const provider = {
            ...makeProvider(),
            reservedInstances: mock.fn(async () => instance.reservation ? [instance] : []),
            recoveringInstances: async () => [],
            getInstance: mock.fn(async () => instance),
            release: mock.fn(async () => {
                instance.reservation = null
            }),
            terminate: mock.fn(async () => undefined),
            deleteScratchVolume: mock.fn(async () => undefined),
        }
        const provisioner = {undeploy: mock.fn(async () => undefined)}

        await reclaimStaleClaims([], GRACE_MS, {claims, provider, provisioner})
        await releaseUnusedInstances([], 5, 'MINUTES', {claims, provider, provisioner})

        assert.equal(provisioner.undeploy.mock.callCount(), 0)
        assert.equal(provider.release.mock.callCount(), 0)
        assert.deepEqual(callsOf(provider.terminate), [['i-1']])
        assert.equal(rows.has('i-1'), true)
    })

    test('keeps a claim backed by an open session however old', async () => {
        const claims = {
            all: mock.fn(async () => [claimOn('i-1', 's-open', 99 * GRACE_MS)]),
            release: mock.fn(async () => true),
        }
        const provider = makeProvider([], [{id: 'i-1'}])

        assert.equal(await reclaimStaleClaims(['s-open'], GRACE_MS, {claims, provider}), 0)
    })

    // One claim's release rejecting must not abort the batch: the per-claim try/catch is what
    // lets the sweep move on to the remaining claims instead of dying on the first bad row.
    test('a claim that fails to release does not stop the rest of the sweep', async () => {
        const claims = {
            all: mock.fn(async () => [
                claimOn('i-1', 's-1', GRACE_MS + 1000),
                claimOn('i-2', 's-2', GRACE_MS + 1000),
                claimOn('i-3', 's-3', GRACE_MS + 1000),
            ]),
            release: mock.fn(async instanceId =>
                instanceId === 'i-2' ? Promise.reject(new Error('db down')) : true),
        }

        const reclaimed = await reclaimStaleClaims([], GRACE_MS, {claims, provider: makeProvider()})

        assert.deepEqual(callsOf(claims.release), [['i-1', 's-1'], ['i-2', 's-2'], ['i-3', 's-3']])
        assert.equal(reclaimed, 2)
    })
})

describe('releaseUnusedInstances', () => {
    let releaseUnusedInstances

    before(async () => {
        ;({releaseUnusedInstances} = await import('./command/releaseUnusedInstances.js'))
    })

    const OLD_TIME = new Date(Date.now() - 20 * 60 * 1000) // 20 min ago
    const NEW_TIME = new Date(Date.now() - 30 * 1000)      // 30 sec ago
    const HOUR_MS = 60 * 60 * 1000

    const makeFullDeps = reservedInstances => ({
        claims: {
            sessionIdForInstance: mock.fn(async () => null),
            claim: mock.fn(async () => true),
            all: mock.fn(async () => []),
            release: mock.fn(async () => true),
        },
        provider: {
            reservedInstances: mock.fn(async () => reservedInstances),
            recoveringInstances: async () => [],
            getInstance: mock.fn(id => Promise.resolve(reservedInstances.find(i => i.id === id) ?? null)),
            release: mock.fn(async () => undefined),
            terminate: mock.fn(async () => undefined),
            deleteScratchVolume: mock.fn(async () => undefined),
        },
        provisioner: {
            undeploy: mock.fn(async () => undefined),
        },
    })

    test('retires orphan reservations not in use and older than minAge', async () => {
        const old = makeReservedInstance({id: 'i-old', launchTime: OLD_TIME})
        const used = makeReservedInstance({id: 'i-used', launchTime: OLD_TIME})
        const young = makeReservedInstance({id: 'i-young', launchTime: NEW_TIME})

        const deps = makeFullDeps([old, used, young])

        await releaseUnusedInstances(['i-used'], 5, 'MINUTES', deps)

        assert.deepEqual(callsOf(deps.provider.terminate), [['i-old']])
        assert.equal(deps.provider.release.mock.callCount(), 0)
    })

    test('one failure does not abort release of others', async () => {
        const inst1 = makeReservedInstance({id: 'i-a', launchTime: OLD_TIME})
        const inst2 = makeReservedInstance({id: 'i-b', launchTime: OLD_TIME})
        const inst3 = makeReservedInstance({id: 'i-c', launchTime: OLD_TIME})

        const deps = makeFullDeps([inst1, inst2, inst3])
        deps.provider.terminate = mock.fn(instanceId => {
            if (instanceId === 'i-b') return Promise.reject(new Error('terminate fail'))
            return Promise.resolve()
        })

        await releaseUnusedInstances([], 5, 'MINUTES', deps)

        const releasedIds = callsOf(deps.provider.terminate).map(c => c[0])
        assert.ok(releasedIds.includes('i-a'))
        assert.ok(releasedIds.includes('i-c'))
    })

    test('skips instances within minAge', async () => {
        const young1 = makeReservedInstance({id: 'i-y1', launchTime: NEW_TIME})
        const young2 = makeReservedInstance({id: 'i-y2', launchTime: NEW_TIME})
        const deps = makeFullDeps([young1, young2])

        await releaseUnusedInstances([], 5, 'MINUTES', deps)

        assert.equal(deps.provider.release.mock.callCount(), 0)
        assert.equal(deps.provider.terminate.mock.callCount(), 0)
    })

    test('age boundary: instance exactly at minAge is NOT released (strict > parity with Java)', async () => {
        // Strict greater-than: an instance whose age equals minAge exactly must be skipped.
        const {TIME_UNIT_MS} = await import('./command/releaseUnusedInstances.js')
        const minAge = 5
        const timeUnit = 'MINUTES'
        const minAgeMs = minAge * TIME_UNIT_MS[timeUnit] // 300 000 ms

        // Freeze "now" so the test's boundary math and the command's own Date.now() agree exactly.
        // Without this, wall-clock drift between setup and the age check makes an instance built at
        // "exactly minAge" read as strictly-older by a few ms → released → flaky failure.
        const FIXED_NOW = 1_800_000_000_000
        const nowSpy = mock.method(Date, 'now', () => FIXED_NOW)
        try {
            const exactTime = new Date(FIXED_NOW - minAgeMs)
            const exactInst = makeReservedInstance({id: 'i-exact', launchTime: exactTime})

            const olderTime = new Date(FIXED_NOW - minAgeMs - 1)
            const olderInst = makeReservedInstance({id: 'i-older', launchTime: olderTime})

            const deps = makeFullDeps([exactInst, olderInst])

            await releaseUnusedInstances([], minAge, timeUnit, deps)

            const releasedIds = callsOf(deps.provider.terminate).map(c => c[0])
            assert.ok(!releasedIds.includes('i-exact'))
            assert.ok(releasedIds.includes('i-older'))
        } finally {
            nowSpy.mock.restore()
        }
    })

    test('skips an instance holding a claim even when it is old and unused', async () => {
        const old = makeReservedInstance({id: 'i-claimed', launchTime: new Date(Date.now() - HOUR_MS)})
        const claims = {
            all: mock.fn(
                async () => [{instanceId: 'i-claimed', sessionId: 's-1', claimedAt: new Date()}]
            ),
            release: mock.fn(async () => true),
        }
        const provider = {
            reservedInstances: mock.fn(async () => [old]),
            recoveringInstances: async () => [],
            getInstance: mock.fn(async () => old),
            release: mock.fn(),
            terminate: mock.fn(),
        }
        const provisioner = {undeploy: mock.fn()}

        await releaseUnusedInstances([], 5, 'MINUTES', {claims, provider, provisioner})

        assert.equal(provider.release.mock.callCount(), 0)
        assert.equal(provider.terminate.mock.callCount(), 0)
    })

    test('retires an old unused instance with no claim', async () => {
        const old = makeReservedInstance({id: 'i-orphan', host: '1.2.3.4', launchTime: new Date(Date.now() - HOUR_MS)})
        const claims = {
            sessionIdForInstance: mock.fn(async () => null),
            claim: mock.fn(async () => true),
            all: mock.fn(async () => []),
            release: mock.fn(async () => true),
        }
        const provider = {
            reservedInstances: mock.fn(async () => [old]),
            recoveringInstances: async () => [],
            getInstance: mock.fn(async () => old),
            release: mock.fn(async () => undefined),
            terminate: mock.fn(),
            deleteScratchVolume: mock.fn(async () => undefined),
        }
        const provisioner = {undeploy: mock.fn(async () => undefined)}

        await releaseUnusedInstances([], 5, 'MINUTES', {claims, provider, provisioner})

        assert.deepEqual(callsOf(provider.terminate), [['i-orphan']])
        assert.equal(provider.release.mock.callCount(), 0)
        assert.equal(provisioner.undeploy.mock.callCount(), 0)
        assert.equal(claims.release.mock.callCount(), 0)
    })
})

describe('findMissingInstances', () => {
    let findMissingInstances

    before(async () => {
        ;({findMissingInstances} = await import('./query/findMissingInstances.js'))
    })

    // The query reports every instance the probe did not CONFIRM, carrying the verdict — the caller
    // needs UNKNOWN and MISSING kept apart, because only one of them may close a session.
    test('returns the instances that did not come back PROVISIONED, each with its status', async () => {
        const inst1 = makeReservedInstance({id: 'i-ok'})
        const inst2 = makeReservedInstance({id: 'i-missing'})
        const inst3 = makeReservedInstance({id: 'i-unreachable'})

        const status = {'i-ok': 'PROVISIONED', 'i-missing': 'MISSING', 'i-unreachable': 'UNKNOWN'}
        const provisioner = {instanceStatus: mock.fn(inst => Promise.resolve(status[inst.id]))}

        const result = await findMissingInstances([inst1, inst2, inst3], {provisioner})

        assert.equal(result.length, 2)
        assert.equal(result.find(({instance}) => instance.id === 'i-missing').status, 'MISSING')
        assert.equal(
            result.find(({instance}) => instance.id === 'i-unreachable').status,
            'UNKNOWN'
        )
        assert.equal(result.some(({instance}) => instance.id === 'i-ok'), false)
    })

    test('returns empty array when all provisioned', async () => {
        const provisioner = {instanceStatus: mock.fn(async () => 'PROVISIONED')}
        const result = await findMissingInstances([makeInstance(), makeInstance({id: 'i-002'})], {provisioner})
        assert.deepEqual(result, [])
    })

    test('returns all instances when none provisioned', async () => {
        const provisioner = {instanceStatus: mock.fn(async () => 'MISSING')}
        const instances = [makeInstance({id: 'i-1'}), makeInstance({id: 'i-2'})]
        const result = await findMissingInstances(instances, {provisioner})
        assert.equal(result.length, 2)
    })

    test('empty input returns empty array', async () => {
        const provisioner = {instanceStatus: mock.fn()}
        const result = await findMissingInstances([], {provisioner})
        assert.deepEqual(result, [])
        assert.equal(provisioner.instanceStatus.mock.callCount(), 0)
    })
})

describe('instanceManager', () => {
    let createInstanceManager, events

    before(async () => {
        ;({createInstanceManager} = await import('./instanceManager.js'))
        events = await import('./events.js')
    })

    const makeManagerDeps = (overrides = {}) => ({
        claims: {
            sessionIdForInstance: mock.fn(async () => null),
            all: mock.fn(async () => []),
            claim: mock.fn(async () => true),
            release: mock.fn(async () => true),
        },
        provider: {
            idleInstances: mock.fn(async () => []),
            pooledInstances: mock.fn(async () => []),
            launchReserved: mock.fn(async () => makeReservedInstance({id: 'i-mgr'})),
            reserve: mock.fn(async () => undefined),
            getInstance: mock.fn(async () => makeReservedInstance()),
            release: mock.fn(async () => undefined),
            terminate: mock.fn(async () => undefined),
            reservedInstances: mock.fn(async () => []),
            recoveringInstances: async () => [],
            awaitHost: mock.fn(async instance => instance),
        },
        provisioner: {
            undeploy: mock.fn(async () => undefined),
            instanceStatus: mock.fn(async () => 'PROVISIONED'),
        },
        instanceTypes: [
            {id: 'T3aSmall', idleCount: 0},
        ],
        ...overrides,
    })

    test('requestInstance resolves to {id, host} projection (Java InstanceComponentAdapter parity)', async () => {
        const deps = makeManagerDeps()
        const manager = createInstanceManager(deps)
        const result = await manager.requestInstance({
            workerType: 'SANDBOX',
            instanceType: 'T3aSmall',
            username: 'alice',
        })
        assert.deepEqual(result['id'], 'i-mgr')
        assert.ok('host' in Object(result))
        assert.ok(!('reservation' in Object(result)))
        assert.ok(!('launchTime' in Object(result)))
        assert.ok(!('running' in Object(result)))
        assert.ok(!('type' in Object(result)))
    })

    // requestInstance is handed the whole session; the id must survive into the reservation, since
    // that is the only route the session id has to the provisioner naming the container.
    test('requestInstance carries the session id into the reservation', async () => {
        const deps = makeManagerDeps()
        const manager = createInstanceManager(deps)

        await manager.requestInstance({
            id: 's-42',
            workerType: 'SANDBOX',
            instanceType: 'T3aSmall',
            username: 'alice',
        })

        assert.deepEqual(callsOf(deps.provider.launchReserved), [
            ['T3aSmall', {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'}]
        ])
    })

    test('onInstanceActivated fires with {id, host} only (Java InstanceComponentAdapter parity)', async () => {
        const deps = makeManagerDeps()
        const manager = createInstanceManager(deps)

        const activated = []
        manager.onInstanceActivated(inst => activated.push(inst))

        const inst = makeReservedInstance({id: 'i-activated', host: 'host-act'})
        events.emitInstanceProvisioned(inst)

        // EventEmitter fires synchronously
        assert.equal(activated.length, 1)
        assert.deepEqual(activated[0], {id: 'i-activated', host: 'host-act'})
        assert.ok(!('reservation' in Object(activated[0])))
        assert.ok(!('launchTime' in Object(activated[0])))
    })

    test('onFailedToProvisionInstance fires with {id, host} and NO error arg (Java InstanceComponentAdapter parity)', async () => {
        const deps = makeManagerDeps()
        const manager = createInstanceManager(deps)

        const failures = []
        manager.onFailedToProvisionInstance(inst => failures.push(inst))

        const inst = makeReservedInstance({id: 'i-fail-mgr', host: 'host-fail'})
        const err = new Error('provision failed')
        events.emitFailedToProvisionInstance(inst, err)

        assert.equal(failures.length, 1)
        assert.deepEqual(failures[0], {id: 'i-fail-mgr', host: 'host-fail'})
        assert.ok(!('reservation' in Object(failures[0])))
    })

    test('reclaimStaleClaims passes the provisioner down for local retirement cleanup', async () => {
        const instance = makeReservedInstance({id: 'i-abandoned', host: '1.2.3.4', daemonHost: 'shared-daemon'})
        const deps = makeManagerDeps()
        deps.claims.all = mock.fn(async () => [
            {instanceId: 'i-abandoned', sessionId: 's-dead', claimedAt: new Date(0)},
        ])
        deps.provider.idleInstances = mock.fn(async () => [instance])
        deps.provider.getInstance = mock.fn(async () => instance)
        const mgr = createInstanceManager(deps)

        await mgr.reclaimStaleClaims([], 10 * 60 * 1000)

        assert.equal(deps.provisioner.undeploy.mock.callCount(), 1)
    })

    test('release forwards explicit pending-session retirement even with an empty registry', async () => {
        const deps = makeManagerDeps()
        const manager = createInstanceManager(deps)

        await manager.releaseInstance('i-mgr', 's-1', {retire: true})

        assert.deepEqual(callsOf(deps.provider.terminate), [['i-mgr']])
        assert.equal(deps.provider.release.mock.callCount(), 0)
        assert.equal(deps.provisioner.undeploy.mock.callCount(), 0)
        assert.equal(deps.claims.release.mock.callCount(), 0)
    })

    test('getInstanceTypes returns instanceTypes array', () => {
        const types = [{id: 'T3aSmall', idleCount: 1}]
        const manager = createInstanceManager(makeManagerDeps({instanceTypes: types}))
        assert.equal(manager.getInstanceTypes(), types)
    })

    test('sessionsWithoutInstance returns the unconfirmed sessions with their status', async () => {
        const deps = makeManagerDeps()
        const status = {'i-ok': 'PROVISIONED', 'i-miss': 'MISSING', 'i-unreachable': 'UNKNOWN'}
        deps.provisioner.instanceStatus = mock.fn(inst => Promise.resolve(status[inst.id]))
        const manager = createInstanceManager(deps)

        const sessions = [
            {id: 's-ok', workerType: 'SANDBOX', instance: {id: 'i-ok', host: 'h'}},
            {id: 's-miss', workerType: 'SANDBOX', instance: {id: 'i-miss', host: 'h'}},
            {id: 's-unreachable', workerType: 'SANDBOX', instance: {id: 'i-unreachable', host: 'h'}},
        ]
        const result = await manager.sessionsWithoutInstance(sessions)
        assert.equal(result.length, 2)
        assert.equal(result.find(({session}) => session.id === 's-miss').status, 'MISSING')
        assert.equal(
            result.find(({session}) => session.id === 's-unreachable').status,
            'UNKNOWN'
        )
    })

    test('releaseUnusedInstances passes usedInstanceIds from session.instance.id', async () => {
        const deps = makeManagerDeps()
        const manager = createInstanceManager(deps)
        await manager.releaseUnusedInstances(
            [{instance: {id: 'i-active'}}],
            5,
            'MINUTES'
        )
        assert.equal(deps.provider.reservedInstances.mock.callCount(), 1)
    })
})

// The end-to-end shape of a worker restart on local hosting: the provider's Map is gone, but the
// session row and the claim row are not. Restoring the instance is what lets the eventual close
// tear the container down instead of leaking it.
describe('surviving a worker restart', () => {
    let createWorkerInstanceComponent, createLocalInstanceProvider, instanceFromSession

    before(async () => {
        ;({createWorkerInstanceComponent} = await import('./index.js'))
        ;({createLocalInstanceProvider} = await import('../hostingService/local/localInstanceProvider.js'))
        ;({instanceFromSession} = await import('./instanceFromSession.js'))
    })

    const openSession = {
        id: 's-1',
        username: 'alice',
        workerType: 'sandbox',
        instanceType: 'Local',
        instance: {id: 'i-1', host: 'i-1'},
        creationTime: new Date('2026-01-01T00:00:00Z'),
    }

    const claimTable = rows => ({
        sessionIdForInstance: mock.fn(async instanceId => rows.get(instanceId) ?? null),
        all: mock.fn(async () => [...rows].map(([instanceId, sessionId]) =>
            ({instanceId, sessionId, claimedAt: new Date('2026-01-01T00:00:00Z')}))),
        claim: mock.fn(async (instanceId, sessionId) => {
            if (rows.has(instanceId)) return false
            rows.set(instanceId, sessionId)
            return true
        }),
        release: mock.fn(async instanceId => rows.delete(instanceId)),
    })

    test('a restored instance is undeployed when its session finally closes', async () => {
        // A fresh provider and a fresh component, exactly as a restarted process would build
        // them — with the claim table and the session row carried over.
        const provider = createLocalInstanceProvider({tag: 'local'})
        const claims = claimTable(new Map([['i-1', 's-1']]))
        const provisioner = {undeploy: mock.fn(async () => {})}

        const component = createWorkerInstanceComponent({
            claims,
            provider,
            provisioner,
            instanceTypes: [],
            openSessionInstances: async () => [instanceFromSession(openSession)],
        })
        await component.start()

        await component.instanceManager.releaseInstance('i-1', openSession.id)
        component.stop()

        assert.equal(provisioner.undeploy.mock.callCount(), 1)
        assert.equal(provisioner.undeploy.mock.calls[0].arguments[0].id, 'i-1')
    })
})
