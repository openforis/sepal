import {createLocalInstanceProvider, LOCAL_HOST} from './localInstanceProvider.js'

const INSTANCE_TYPE = {id: 'T3aSmall', name: 't3a.small', tag: 't1', cpuCount: 1, ramGiB: 2, hourlyCost: 0.0204}

const RESERVATION = {username: 'alice', workerType: 'SANDBOX'}

test('LOCAL_HOST is host.docker.internal', () => {
    expect(LOCAL_HOST).toBe('host.docker.internal')
})

describe('launchIdle', () => {
    test('returns an array containing exactly 1 instance regardless of count', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const result = provider.launchIdle('T3aSmall', 5)
        expect(result).toHaveLength(1)
    })

    test('always launches 1 even when count=0', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const result = provider.launchIdle('T3aSmall', 0)
        expect(result).toHaveLength(1)
    })

    test('launched instance has correct fields', () => {
        const before = new Date()
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const [inst] = provider.launchIdle('T3aSmall', 1)
        expect(inst.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(inst.type).toBe('T3aSmall')
        // host is a per-instance network alias on the shared dev daemon; the daemon
        // itself is addressed via daemonHost (multi-instance isolation on one host)
        expect(inst.host).toBe(inst.id)
        expect(inst.daemonHost).toBe(LOCAL_HOST)
        expect(inst.running).toBe(true)
        expect(inst.launchTime).toBeInstanceOf(Date)
        expect(inst.launchTime.getTime()).toBeGreaterThanOrEqual(before.getTime())
        expect(inst.reservation).toBeNull()
    })

    test('instance appears in idleInstances after launchIdle', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const [inst] = provider.launchIdle('T3aSmall', 1)
        const idle = provider.idleInstances('T3aSmall')
        expect(idle).toHaveLength(1)
        expect(idle[0].id).toBe(inst.id)
    })

    test('multiple launchIdle calls each create a distinct instance', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const [a] = provider.launchIdle('T3aSmall', 1)
        const [b] = provider.launchIdle('T3aSmall', 1)
        expect(a.id).not.toBe(b.id)
        expect(provider.idleInstances('T3aSmall')).toHaveLength(2)
    })
})

describe('launchReserved', () => {
    test('returns a single reserved instance', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const inst = provider.launchReserved('T3aSmall', RESERVATION)
        expect(inst.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(inst.type).toBe('T3aSmall')
        expect(inst.host).toBe(inst.id) // per-instance alias — see launchIdle test
        expect(inst.daemonHost).toBe(LOCAL_HOST)
        expect(inst.running).toBe(true)
        expect(inst.reservation).toEqual(RESERVATION)
    })

    test('launchReserved instance appears in reservedInstances', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const inst = provider.launchReserved('T3aSmall', RESERVATION)
        const reserved = provider.reservedInstances()
        expect(reserved).toHaveLength(1)
        expect(reserved[0].id).toBe(inst.id)
    })

    test('launchReserved instance does NOT appear in idleInstances', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        provider.launchReserved('T3aSmall', RESERVATION)
        expect(provider.idleInstances('T3aSmall')).toHaveLength(0)
    })
})

describe('reserve', () => {
    test('reserve moves instance from idle to reserved', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const [inst] = provider.launchIdle('T3aSmall', 1)
        const reservedInst = {...inst, reservation: RESERVATION}
        provider.reserve(reservedInst)
        expect(provider.idleInstances('T3aSmall')).toHaveLength(0)
        const reserved = provider.reservedInstances()
        expect(reserved).toHaveLength(1)
        expect(reserved[0].reservation).toEqual(RESERVATION)
    })
})

