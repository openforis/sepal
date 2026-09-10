import {jest} from '@jest/globals'

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

    beforeAll(async () => {
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
        expect(keys).toContain('workerInstance.InstanceLaunched')
        expect(keys).toContain('workerInstance.InstancePendingProvisioning')
        expect(keys).toContain('workerInstance.InstanceProvisioned')
        expect(keys).toContain('workerInstance.InstanceReleased')
        expect(keys).toContain('workerInstance.FailedToProvisionInstance')
        expect(keys).toContain('workerInstance.FailedToReleaseInstance')
        expect(keys).toContain('workerInstance.FailedToRequestInstance')
        expect(keys).toHaveLength(7)
    })

    test('emitInstanceLaunched publishes {instance} to instanceLaunched$', () => {
        const inst = makeInstance()
        events.emitInstanceLaunched(inst)
        expect(collected['instanceLaunched$']).toHaveLength(1)
        expect(collected['instanceLaunched$'][0]).toEqual({instance: inst})
    })

    test('emitInstancePendingProvisioning publishes {instance} + fires in-proc event', () => {
        const inst = makeReservedInstance()
        const inProcPayloads = []
        events.instanceEvents.once('InstancePendingProvisioning', i => inProcPayloads.push(i))
        events.emitInstancePendingProvisioning(inst)
        expect(collected['instancePendingProvisioning$']).toHaveLength(1)
        expect(collected['instancePendingProvisioning$'][0]).toEqual({instance: inst})
        expect(inProcPayloads).toHaveLength(1)
        expect(inProcPayloads[0]).toBe(inst)
    })

    test('emitInstanceProvisioned publishes {instance} + fires in-proc InstanceProvisioned', () => {
        const inst = makeReservedInstance()
        const inProcPayloads = []
        events.instanceEvents.once('InstanceProvisioned', i => inProcPayloads.push(i))
        events.emitInstanceProvisioned(inst)
        expect(collected['instanceProvisioned$']).toHaveLength(1)
        expect(collected['instanceProvisioned$'][0]).toEqual({instance: inst})
        expect(inProcPayloads).toHaveLength(1)
    })

    test('emitInstanceReleased publishes {instance}', () => {
        const inst = makeInstance()
        events.emitInstanceReleased(inst)
        expect(collected['instanceReleased$'][0]).toEqual({instance: inst})
    })

    test('emitFailedToProvisionInstance publishes {instance, error} (string)', () => {
        const inst = makeInstance()
        const err = new Error('docker timeout')
        events.emitFailedToProvisionInstance(inst, err)
        const payload = collected['failedToProvisionInstance$'][0]
        expect(payload.instance).toBe(inst)
        expect(typeof payload.error).toBe('string')
        expect(payload.error).toBe('docker timeout')
    })

    test('emitFailedToReleaseInstance publishes {instanceId, error} — NOT instance object', () => {
        events.emitFailedToReleaseInstance('i-999', new Error('ssh fail'))
        const payload = collected['failedToReleaseInstance$'][0]
        expect(payload.instanceId).toBe('i-999')
        expect(payload.error).toBe('ssh fail')
        expect(payload).not.toHaveProperty('instance')
    })

    test('emitFailedToRequestInstance publishes {workerType, instanceType, exception}', () => {
        events.emitFailedToRequestInstance('SANDBOX', 'T3aSmall', new Error('quota'))
        const payload = collected['failedToRequestInstance$'][0]
        expect(payload.workerType).toBe('SANDBOX')
        expect(payload.instanceType).toBe('T3aSmall')
        expect(payload.exception).toBe('quota')
    })
})

