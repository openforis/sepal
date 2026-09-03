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

    const makeRepo = (overrides = {}) => ({
        idleInstances: jest.fn().mockResolvedValue([]),
        reserved: jest.fn().mockResolvedValue(true),
        launched: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    })

    const makeProvider = (overrides = {}) => ({
        idleInstances: jest.fn().mockResolvedValue([]),
        launchReserved: jest.fn().mockResolvedValue(makeReservedInstance({id: 'i-new'})),
        reserve: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    })

    test('no-idle path: calls launchReserved → repo.launched → emits InstanceLaunched', async () => {
        const launched = []
        events.instanceLaunched$.subscribe(v => launched.push(v))

        const repo = makeRepo({idleInstances: jest.fn().mockResolvedValue([])})
        const provider = makeProvider({idleInstances: jest.fn().mockResolvedValue([])})

        const result = await requestInstance(
            {workerType: 'SANDBOX', instanceType: 'T3aSmall', username: 'alice'},
            {repo, provider}
        )

        expect(provider.launchReserved).toHaveBeenCalledTimes(1)
        expect(repo.launched).toHaveBeenCalledTimes(1)
        expect(launched.length).toBeGreaterThanOrEqual(1)
        const payload = launched[launched.length - 1]
        expect(payload).toHaveProperty('instance')
        expect(result.id).toBe('i-new')
    })

    // The container is named after the session's two-word name, so the reservation is what carries
    // the session id from the session layer down to the provisioner. Dropping it here renames
    // nothing — it makes the container unnameable.
    test('launch path: puts the session id on the reservation', async () => {
        const repo = makeRepo()
        const provider = makeProvider()

        await requestInstance(
            {workerType: 'SANDBOX', instanceType: 'T3aSmall', username: 'alice', sessionId: 's-42'},
            {repo, provider}
        )

        expect(provider.launchReserved).toHaveBeenCalledWith(
            'T3aSmall',
            {username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'}
        )
    })

    test('idle-reserve path: puts the session id on the reservation', async () => {
        const idle = makeInstance({id: 'i-idle'})
        const repo = makeRepo({
            idleInstances: jest.fn().mockResolvedValue(['i-idle']),
            reserved: jest.fn().mockResolvedValue(true),
        })
        const provider = makeProvider({idleInstances: jest.fn().mockResolvedValue([idle])})

        await requestInstance(
            {workerType: 'SANDBOX', instanceType: 'T3aSmall', username: 'alice', sessionId: 's-42'},
            {repo, provider}
        )

        const [reservedInstance] = provider.reserve.mock.calls[0]
        expect(reservedInstance.reservation)
            .toEqual({username: 'alice', workerType: 'SANDBOX', sessionId: 's-42'})
    })

    test('idle-reserve path: finds common idle → repo.reserved → provider.reserve → emits InstancePendingProvisioning', async () => {
        const pendingPayloads = []
        events.instancePendingProvisioning$.subscribe(v => pendingPayloads.push(v))

        const idle = makeInstance({id: 'i-idle'})
        const repo = makeRepo({
            idleInstances: jest.fn().mockResolvedValue(['i-idle']),
            reserved: jest.fn().mockResolvedValue(true),
        })
        const provider = makeProvider({
            idleInstances: jest.fn().mockResolvedValue([idle]),
        })

        const result = await requestInstance(
            {workerType: 'SANDBOX', instanceType: 'T3aSmall', username: 'alice'},
            {repo, provider}
        )

        expect(repo.reserved).toHaveBeenCalledWith('i-idle', 'SANDBOX')
        expect(provider.reserve).toHaveBeenCalledTimes(1)
        expect(provider.launchReserved).not.toHaveBeenCalled()
        expect(result.id).toBe('i-idle')
        expect(pendingPayloads.length).toBeGreaterThanOrEqual(1)
    })

    test('race-loss on first idle: goes straight to launchReserved (Java: no retry of remaining idle)', async () => {
        // Only ONE idle candidate is tried: on race loss (reserved()=false) it goes straight to
        // launchInstance without examining any remaining idle instances.
        const launched = []
        events.instanceLaunched$.subscribe(v => launched.push(v))

        const idle1 = makeInstance({id: 'i-raced-1'})
        const idle2 = makeInstance({id: 'i-raced-2'}) // present but must NOT be tried
        const newInst = makeReservedInstance({id: 'i-fresh'})
        const repo = makeRepo({
            idleInstances: jest.fn().mockResolvedValue(['i-raced-1', 'i-raced-2']),
            reserved: jest.fn().mockResolvedValue(false), // race lost on first attempt
            launched: jest.fn().mockResolvedValue(undefined),
        })
        const provider = makeProvider({
            idleInstances: jest.fn().mockResolvedValue([idle1, idle2]),
            launchReserved: jest.fn().mockResolvedValue(newInst),
        })

        const result = await requestInstance(
            {workerType: 'SANDBOX', instanceType: 'T3aSmall', username: 'alice'},
            {repo, provider}
        )

        expect(repo.reserved).toHaveBeenCalledTimes(1)
        expect(repo.reserved).toHaveBeenCalledWith('i-raced-1', 'SANDBOX')
        expect(provider.launchReserved).toHaveBeenCalledTimes(1)
        expect(repo.launched).toHaveBeenCalledTimes(1)
        expect(result.id).toBe('i-fresh')
        expect(launched.length).toBeGreaterThanOrEqual(1)
    })

    test('on exception: emits FailedToRequestInstance and rethrows', async () => {
        const failed = []
        events.failedToRequestInstance$.subscribe(v => failed.push(v))

        const repo = makeRepo({
            idleInstances: jest.fn().mockRejectedValue(new Error('db down')),
        })
        const provider = makeProvider()

        await expect(
            requestInstance({workerType: 'SANDBOX', instanceType: 'T3aSmall', username: 'alice'}, {repo, provider})
        ).rejects.toThrow('db down')

        expect(failed.length).toBeGreaterThanOrEqual(1)
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

    const makeDeps = (overrides = {}) => ({
        repo: {
            released: jest.fn().mockResolvedValue(true),
            terminated: jest.fn().mockResolvedValue(undefined),
        },
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

        expect(deps.repo.released).not.toHaveBeenCalled()
        expect(deps.provisioner.undeploy).not.toHaveBeenCalled()
        expect(released).toHaveLength(0)
    })

    test('race (repo.released returns false): skips undeploy but still calls provider.release and emits InstanceReleased', async () => {
        // raceCondition=true skips undeploy but still falls through to provider.release(instanceId)
        // and the InstanceReleased event.
        const released = []
        events.instanceReleased$.subscribe(v => released.push(v))

        const deps = makeDeps()
        deps.repo.released = jest.fn().mockResolvedValue(false)

        await releaseInstance('i-raced', deps)

        expect(deps.provisioner.undeploy).not.toHaveBeenCalled()
        expect(deps.provider.release).toHaveBeenCalledWith('i-raced')
        expect(released.length).toBeGreaterThanOrEqual(1)
        const payload = released[released.length - 1]
        expect(payload.instance).toBeDefined()
    })

    test('failure path: emits FailedToReleaseInstance, calls terminate + repo.terminated', async () => {
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
        expect(deps.repo.terminated).toHaveBeenCalledWith('i-fail')
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

    const makeRepoAndProvider = ({idleInstances = [], launchResult = [makeInstance({id: 'i-new'})]} = {}) => ({
        repo: {
            launched: jest.fn().mockResolvedValue(undefined),
            terminated: jest.fn().mockResolvedValue(undefined),
        },
        provider: {
            idleInstances: jest.fn().mockResolvedValue(idleInstances),
            launchIdle: jest.fn().mockResolvedValue(launchResult),
            terminate: jest.fn().mockResolvedValue(undefined),
        },
    })

    test('current < target: calls launchIdle with deficit count + repo.launched', async () => {
        const {repo, provider} = makeRepoAndProvider({idleInstances: []})
        await sizeIdlePool({'T3aSmall': 2}, {repo, provider})

        expect(provider.launchIdle).toHaveBeenCalledWith('T3aSmall', 2)
        expect(repo.launched).toHaveBeenCalledTimes(1)
        expect(provider.terminate).not.toHaveBeenCalled()
    })

    test('current > target: terminates surplus (first N)', async () => {
        const surplus = [
            makeInstance({id: 'i-a', type: 'T3aSmall'}),
            makeInstance({id: 'i-b', type: 'T3aSmall'}),
            makeInstance({id: 'i-c', type: 'T3aSmall'}),
        ]
        const {repo, provider} = makeRepoAndProvider({idleInstances: surplus})
        await sizeIdlePool({'T3aSmall': 1}, {repo, provider})

        expect(provider.terminate).toHaveBeenCalledTimes(2)
        expect(repo.terminated).toHaveBeenCalledTimes(2)
        expect(provider.launchIdle).not.toHaveBeenCalled()
    })

    test('current == target: no-op', async () => {
        const idle = [makeInstance({id: 'i-x', type: 'T3aSmall'})]
        const {repo, provider} = makeRepoAndProvider({idleInstances: idle})
        await sizeIdlePool({'T3aSmall': 1}, {repo, provider})

        expect(provider.launchIdle).not.toHaveBeenCalled()
        expect(provider.terminate).not.toHaveBeenCalled()
    })

    test('multiple types: launches for under-target, terminates for over-target', async () => {
        const idleInstances = [
            makeInstance({id: 'i-big-1', type: 'C5aXlarge'}),
            makeInstance({id: 'i-big-2', type: 'C5aXlarge'}),
            makeInstance({id: 'i-big-3', type: 'C5aXlarge'}),
        ]
        const {repo, provider} = makeRepoAndProvider({idleInstances})
        await sizeIdlePool({'T3aSmall': 1, 'C5aXlarge': 1}, {repo, provider})

        expect(provider.launchIdle).toHaveBeenCalledWith('T3aSmall', 1)
        expect(provider.terminate).toHaveBeenCalledTimes(2)
    })

    test('accepts Map instead of plain object', async () => {
        const {repo, provider} = makeRepoAndProvider({idleInstances: []})
        await sizeIdlePool(new Map([['T3aSmall', 1]]), {repo, provider})
        expect(provider.launchIdle).toHaveBeenCalledWith('T3aSmall', 1)
    })

    test('terminates all idle instances of types NOT in the target map (non-target type → target=0)', async () => {
        // A type with idle instances but no entry in the target map gets target=0, so all of its idle
        // instances are terminated.
        const nonTargetInstances = [
            makeInstance({id: 'i-extra-1', type: 'C5aXlarge'}),
            makeInstance({id: 'i-extra-2', type: 'C5aXlarge'}),
        ]
        const {repo, provider} = makeRepoAndProvider({idleInstances: nonTargetInstances})
        await sizeIdlePool({'T3aSmall': 1}, {repo, provider})

        expect(provider.launchIdle).toHaveBeenCalledWith('T3aSmall', 1)
        expect(provider.terminate).toHaveBeenCalledTimes(2)
        expect(repo.terminated).toHaveBeenCalledTimes(2)
        const terminatedIds = provider.terminate.mock.calls.map(c => c[0])
        expect(terminatedIds).toContain('i-extra-1')
        expect(terminatedIds).toContain('i-extra-2')
    })
})

describe('releaseUnusedInstances', () => {
    let releaseUnusedInstances

    beforeAll(async () => {
        ;({releaseUnusedInstances} = await import('./command/releaseUnusedInstances.js'))
    })

    const OLD_TIME = new Date(Date.now() - 20 * 60 * 1000) // 20 min ago
    const NEW_TIME = new Date(Date.now() - 30 * 1000)      // 30 sec ago

    const makeFullDeps = reservedInstances => ({
        repo: {
            released: jest.fn().mockResolvedValue(true),
            terminated: jest.fn().mockResolvedValue(undefined),
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
        repo: {
            idleInstances: jest.fn().mockResolvedValue([]),
            reserved: jest.fn().mockResolvedValue(true),
            launched: jest.fn().mockResolvedValue(undefined),
            released: jest.fn().mockResolvedValue(true),
            terminated: jest.fn().mockResolvedValue(undefined),
        },
        provider: {
            idleInstances: jest.fn().mockResolvedValue([]),
            launchReserved: jest.fn().mockResolvedValue(makeReservedInstance({id: 'i-mgr'})),
            reserve: jest.fn().mockResolvedValue(undefined),
            getInstance: jest.fn().mockResolvedValue(makeReservedInstance()),
            release: jest.fn().mockResolvedValue(undefined),
            terminate: jest.fn().mockResolvedValue(undefined),
            reservedInstances: jest.fn().mockResolvedValue([]),
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