describe('release', () => {
    test('release clears reservation and instance becomes idle', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const inst = provider.launchReserved('T3aSmall', RESERVATION)
        provider.release(inst.id)
        expect(provider.reservedInstances()).toHaveLength(0)
        const idle = provider.idleInstances('T3aSmall')
        expect(idle).toHaveLength(1)
        expect(idle[0].id).toBe(inst.id)
        expect(idle[0].reservation).toBeNull()
    })

    test('release on non-existent id is a no-op (no error)', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        expect(() => provider.release('no-such-id')).not.toThrow()
    })
})

describe('terminate', () => {
    test('terminate removes instance from idle pool', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const [inst] = provider.launchIdle('T3aSmall', 1)
        provider.terminate(inst.id)
        expect(provider.idleInstances('T3aSmall')).toHaveLength(0)
        expect(provider.getInstance(inst.id)).toBeNull()
    })

    test('terminate removes instance from reserved pool', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const inst = provider.launchReserved('T3aSmall', RESERVATION)
        provider.terminate(inst.id)
        expect(provider.reservedInstances()).toHaveLength(0)
        expect(provider.getInstance(inst.id)).toBeNull()
    })

    test('terminate on non-existent id is a no-op', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        expect(() => provider.terminate('no-such-id')).not.toThrow()
    })
})

describe('getInstance', () => {
    test('returns the instance by id', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const [inst] = provider.launchIdle('T3aSmall', 1)
        const found = provider.getInstance(inst.id)
        expect(found).not.toBeNull()
        expect(found.id).toBe(inst.id)
    })

    test('returns null for unknown id', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        expect(provider.getInstance('unknown-id')).toBeNull()
    })
})

describe('idleInstances', () => {
    test('idleInstances(type) returns all idle instances (Groovy quirk: type arg is ignored)', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        provider.launchIdle('T3aSmall', 1)
        provider.launchIdle('M6aLarge', 1)  // different type, but still idle
        const idle = provider.idleInstances('T3aSmall')
        expect(idle).toHaveLength(2)
    })

    test('idleInstances() with no arg returns only idle instances, not reserved', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const [idle] = provider.launchIdle('T3aSmall', 1)
        provider.launchReserved('T3aSmall', RESERVATION)
        // idleInstances() must return ONLY idle instances: including reserved ones makes sizeIdlePool
        // terminate them as pool surplus.
        const result = provider.idleInstances()
        expect(result.map(({id}) => id)).toEqual([idle.id])
    })

    test('idleInstances(type) excludes reserved instances', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        provider.launchIdle('T3aSmall', 1)
        provider.launchReserved('T3aSmall', RESERVATION)
        const idle = provider.idleInstances('T3aSmall')
        expect(idle).toHaveLength(1)
        expect(idle[0].reservation).toBeNull()
    })

    test('empty when no instances launched', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        expect(provider.idleInstances('T3aSmall')).toHaveLength(0)
        expect(provider.idleInstances()).toHaveLength(0)
    })
})

describe('reservedInstances', () => {
    test('returns only reserved instances', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        provider.launchIdle('T3aSmall', 1)
        const res = provider.launchReserved('T3aSmall', RESERVATION)
        const reserved = provider.reservedInstances()
        expect(reserved).toHaveLength(1)
        expect(reserved[0].id).toBe(res.id)
    })

    test('empty when no instances are reserved', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        provider.launchIdle('T3aSmall', 1)
        expect(provider.reservedInstances()).toHaveLength(0)
    })
})

