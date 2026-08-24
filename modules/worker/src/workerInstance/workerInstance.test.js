import {createWorkerInstance, isIdle, isReserved, release, reserve} from './workerInstance.js'

describe('createWorkerInstance', () => {
    test('creates an instance with all required fields', () => {
        const now = new Date()
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'host.docker.internal', launchTime: now})
        expect(inst.id).toBe('i-001')
        expect(inst.type).toBe('T3aSmall')
        expect(inst.host).toBe('host.docker.internal')
        expect(inst.launchTime).toBe(now)
        expect(inst.running).toBe(true)        // default
        expect(inst.reservation).toBeNull()    // default = null (idle)
    })

    test('running defaults to true', () => {
        const inst = createWorkerInstance({id: 'i-002', type: 'T3aSmall', host: 'h'})
        expect(inst.running).toBe(true)
    })

    test('reservation defaults to null', () => {
        const inst = createWorkerInstance({id: 'i-003', type: 'T3aSmall', host: 'h'})
        expect(inst.reservation).toBeNull()
    })

    test('accepts explicit reservation', () => {
        const res = {username: 'alice', workerType: 'SANDBOX'}
        const inst = createWorkerInstance({id: 'i-004', type: 'T3aSmall', host: 'h', reservation: res})
        expect(inst.reservation).toBe(res)
    })
})

describe('isReserved', () => {
    test('returns false when reservation is null', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h'})
        expect(isReserved(inst)).toBe(false)
    })

    test('returns true when reservation is set', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h', reservation: {username: 'alice', workerType: 'SANDBOX'}})
        expect(isReserved(inst)).toBe(true)
    })
})

describe('isIdle', () => {
    test('returns true when reservation is null', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h'})
        expect(isIdle(inst)).toBe(true)
    })

    test('returns false when reservation is set', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h', reservation: {username: 'alice', workerType: 'SANDBOX'}})
        expect(isIdle(inst)).toBe(false)
    })

    test('isIdle is the complement of isReserved', () => {
        const idle = createWorkerInstance({id: 'i-001', type: 'T', host: 'h'})
        const reserved = createWorkerInstance({id: 'i-002', type: 'T', host: 'h', reservation: {username: 'bob', workerType: 'SANDBOX'}})
        expect(isIdle(idle)).toBe(!isReserved(idle))
        expect(isIdle(reserved)).toBe(!isReserved(reserved))
    })
})

describe('reserve', () => {
    test('returns a new object with the reservation set', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h'})
        const res = {username: 'alice', workerType: 'SANDBOX'}
        const reserved = reserve(inst, res)
        expect(reserved).not.toBe(inst)          // new object (immutable pattern)
        expect(reserved.reservation).toBe(res)
    })

    test('preserves all other fields', () => {
        const now = new Date()
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'myhost', running: false, launchTime: now})
        const reserved = reserve(inst, {username: 'bob', workerType: 'TASK_EXECUTOR'})
        expect(reserved.id).toBe('i-001')
        expect(reserved.type).toBe('T3aSmall')
        expect(reserved.host).toBe('myhost')
        expect(reserved.running).toBe(false)
        expect(reserved.launchTime).toBe(now)
    })

    test('does not mutate the original instance', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T', host: 'h'})
        reserve(inst, {username: 'x', workerType: 'SANDBOX'})
        expect(inst.reservation).toBeNull()
    })
})

describe('release', () => {
    test('returns a new object with reservation cleared to null', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h', reservation: {username: 'alice', workerType: 'SANDBOX'}})
        const released = release(inst)
        expect(released).not.toBe(inst)          // new object (immutable pattern)
        expect(released.reservation).toBeNull()
    })

    test('preserves all other fields', () => {
        const now = new Date()
        const inst = createWorkerInstance({id: 'i-002', type: 'M6aLarge', host: 'srv', running: true, launchTime: now, reservation: {username: 'bob', workerType: 'TASK_EXECUTOR'}})
        const released = release(inst)
        expect(released.id).toBe('i-002')
        expect(released.type).toBe('M6aLarge')
        expect(released.host).toBe('srv')
        expect(released.running).toBe(true)
        expect(released.launchTime).toBe(now)
    })

    test('does not mutate the original instance', () => {
        const res = {username: 'alice', workerType: 'SANDBOX'}
        const inst = createWorkerInstance({id: 'i-001', type: 'T', host: 'h', reservation: res})
        release(inst)
        expect(inst.reservation).toBe(res)
    })

    test('isIdle is true after release', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T', host: 'h', reservation: {username: 'x', workerType: 'SANDBOX'}})
        expect(isIdle(release(inst))).toBe(true)
    })
})