describe('requestInstance', () => {
    let requestInstance, events

    beforeAll(async () => {
        ;({requestInstance} = await import('./command/requestInstance.js'))
        events = await import('./events.js')
    })

    const makeClaims = (overrides = {}) => ({
        claim: jest.fn().mockResolvedValue(true),
        release: jest.fn().mockResolvedValue(true),
        ...overrides,
    })

    const makeProvider = (overrides = {}) => ({
        idleInstances: jest.fn().mockResolvedValue([]),
        launchReserved: jest.fn().mockResolvedValue(makeReservedInstance({id: 'i-new'})),
        reserve: jest.fn().mockResolvedValue(undefined),
        awaitHost: jest.fn(async instance => instance),
        ...overrides,
    })

    const REQUEST = {workerType: 'SANDBOX', instanceType: 'T3aSmall', username: 'alice', sessionId: 's-42'}

    test('no idle instance: launches, records the claim, emits InstanceLaunched', async () => {
        const launched = []
        events.instanceLaunched$.subscribe(v => launched.push(v))
        const claims = makeClaims()
        const provider = makeProvider()

        const result = await requestInstance(REQUEST, {claims, provider})

        expect(provider.launchReserved).toHaveBeenCalledWith(
            'T3aSmall', {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'})
        expect(claims.claim).toHaveBeenCalledWith('i-new', 's-42')
        expect(result.id).toBe('i-new')
        expect(launched.length).toBeGreaterThanOrEqual(1)
    })

    test('idle instance: claims it, tags the reservation, emits InstancePendingProvisioning', async () => {
        const pending = []
        events.instancePendingProvisioning$.subscribe(v => pending.push(v))
        const idle = makeInstance({id: 'i-idle', host: '1.2.3.4', running: true})
        const claims = makeClaims()
        const provider = makeProvider({idleInstances: jest.fn().mockResolvedValue([idle])})

        const result = await requestInstance(REQUEST, {claims, provider})

        expect(claims.claim).toHaveBeenCalledWith('i-idle', 's-42')
        expect(provider.launchReserved).not.toHaveBeenCalled()
        expect(provider.reserve.mock.calls[0][0].reservation)
            .toEqual({username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'})
        expect(result.id).toBe('i-idle')
        expect(pending.length).toBeGreaterThanOrEqual(1)
    })

    // The behaviour this redesign exists for: a lost race must not launch while idle instances remain.
    test('lost claim on the first candidate: claims the second instead of launching', async () => {
        const idle1 = makeInstance({id: 'i-1', host: '1.1.1.1', running: true})
        const idle2 = makeInstance({id: 'i-2', host: '2.2.2.2', running: true})
        const claims = makeClaims({
            claim: jest.fn()
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true),
        })
        const provider = makeProvider({idleInstances: jest.fn().mockResolvedValue([idle1, idle2])})

        const result = await requestInstance(REQUEST, {claims, provider})

        expect(claims.claim.mock.calls.map(([id]) => id)).toEqual(['i-1', 'i-2'])
        expect(provider.launchReserved).not.toHaveBeenCalled()
        expect(result.id).toBe('i-2')
    })

    test('every candidate taken: falls back to launching', async () => {
        const idle = makeInstance({id: 'i-1', host: '1.1.1.1', running: true})
        const claims = makeClaims({claim: jest.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true)})
        const provider = makeProvider({idleInstances: jest.fn().mockResolvedValue([idle])})

        const result = await requestInstance(REQUEST, {claims, provider})

        expect(provider.launchReserved).toHaveBeenCalledTimes(1)
        expect(result.id).toBe('i-new')
    })

    // Booted before booting; oldest first within each group.
    test('prefers a booted instance over a booting one, oldest first', async () => {
        const booting = makeInstance({id: 'i-booting', host: null, running: false, launchTime: new Date(1000)})
        const newBooted = makeInstance({id: 'i-new-booted', host: '2.2.2.2', running: true, launchTime: new Date(3000)})
        const oldBooted = makeInstance({id: 'i-old-booted', host: '1.1.1.1', running: true, launchTime: new Date(2000)})
        const claims = makeClaims()
        const provider = makeProvider({
            idleInstances: jest.fn().mockResolvedValue([booting, newBooted, oldBooted]),
        })

        await requestInstance(REQUEST, {claims, provider})

        expect(claims.claim.mock.calls[0][0]).toBe('i-old-booted')
    })

    test('claims a booting instance and waits for its address', async () => {
        const booting = makeInstance({id: 'i-booting', host: null, running: false})
        const claims = makeClaims()
        const provider = makeProvider({
            idleInstances: jest.fn().mockResolvedValue([booting]),
            awaitHost: jest.fn(async instance => ({...instance, host: '9.9.9.9'})),
        })

        const result = await requestInstance(REQUEST, {claims, provider})

        expect(provider.awaitHost).toHaveBeenCalledTimes(1)
        expect(result.host).toBe('9.9.9.9')
    })

    // awaitHost re-reads the instance from the hosting service, which derives the reservation from
    // tags that may not have propagated yet. The provisioner dereferences reservation.workerType
    // and names the container from reservation.sessionId, so a blank one costs the user a session.
    const RESERVATION = {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'}

    test('a reservation lost in the address read-back does not reach the provisioner', async () => {
        const pending = []
        events.instancePendingProvisioning$.subscribe(v => pending.push(v))
        const idle = makeInstance({id: 'i-booting', host: null, running: false})
        const claims = makeClaims()
        const provider = makeProvider({
            idleInstances: jest.fn().mockResolvedValue([idle]),
            awaitHost: jest.fn(async instance => ({
                ...instance,
                host: '9.9.9.9',
                reservation: {username: '', workerType: '', sessionId: null},
            })),
        })

        const result = await requestInstance(REQUEST, {claims, provider})

        expect(result.reservation).toEqual(RESERVATION)
        expect(pending[pending.length - 1].instance.reservation).toEqual(RESERVATION)
    })

    test('the launch path re-pins the reservation the read-back dropped', async () => {
        const launched = []
        events.instanceLaunched$.subscribe(v => launched.push(v))
        const claims = makeClaims()
        const provider = makeProvider({
            launchReserved: jest.fn().mockResolvedValue(
                makeReservedInstance({id: 'i-new', host: null, running: false})),
            awaitHost: jest.fn(async instance => ({...instance, host: '9.9.9.9', reservation: null})),
        })

        const result = await requestInstance(REQUEST, {claims, provider})

        expect(result.reservation).toEqual(RESERVATION)
        expect(launched[launched.length - 1].instance.reservation).toEqual(RESERVATION)
    })

    // Without this the instance is claimed forever with no session behind it — the exact
    // failure mode this redesign removes.
    test('a failure after claiming releases the claim', async () => {
        const idle = makeInstance({id: 'i-idle', host: '1.2.3.4', running: true})
        const claims = makeClaims()
        const provider = makeProvider({
            idleInstances: jest.fn().mockResolvedValue([idle]),
            reserve: jest.fn().mockRejectedValue(new Error('tagging failed')),
        })

        await expect(requestInstance(REQUEST, {claims, provider})).rejects.toThrow('tagging failed')
        expect(claims.release).toHaveBeenCalledWith('i-idle')
    })

    // A failed launch-path claim costs the instance its protection from ReleaseUnusedInstances,
    // but failing the request would strand a running machine — the worse of the two.
    test('a failed claim on the launch path does not fail the request', async () => {
        const claims = makeClaims({claim: jest.fn().mockRejectedValue(new Error('db down'))})
        const provider = makeProvider()

        const result = await requestInstance(REQUEST, {claims, provider})

        expect(result.id).toBe('i-new')
    })

    // launchReserved returns as soon as the instance is tagged State=reserved; waiting for its
    // address after that can take minutes. Claiming only afterwards leaves an instance reserved
    // with no claim and no session — ReleaseUnusedInstances hands it to somebody else mid-request.
    test('the launch path records the claim before waiting for the address', async () => {
        const claims = makeClaims()
        let claimedBeforeWait = null
        const provider = makeProvider({
            launchReserved: jest.fn().mockResolvedValue(
                makeReservedInstance({id: 'i-new', host: null, running: false})),
            awaitHost: jest.fn(async instance => {
                claimedBeforeWait = claims.claim.mock.calls.length > 0
                return {...instance, host: '9.9.9.9'}
            }),
        })

        const result = await requestInstance(REQUEST, {claims, provider})

        expect(claimedBeforeWait).toBe(true)
        expect(result.host).toBe('9.9.9.9')
    })

    test('on exception: emits FailedToRequestInstance and rethrows', async () => {
        const failed = []
        events.failedToRequestInstance$.subscribe(v => failed.push(v))
        const claims = makeClaims()
        const provider = makeProvider({
            idleInstances: jest.fn().mockRejectedValue(new Error('ec2 down')),
        })

        await expect(requestInstance(REQUEST, {claims, provider})).rejects.toThrow('ec2 down')

        const payload = failed[failed.length - 1]
        expect(payload.workerType).toBe('SANDBOX')
        expect(payload.instanceType).toBe('T3aSmall')
    })
})

describe('provisionInstance', () => {
    let provisionInstance, events

    beforeAll(async () => {
        ;({provisionInstance} = await import('./command/provisionInstance.js'))
        events = await import('./events.js')
    })

    const noDelay = () => Promise.resolve()

    test('success on first try: emits InstanceProvisioned', async () => {
        const provisioned = []
        events.instanceProvisioned$.subscribe(v => provisioned.push(v))

        const provisioner = {provisionInstance: jest.fn().mockResolvedValue(undefined)}
        const inst = makeReservedInstance()
        await provisionInstance(inst, {provisioner, _delayFn: noDelay})

        expect(provisioner.provisionInstance).toHaveBeenCalledTimes(1)
        expect(provisioned.length).toBeGreaterThanOrEqual(1)
        expect(provisioned[provisioned.length - 1].instance).toBe(inst)
    })

    test('all 10 retries fail: emits FailedToProvisionInstance, attempt count = 10', async () => {
        const failed = []
        events.failedToProvisionInstance$.subscribe(v => failed.push(v))

        const provisioner = {
            provisionInstance: jest.fn().mockRejectedValue(new Error('docker unreachable'))
        }
        const inst = makeReservedInstance({id: 'i-fail'})

        await expect(
            provisionInstance(inst, {provisioner, _delayFn: noDelay})
        ).rejects.toThrow('docker unreachable')

        expect(provisioner.provisionInstance).toHaveBeenCalledTimes(10)
        expect(failed.length).toBeGreaterThanOrEqual(1)
        const payload = failed[failed.length - 1]
        expect(payload.instance).toBe(inst)
        expect(typeof payload.error).toBe('string')
    })

    test('succeeds on attempt 3: exact call count = 3', async () => {
        const provisioner = {
            provisionInstance: jest.fn()
                .mockRejectedValueOnce(new Error('fail1'))
                .mockRejectedValueOnce(new Error('fail2'))
                .mockResolvedValue(undefined),
        }
        const inst = makeReservedInstance()
        await provisionInstance(inst, {provisioner, _delayFn: noDelay})
        expect(provisioner.provisionInstance).toHaveBeenCalledTimes(3)
    })

    test('in-proc InstanceProvisioned fires on success', async () => {
        const inProcPayloads = []
        const {instanceEvents: ev} = await import('./events.js')
        ev.once('InstanceProvisioned', i => inProcPayloads.push(i))

        const provisioner = {provisionInstance: jest.fn().mockResolvedValue(undefined)}
        const inst = makeReservedInstance({id: 'i-inproc'})
        await provisionInstance(inst, {provisioner, _delayFn: noDelay})

        expect(inProcPayloads).toHaveLength(1)
        expect(inProcPayloads[0]).toBe(inst)
    })

    test('in-proc FailedToProvisionInstance fires on total failure', async () => {
        const inProcPayloads = []
        const {instanceEvents: ev} = await import('./events.js')
        ev.once('FailedToProvisionInstance', (i, e) => inProcPayloads.push({i, e}))

        const provisioner = {
            provisionInstance: jest.fn().mockRejectedValue(new Error('fail'))
        }
        const inst = makeReservedInstance({id: 'i-inproc-fail'})
        await provisionInstance(inst, {provisioner, _delayFn: noDelay}).catch(() => {})

        expect(inProcPayloads).toHaveLength(1)
        expect(inProcPayloads[0].i).toBe(inst)
    })
})

describe('releaseInstance', () => {
    let releaseInstance, events

    beforeAll(async () => {
        ;({releaseInstance} = await import('./command/releaseInstance.js'))
        events = await import('./events.js')
    })

    const makeClaims = (overrides = {}) => ({
        release: jest.fn().mockResolvedValue(true),
        ...overrides,
    })

    const makeDeps = (overrides = {}) => ({
        claims: makeClaims(),
        provider: {
            getInstance: jest.fn().mockResolvedValue(makeReservedInstance()),
            release: jest.fn().mockResolvedValue(undefined),
            terminate: jest.fn().mockResolvedValue(undefined),
        },
        provisioner: {
            undeploy: jest.fn().mockResolvedValue(undefined),
        },
        ...overrides,
    })

    test('happy path: undeploy + release + emits InstanceReleased', async () => {
        const released = []
        events.instanceReleased$.subscribe(v => released.push(v))

        const deps = makeDeps()
        await releaseInstance('i-001', deps)

        expect(deps.provisioner.undeploy).toHaveBeenCalledTimes(1)
        expect(deps.provider.release).toHaveBeenCalledWith('i-001')
        expect(released.length).toBeGreaterThanOrEqual(1)
        const payload = released[released.length - 1]
        expect(payload.instance).toBeDefined()
        expect(payload.instance.reservation).toBeNull()  // release() clears reservation
    })

    test('instance not found in provider: returns without action', async () => {
        const released = []
        events.instanceReleased$.subscribe(v => released.push(v))

        const deps = makeDeps()
        deps.provider.getInstance = jest.fn().mockResolvedValue(null)

        await releaseInstance('i-missing', deps)

        expect(deps.claims.release).toHaveBeenCalledWith('i-missing')
        expect(deps.provisioner.undeploy).not.toHaveBeenCalled()
        expect(released).toHaveLength(0)
    })

    // The claim is the only durable record that this instance may still be carrying a container.
    // Dropping it first and dying before the undeploy stranded the previous user's container on
    // an instance ReleaseUnusedInstances went on to tag idle, ports published and home mounted.
    test('undeploys before dropping the claim, so an interrupted release can be retried', async () => {
        const order = []
        const deps = makeDeps()
        deps.provisioner.undeploy = jest.fn(async () => {
            order.push('undeploy')
        })
        deps.claims.release = jest.fn(async () => {
            order.push('claim')
            return true
        })

        await releaseInstance('i-001', deps)

        expect(order).toEqual(['undeploy', 'claim'])
    })

    test('a claim already gone still undeploys, and still releases and emits', async () => {
        // The claim delete no longer elects the undeployer. Undeploy is a force-delete by
        // container name, so a concurrent releaser doing the same thing finds nothing to do —
        // while skipping it is what left a live container behind.
        const released = []
        events.instanceReleased$.subscribe(v => released.push(v))

        const deps = makeDeps()
        deps.claims.release = jest.fn().mockResolvedValue(false)

        await releaseInstance('i-raced', deps)

        expect(deps.provisioner.undeploy).toHaveBeenCalledTimes(1)
        expect(deps.claims.release).toHaveBeenCalledWith('i-raced')
        expect(deps.provider.release).toHaveBeenCalledWith('i-raced')
        expect(released.length).toBeGreaterThanOrEqual(1)
        const payload = released[released.length - 1]
        expect(payload.instance).toBeDefined()
    })

    test('failure path: emits FailedToReleaseInstance, calls terminate + claims.release', async () => {
        const failed = []
        events.failedToReleaseInstance$.subscribe(v => failed.push(v))

        const deps = makeDeps()
        deps.provisioner.undeploy = jest.fn().mockRejectedValue(new Error('ssh error'))

        await releaseInstance('i-fail', deps)

        expect(failed.length).toBeGreaterThanOrEqual(1)
        const payload = failed[failed.length - 1]
        expect(payload.instanceId).toBe('i-fail')
        expect(typeof payload.error).toBe('string')
        expect(deps.provider.terminate).toHaveBeenCalledWith('i-fail')
        expect(deps.claims.release).toHaveBeenCalledWith('i-fail')
    })

    test('failure path: terminate failure is swallowed (does not throw)', async () => {
        const deps = makeDeps()
        deps.provisioner.undeploy = jest.fn().mockRejectedValue(new Error('undeploy fail'))
        deps.provider.terminate = jest.fn().mockRejectedValue(new Error('terminate fail'))

        await expect(releaseInstance('i-cascade', deps)).resolves.toBeUndefined()
    })

    test('instance with no host: skips undeploy but still releases', async () => {
        const released = []
        events.instanceReleased$.subscribe(v => released.push(v))

        const deps = makeDeps()
        deps.provider.getInstance = jest.fn().mockResolvedValue(makeReservedInstance({host: null}))

        await releaseInstance('i-nohost', deps)

        expect(deps.provisioner.undeploy).not.toHaveBeenCalled()
        expect(deps.provider.release).toHaveBeenCalledTimes(1)
        expect(released.length).toBeGreaterThanOrEqual(1)
    })
})

describe('sizeIdlePool', () => {
    let sizeIdlePool

    beforeAll(async () => {
        ;({sizeIdlePool} = await import('./command/sizeIdlePool.js'))
    })

    const makeProvider = ({idleInstances = [], launchResult = [makeInstance({id: 'i-new'})]} = {}) => ({
        idleInstances: jest.fn().mockResolvedValue(idleInstances),
        launchIdle: jest.fn().mockResolvedValue(launchResult),
        terminate: jest.fn().mockResolvedValue(undefined),
    })

    test('current < target: calls launchIdle with deficit count', async () => {
        const provider = makeProvider({idleInstances: []})
        await sizeIdlePool({'T3aSmall': 2}, {provider})

        expect(provider.launchIdle).toHaveBeenCalledWith('T3aSmall', 2)
        expect(provider.terminate).not.toHaveBeenCalled()
    })

    test('current > target: terminates the surplus', async () => {
        const surplus = [
            makeInstance({id: 'i-a', type: 'T3aSmall'}),
            makeInstance({id: 'i-b', type: 'T3aSmall'}),
            makeInstance({id: 'i-c', type: 'T3aSmall'}),
        ]
        const provider = makeProvider({idleInstances: surplus})
        await sizeIdlePool({'T3aSmall': 1}, {provider})

        expect(provider.terminate).toHaveBeenCalledTimes(2)
        expect(provider.launchIdle).not.toHaveBeenCalled()
    })

    // The surplus is almost always the replacement launched the moment the previous idle instance
    // was reserved, racing the released instance coming back. Dropping the oldest keeps the one
    // that may still be booting and throws away the warm one, so the next session pays for a cold
    // boot that the pool exists to avoid.
    test('current > target: terminates the most recently launched, keeping the warm one', async () => {
        const minutesAgo = m => new Date(Date.now() - m * 60_000)
        const idleInstances = [
            makeInstance({id: 'i-warm', type: 'T3aSmall', launchTime: minutesAgo(90)}),
            makeInstance({id: 'i-cold', type: 'T3aSmall', launchTime: minutesAgo(1)}),
        ]
        const provider = makeProvider({idleInstances})
        await sizeIdlePool({'T3aSmall': 1}, {provider})

        expect(provider.terminate).toHaveBeenCalledTimes(1)
        expect(provider.terminate).toHaveBeenCalledWith('i-cold')
    })

    test('current == target: no-op', async () => {
        const idle = [makeInstance({id: 'i-x', type: 'T3aSmall'})]
        const provider = makeProvider({idleInstances: idle})
        await sizeIdlePool({'T3aSmall': 1}, {provider})

        expect(provider.launchIdle).not.toHaveBeenCalled()
        expect(provider.terminate).not.toHaveBeenCalled()
    })

    test('multiple types: launches for under-target, terminates for over-target', async () => {
        const idleInstances = [
            makeInstance({id: 'i-big-1', type: 'C5aXlarge'}),
            makeInstance({id: 'i-big-2', type: 'C5aXlarge'}),
            makeInstance({id: 'i-big-3', type: 'C5aXlarge'}),
        ]
        const provider = makeProvider({idleInstances})
        await sizeIdlePool({'T3aSmall': 1, 'C5aXlarge': 1}, {provider})

        expect(provider.launchIdle).toHaveBeenCalledWith('T3aSmall', 1)
        expect(provider.terminate).toHaveBeenCalledTimes(2)
    })

    test('accepts Map instead of plain object', async () => {
        const provider = makeProvider({idleInstances: []})
        await sizeIdlePool(new Map([['T3aSmall', 1]]), {provider})
        expect(provider.launchIdle).toHaveBeenCalledWith('T3aSmall', 1)
    })

    test('terminates all idle instances of types NOT in the target map (non-target type → target=0)', async () => {
        // A type with idle instances but no entry in the target map gets target=0, so all of its idle
        // instances are terminated.
        const nonTargetInstances = [
            makeInstance({id: 'i-extra-1', type: 'C5aXlarge'}),
            makeInstance({id: 'i-extra-2', type: 'C5aXlarge'}),
        ]
        const provider = makeProvider({idleInstances: nonTargetInstances})
        await sizeIdlePool({'T3aSmall': 1}, {provider})

        expect(provider.launchIdle).toHaveBeenCalledWith('T3aSmall', 1)
        expect(provider.terminate).toHaveBeenCalledTimes(2)
        const terminatedIds = provider.terminate.mock.calls.map(c => c[0])
        expect(terminatedIds).toContain('i-extra-1')
        expect(terminatedIds).toContain('i-extra-2')
    })
})

describe('reclaimStaleClaims', () => {
    let reclaimStaleClaims, releaseUnusedInstances

    beforeAll(async () => {
        ;({reclaimStaleClaims} = await import('./command/reclaimStaleClaims.js'))
        ;({releaseUnusedInstances} = await import('./command/releaseUnusedInstances.js'))
    })

    const GRACE_MS = 10 * 60 * 1000
    const claimOn = (instanceId, sessionId, ageMs) => ({
        instanceId, sessionId, claimedAt: new Date(Date.now() - ageMs),
    })

    const makeProvider = (idle = [], reserved = []) => ({
        idleInstances: jest.fn().mockResolvedValue(idle),
        reservedInstances: jest.fn().mockResolvedValue(reserved),
    })

    test('deletes a claim whose instance the hosting service no longer reports', async () => {
        const claims = {
            all: jest.fn().mockResolvedValue([claimOn('i-gone', 's-1', GRACE_MS + 1000)]),
            release: jest.fn().mockResolvedValue(true),
        }
        const reclaimed = await reclaimStaleClaims(['s-1'], GRACE_MS, {claims, provider: makeProvider()})

        expect(claims.release).toHaveBeenCalledWith('i-gone')
        expect(reclaimed).toBe(1)
    })

    test('deletes a claim past grace whose session never appeared', async () => {
        const claims = {
            all: jest.fn().mockResolvedValue([claimOn('i-1', 's-missing', GRACE_MS + 1000)]),
            release: jest.fn().mockResolvedValue(true),
        }
        const instance = makeReservedInstance({id: 'i-1', host: '1.2.3.4'})
        const provider = {
            ...makeProvider([instance]),
            getInstance: jest.fn().mockResolvedValue(instance),
            release: jest.fn().mockResolvedValue(undefined),
            terminate: jest.fn().mockResolvedValue(undefined),
        }
        const provisioner = {undeploy: jest.fn().mockResolvedValue(undefined)}

        expect(await reclaimStaleClaims([], GRACE_MS, {claims, provider, provisioner})).toBe(1)
        expect(claims.release).toHaveBeenCalledWith('i-1')
        expect(provisioner.undeploy).toHaveBeenCalledTimes(1)
        expect(provider.release).toHaveBeenCalledWith('i-1')
    })

    // Tag reads are eventually consistent: between claiming an idle candidate and its State tag
    // flipping to reserved, an instance matches neither filter. Deleting on that alone takes the
    // claim away from a request still in flight.
    test('keeps a fresh claim whose instance neither filter reports yet', async () => {
        const claims = {
            all: jest.fn().mockResolvedValue([claimOn('i-retagging', 's-pending', 1000)]),
            release: jest.fn().mockResolvedValue(true),
        }

        expect(await reclaimStaleClaims([], GRACE_MS, {claims, provider: makeProvider()})).toBe(0)
        expect(claims.release).not.toHaveBeenCalled()
    })

    // The grace must outlast the address wait, or an allocation in flight is reclaimed.
    test('keeps a claim within grace whose session has not appeared yet', async () => {
        const claims = {
            all: jest.fn().mockResolvedValue([claimOn('i-1', 's-pending', 1000)]),
            release: jest.fn().mockResolvedValue(true),
        }
        const provider = makeProvider([{id: 'i-1'}])

        expect(await reclaimStaleClaims([], GRACE_MS, {claims, provider})).toBe(0)
        expect(claims.release).not.toHaveBeenCalled()
    })

    // Dropping the row on an instance that still exists hands the undeploy to nobody: nothing
    // downstream knows the instance was ever carrying a container, so ReleaseUnusedInstances
    // tags it idle with the previous user's container still running.
    test('an abandoned claim on a live instance is torn down, not just dropped', async () => {
        const rows = new Map([['i-1', 's-dead']])
        const claims = {
            all: jest.fn(async () => [...rows].map(([instanceId, sessionId]) =>
                ({instanceId, sessionId, claimedAt: new Date(Date.now() - GRACE_MS - 1000)}))),
            release: jest.fn(async instanceId => rows.delete(instanceId)),
        }
        const instance = makeReservedInstance({id: 'i-1', host: '1.2.3.4'})
        const provider = {
            ...makeProvider([], [instance]),
            getInstance: jest.fn(async () => instance),
            release: jest.fn(async () => undefined),
            terminate: jest.fn(async () => undefined),
        }
        const provisioner = {undeploy: jest.fn(async () => undefined)}

        await reclaimStaleClaims([], GRACE_MS, {claims, provider, provisioner})
        // The stub provider does not remove i-1 from reservedInstances() after the first release,
        // so this sweep finds it again with no claim left to skip it on and undeploys it too —
        // the redundant call this invariant makes harmless rather than something to prevent.
        await releaseUnusedInstances([], 5, 'MINUTES', {claims, provider, provisioner})

        expect(provisioner.undeploy).toHaveBeenCalledTimes(2)
        expect(rows.has('i-1')).toBe(false)
    })

    test('keeps a claim backed by an open session however old', async () => {
        const claims = {
            all: jest.fn().mockResolvedValue([claimOn('i-1', 's-open', 99 * GRACE_MS)]),
            release: jest.fn().mockResolvedValue(true),
        }
        const provider = makeProvider([], [{id: 'i-1'}])

        expect(await reclaimStaleClaims(['s-open'], GRACE_MS, {claims, provider})).toBe(0)
    })

    // One claim's release rejecting must not abort the batch: the per-claim try/catch is what
    // lets the sweep move on to the remaining claims instead of dying on the first bad row.
    test('a claim that fails to release does not stop the rest of the sweep', async () => {
        const claims = {
            all: jest.fn().mockResolvedValue([
                claimOn('i-1', 's-1', GRACE_MS + 1000),
                claimOn('i-2', 's-2', GRACE_MS + 1000),
                claimOn('i-3', 's-3', GRACE_MS + 1000),
            ]),
            release: jest.fn(async instanceId =>
                instanceId === 'i-2' ? Promise.reject(new Error('db down')) : true),
        }

        const reclaimed = await reclaimStaleClaims([], GRACE_MS, {claims, provider: makeProvider()})

        expect(claims.release).toHaveBeenCalledWith('i-1')
        expect(claims.release).toHaveBeenCalledWith('i-2')
        expect(claims.release).toHaveBeenCalledWith('i-3')
        expect(reclaimed).toBe(2)
    })
})

describe('releaseUnusedInstances', () => {
    let releaseUnusedInstances

    beforeAll(async () => {
        ;({releaseUnusedInstances} = await import('./command/releaseUnusedInstances.js'))
    })

    const OLD_TIME = new Date(Date.now() - 20 * 60 * 1000) // 20 min ago
    const NEW_TIME = new Date(Date.now() - 30 * 1000)      // 30 sec ago
    const HOUR_MS = 60 * 60 * 1000

    const makeFullDeps = reservedInstances => ({
        claims: {
            all: jest.fn().mockResolvedValue([]),
            release: jest.fn().mockResolvedValue(true),
        },
        provider: {
            reservedInstances: jest.fn().mockResolvedValue(reservedInstances),
            getInstance: jest.fn(id => Promise.resolve(reservedInstances.find(i => i.id === id) ?? null)),
            release: jest.fn().mockResolvedValue(undefined),
            terminate: jest.fn().mockResolvedValue(undefined),
        },
        provisioner: {
            undeploy: jest.fn().mockResolvedValue(undefined),
        },
    })

    test('releases reserved instances not in use and older than minAge', async () => {
        const old = makeReservedInstance({id: 'i-old', launchTime: OLD_TIME})
        const used = makeReservedInstance({id: 'i-used', launchTime: OLD_TIME})
        const young = makeReservedInstance({id: 'i-young', launchTime: NEW_TIME})

        const deps = makeFullDeps([old, used, young])

        await releaseUnusedInstances(['i-used'], 5, 'MINUTES', deps)

        expect(deps.provider.release).toHaveBeenCalledTimes(1)
        const call = deps.provider.release.mock.calls[0]
        expect(call[0]).toBe('i-old')
    })

    test('one failure does not abort release of others', async () => {
        const inst1 = makeReservedInstance({id: 'i-a', launchTime: OLD_TIME})
        const inst2 = makeReservedInstance({id: 'i-b', launchTime: OLD_TIME})
        const inst3 = makeReservedInstance({id: 'i-c', launchTime: OLD_TIME})

        const deps = makeFullDeps([inst1, inst2, inst3])
        deps.provisioner.undeploy = jest.fn(instance => {
            if (instance.id === 'i-b') return Promise.reject(new Error('undeploy fail'))
            return Promise.resolve()
        })

        await releaseUnusedInstances([], 5, 'MINUTES', deps)

        const releasedIds = deps.provider.release.mock.calls.map(c => c[0])
        expect(releasedIds).toContain('i-a')
        expect(releasedIds).toContain('i-c')
    })

    test('skips instances within minAge', async () => {
        const young1 = makeReservedInstance({id: 'i-y1', launchTime: NEW_TIME})
        const young2 = makeReservedInstance({id: 'i-y2', launchTime: NEW_TIME})
        const deps = makeFullDeps([young1, young2])

        await releaseUnusedInstances([], 5, 'MINUTES', deps)

        expect(deps.provider.release).not.toHaveBeenCalled()
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
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW)
        try {
            const exactTime = new Date(FIXED_NOW - minAgeMs)
            const exactInst = makeReservedInstance({id: 'i-exact', launchTime: exactTime})

            const olderTime = new Date(FIXED_NOW - minAgeMs - 1)
            const olderInst = makeReservedInstance({id: 'i-older', launchTime: olderTime})

            const deps = makeFullDeps([exactInst, olderInst])

            await releaseUnusedInstances([], minAge, timeUnit, deps)

            const releasedIds = deps.provider.release.mock.calls.map(c => c[0])
            expect(releasedIds).not.toContain('i-exact')
            expect(releasedIds).toContain('i-older')
        } finally {
            nowSpy.mockRestore()
        }
    })

    test('skips an instance holding a claim even when it is old and unused', async () => {
        const old = makeReservedInstance({id: 'i-claimed', launchTime: new Date(Date.now() - HOUR_MS)})
        const claims = {
            all: jest.fn().mockResolvedValue([{instanceId: 'i-claimed', sessionId: 's-1', claimedAt: new Date()}]),
            release: jest.fn().mockResolvedValue(true),
        }
        const provider = {
            reservedInstances: jest.fn().mockResolvedValue([old]),
            getInstance: jest.fn().mockResolvedValue(old),
            release: jest.fn(),
            terminate: jest.fn(),
        }
        const provisioner = {undeploy: jest.fn()}

        await releaseUnusedInstances([], 5, 'MINUTES', {claims, provider, provisioner})

        expect(provider.release).not.toHaveBeenCalled()
    })

    test('still releases an old unused instance with no claim', async () => {
        const old = makeReservedInstance({id: 'i-orphan', host: '1.2.3.4', launchTime: new Date(Date.now() - HOUR_MS)})
        const claims = {
            all: jest.fn().mockResolvedValue([]),
            release: jest.fn().mockResolvedValue(true),
        }
        const provider = {
            reservedInstances: jest.fn().mockResolvedValue([old]),
            getInstance: jest.fn().mockResolvedValue(old),
            release: jest.fn().mockResolvedValue(undefined),
            terminate: jest.fn(),
        }
        const provisioner = {undeploy: jest.fn().mockResolvedValue(undefined)}

        await releaseUnusedInstances([], 5, 'MINUTES', {claims, provider, provisioner})

        expect(provider.release).toHaveBeenCalledWith('i-orphan')
    })
})

describe('findMissingInstances', () => {
    let findMissingInstances

    beforeAll(async () => {
        ;({findMissingInstances} = await import('./query/findMissingInstances.js'))
    })

    // The query reports every instance the probe did not CONFIRM, carrying the verdict — the caller
    // needs UNKNOWN and MISSING kept apart, because only one of them may close a session.
    test('returns the instances that did not come back PROVISIONED, each with its status', async () => {
        const inst1 = makeReservedInstance({id: 'i-ok'})
        const inst2 = makeReservedInstance({id: 'i-missing'})
        const inst3 = makeReservedInstance({id: 'i-unreachable'})

        const status = {'i-ok': 'PROVISIONED', 'i-missing': 'MISSING', 'i-unreachable': 'UNKNOWN'}
        const provisioner = {instanceStatus: jest.fn(inst => Promise.resolve(status[inst.id]))}

        const result = await findMissingInstances([inst1, inst2, inst3], {provisioner})

        expect(result).toHaveLength(2)
        expect(result.find(({instance}) => instance.id === 'i-missing').status).toBe('MISSING')
        expect(result.find(({instance}) => instance.id === 'i-unreachable').status).toBe('UNKNOWN')
        expect(result.some(({instance}) => instance.id === 'i-ok')).toBe(false)
    })

    test('returns empty array when all provisioned', async () => {
        const provisioner = {instanceStatus: jest.fn().mockResolvedValue('PROVISIONED')}
        const result = await findMissingInstances([makeInstance(), makeInstance({id: 'i-002'})], {provisioner})
        expect(result).toEqual([])
    })

    test('returns all instances when none provisioned', async () => {
        const provisioner = {instanceStatus: jest.fn().mockResolvedValue('MISSING')}
        const instances = [makeInstance({id: 'i-1'}), makeInstance({id: 'i-2'})]
        const result = await findMissingInstances(instances, {provisioner})
        expect(result).toHaveLength(2)
    })

    test('empty input returns empty array', async () => {
        const provisioner = {instanceStatus: jest.fn()}
        const result = await findMissingInstances([], {provisioner})
        expect(result).toEqual([])
        expect(provisioner.instanceStatus).not.toHaveBeenCalled()
    })
})

describe('instanceManager', () => {
    let createInstanceManager, events

    beforeAll(async () => {
        ;({createInstanceManager} = await import('./instanceManager.js'))
        events = await import('./events.js')
    })

    const makeManagerDeps = (overrides = {}) => ({
        claims: {
            all: jest.fn().mockResolvedValue([]),
            claim: jest.fn().mockResolvedValue(true),
            release: jest.fn().mockResolvedValue(true),
        },
        provider: {
            idleInstances: jest.fn().mockResolvedValue([]),
            launchReserved: jest.fn().mockResolvedValue(makeReservedInstance({id: 'i-mgr'})),
            reserve: jest.fn().mockResolvedValue(undefined),
            getInstance: jest.fn().mockResolvedValue(makeReservedInstance()),
            release: jest.fn().mockResolvedValue(undefined),
            terminate: jest.fn().mockResolvedValue(undefined),
            reservedInstances: jest.fn().mockResolvedValue([]),
            awaitHost: jest.fn(async instance => instance),
        },
        provisioner: {
            undeploy: jest.fn().mockResolvedValue(undefined),
            instanceStatus: jest.fn().mockResolvedValue('PROVISIONED'),
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
        expect(result).toHaveProperty('id', 'i-mgr')
        expect(result).toHaveProperty('host')
        expect(result).not.toHaveProperty('reservation')
        expect(result).not.toHaveProperty('launchTime')
        expect(result).not.toHaveProperty('running')
        expect(result).not.toHaveProperty('type')
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

        expect(deps.provider.launchReserved).toHaveBeenCalledWith(
            'T3aSmall',
            {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'}
        )
    })

    test('onInstanceActivated fires with {id, host} only (Java InstanceComponentAdapter parity)', async () => {
        const deps = makeManagerDeps()
        const manager = createInstanceManager(deps)

        const activated = []
        manager.onInstanceActivated(inst => activated.push(inst))

        const inst = makeReservedInstance({id: 'i-activated', host: 'host-act'})
        events.emitInstanceProvisioned(inst)

        // EventEmitter fires synchronously
        expect(activated).toHaveLength(1)
        expect(activated[0]).toEqual({id: 'i-activated', host: 'host-act'})
        expect(activated[0]).not.toHaveProperty('reservation')
        expect(activated[0]).not.toHaveProperty('launchTime')
    })

    test('onFailedToProvisionInstance fires with {id, host} and NO error arg (Java InstanceComponentAdapter parity)', async () => {
        const deps = makeManagerDeps()
        const manager = createInstanceManager(deps)

        const failures = []
        manager.onFailedToProvisionInstance(inst => failures.push(inst))

        const inst = makeReservedInstance({id: 'i-fail-mgr', host: 'host-fail'})
        const err = new Error('provision failed')
        events.emitFailedToProvisionInstance(inst, err)

        expect(failures).toHaveLength(1)
        expect(failures[0]).toEqual({id: 'i-fail-mgr', host: 'host-fail'})
        expect(failures[0]).not.toHaveProperty('reservation')
    })

    test('reclaimStaleClaims can undeploy — the manager passes the provisioner down', async () => {
        const instance = makeReservedInstance({id: 'i-abandoned', host: '1.2.3.4'})
        const deps = makeManagerDeps()
        deps.claims.all = jest.fn().mockResolvedValue([
            {instanceId: 'i-abandoned', sessionId: 's-dead', claimedAt: new Date(0)},
        ])
        deps.provider.idleInstances = jest.fn().mockResolvedValue([instance])
        deps.provider.getInstance = jest.fn().mockResolvedValue(instance)
        const mgr = createInstanceManager(deps)

        await mgr.reclaimStaleClaims([], 10 * 60 * 1000)

        expect(deps.provisioner.undeploy).toHaveBeenCalledTimes(1)
    })

    test('getInstanceTypes returns instanceTypes array', () => {
        const types = [{id: 'T3aSmall', idleCount: 1}]
        const manager = createInstanceManager(makeManagerDeps({instanceTypes: types}))
        expect(manager.getInstanceTypes()).toBe(types)
    })

    test('sessionsWithoutInstance returns the unconfirmed sessions with their status', async () => {
        const deps = makeManagerDeps()
        const status = {'i-ok': 'PROVISIONED', 'i-miss': 'MISSING', 'i-unreachable': 'UNKNOWN'}
        deps.provisioner.instanceStatus = jest.fn(inst => Promise.resolve(status[inst.id]))
        const manager = createInstanceManager(deps)

        const sessions = [
            {id: 's-ok', workerType: 'SANDBOX', instance: {id: 'i-ok', host: 'h'}},
            {id: 's-miss', workerType: 'SANDBOX', instance: {id: 'i-miss', host: 'h'}},
            {id: 's-unreachable', workerType: 'SANDBOX', instance: {id: 'i-unreachable', host: 'h'}},
        ]
        const result = await manager.sessionsWithoutInstance(sessions)
        expect(result).toHaveLength(2)
        expect(result.find(({session}) => session.id === 's-miss').status).toBe('MISSING')
        expect(result.find(({session}) => session.id === 's-unreachable').status).toBe('UNKNOWN')
    })

    test('releaseUnusedInstances passes usedInstanceIds from session.instance.id', async () => {
        const deps = makeManagerDeps()
        const manager = createInstanceManager(deps)
        await manager.releaseUnusedInstances(
            [{instance: {id: 'i-active'}}],
            5,
            'MINUTES'
        )
        expect(deps.provider.reservedInstances).toHaveBeenCalledTimes(1)
    })
})

// The end-to-end shape of a worker restart on local hosting: the provider's Map is gone, but the
// session row and the claim row are not. Restoring the instance is what lets the eventual close
// tear the container down instead of leaking it.
describe('surviving a worker restart', () => {
    let createWorkerInstanceComponent, createLocalInstanceProvider, instanceFromSession

    beforeAll(async () => {
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
        all: jest.fn(async () => [...rows].map(([instanceId, sessionId]) =>
            ({instanceId, sessionId, claimedAt: new Date('2026-01-01T00:00:00Z')}))),
        claim: jest.fn(async (instanceId, sessionId) => {
            if (rows.has(instanceId)) return false
            rows.set(instanceId, sessionId)
            return true
        }),
        release: jest.fn(async instanceId => rows.delete(instanceId)),
    })

    test('a restored instance is undeployed when its session finally closes', async () => {
        // A fresh provider and a fresh component, exactly as a restarted process would build
        // them — with the claim table and the session row carried over.
        const provider = createLocalInstanceProvider({tag: 'local'})
        const claims = claimTable(new Map([['i-1', 's-1']]))
        const provisioner = {undeploy: jest.fn(async () => {})}

        const component = createWorkerInstanceComponent({
            claims,
            provider,
            provisioner,
            instanceTypes: [],
            openSessionInstances: async () => [instanceFromSession(openSession)],
        })
        await component.start()

        await component.instanceManager.releaseInstance('i-1')
        component.stop()

        expect(provisioner.undeploy).toHaveBeenCalledTimes(1)
        expect(provisioner.undeploy.mock.calls[0][0].id).toBe('i-1')
    })
})