describe('onInstanceLaunched', () => {
    test('callback fires asynchronously after launchIdle', async () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const received = []
        provider.onInstanceLaunched(inst => received.push(inst))
        const [inst] = provider.launchIdle('T3aSmall', 1)
        expect(received).toHaveLength(0)
        await new Promise(resolve => setImmediate(resolve))
        expect(received).toHaveLength(1)
        expect(received[0].id).toBe(inst.id)
    })

    test('callback fires after launchReserved', async () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const received = []
        provider.onInstanceLaunched(inst => received.push(inst))
        const inst = provider.launchReserved('T3aSmall', RESERVATION)
        await new Promise(resolve => setImmediate(resolve))
        expect(received).toHaveLength(1)
        expect(received[0].id).toBe(inst.id)
    })

    test('multiple listeners all receive the callback', async () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const a = [], b = []
        provider.onInstanceLaunched(inst => a.push(inst))
        provider.onInstanceLaunched(inst => b.push(inst))
        provider.launchIdle('T3aSmall', 1)
        await new Promise(resolve => setImmediate(resolve))
        expect(a).toHaveLength(1)
        expect(b).toHaveLength(1)
    })

    test('no callback for reserve (only launches trigger it)', async () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        const [inst] = provider.launchIdle('T3aSmall', 1)
        await new Promise(resolve => setImmediate(resolve))  // drain launch callback
        const received = []
        provider.onInstanceLaunched(i => received.push(i))
        const reservedInst = {...inst, reservation: RESERVATION}
        provider.reserve(reservedInst)
        await new Promise(resolve => setImmediate(resolve))
        expect(received).toHaveLength(0)
    })
})

describe('full lifecycle: launchIdle → reserve → release → terminate', () => {
    test('complete instance lifecycle', async () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)

        const [inst] = provider.launchIdle('T3aSmall', 1)
        expect(provider.idleInstances('T3aSmall')).toHaveLength(1)
        expect(provider.reservedInstances()).toHaveLength(0)

        const reservedInst = {...inst, reservation: RESERVATION}
        provider.reserve(reservedInst)
        expect(provider.idleInstances('T3aSmall')).toHaveLength(0)
        expect(provider.reservedInstances()).toHaveLength(1)

        provider.release(inst.id)
        expect(provider.idleInstances('T3aSmall')).toHaveLength(1)
        expect(provider.reservedInstances()).toHaveLength(0)

        provider.terminate(inst.id)
        expect(provider.idleInstances('T3aSmall')).toHaveLength(0)
        expect(provider.getInstance(inst.id)).toBeNull()
    })
})

describe('start/stop', () => {
    test('start is a no-op (does not throw)', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        expect(() => provider.start()).not.toThrow()
    })

    test('stop is a no-op (does not throw)', () => {
        const provider = createLocalInstanceProvider(INSTANCE_TYPE)
        expect(() => provider.stop()).not.toThrow()
    })
})

describe('createHostingService integration', () => {
    test('createHostingService(local) returns an instanceProvider with expected methods', async () => {
        const {createHostingService} = await import('../index.js')
        const svc = createHostingService({hostingService: 'local'})
        expect(svc.instanceProvider).not.toBeNull()
        expect(typeof svc.instanceProvider.launchIdle).toBe('function')
        expect(typeof svc.instanceProvider.launchReserved).toBe('function')
        expect(typeof svc.instanceProvider.terminate).toBe('function')
        expect(typeof svc.instanceProvider.reserve).toBe('function')
        expect(typeof svc.instanceProvider.release).toBe('function')
        expect(typeof svc.instanceProvider.idleInstances).toBe('function')
        expect(typeof svc.instanceProvider.reservedInstances).toBe('function')
        expect(typeof svc.instanceProvider.getInstance).toBe('function')
        expect(typeof svc.instanceProvider.onInstanceLaunched).toBe('function')
        expect(typeof svc.instanceProvider.start).toBe('function')
        expect(typeof svc.instanceProvider.stop).toBe('function')
    })

    test('createHostingService(aws) instanceProvider is not null (Task 4 implemented)', async () => {
        const {createHostingService} = await import('../index.js')
        const svc = createHostingService({
            hostingService: 'aws',
            sepalVersion: '1.0.0',
            region: 'eu-central-1',
            availabilityZone: 'eu-central-1a',
            environment: 'test',
            accessKey: 'test-key',
            secretKey: 'test-secret',
        })
        expect(svc.instanceProvider).not.toBeNull()
        expect(typeof svc.instanceProvider.launchIdle).toBe('function')
    })
})
