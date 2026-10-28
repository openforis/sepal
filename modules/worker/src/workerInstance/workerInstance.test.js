import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {createWorkerInstance, isIdle, isReserved, release, reserve} from './workerInstance.js'

describe('createWorkerInstance', () => {
    test('creates an instance with all required fields', () => {
        const now = new Date()
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'host.docker.internal', launchTime: now})
        assert.equal(inst.id, 'i-001')
        assert.equal(inst.type, 'T3aSmall')
        assert.equal(inst.host, 'host.docker.internal')
        assert.equal(inst.launchTime, now)
        assert.equal(inst.running, true)        // default
        assert.equal(inst.reservation, null)    // default = null (idle)
    })

    test('running defaults to true', () => {
        const inst = createWorkerInstance({id: 'i-002', type: 'T3aSmall', host: 'h'})
        assert.equal(inst.running, true)
    })

    test('reservation defaults to null', () => {
        const inst = createWorkerInstance({id: 'i-003', type: 'T3aSmall', host: 'h'})
        assert.equal(inst.reservation, null)
    })

    test('accepts explicit reservation', () => {
        const res = {username: 'alice', workerType: 'SANDBOX'}
        const inst = createWorkerInstance({id: 'i-004', type: 'T3aSmall', host: 'h', reservation: res})
        assert.equal(inst.reservation, res)
    })
})

describe('isReserved', () => {
    test('returns false when reservation is null', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h'})
        assert.equal(isReserved(inst), false)
    })

    test('returns true when reservation is set', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h', reservation: {username: 'alice', workerType: 'SANDBOX'}})
        assert.equal(isReserved(inst), true)
    })
})

describe('isIdle', () => {
    test('returns true when reservation is null', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h'})
        assert.equal(isIdle(inst), true)
    })

    test('returns false when reservation is set', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h', reservation: {username: 'alice', workerType: 'SANDBOX'}})
        assert.equal(isIdle(inst), false)
    })

    test('isIdle is the complement of isReserved', () => {
        const idle = createWorkerInstance({id: 'i-001', type: 'T', host: 'h'})
        const reserved = createWorkerInstance({id: 'i-002', type: 'T', host: 'h', reservation: {username: 'bob', workerType: 'SANDBOX'}})
        assert.equal(isIdle(idle), !isReserved(idle))
        assert.equal(isIdle(reserved), !isReserved(reserved))
    })
})

describe('reserve', () => {
    test('returns a new object with the reservation set', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h'})
        const res = {username: 'alice', workerType: 'SANDBOX'}
        const reserved = reserve(inst, res)
        assert.notEqual(reserved, inst)          // new object (immutable pattern)
        assert.equal(reserved.reservation, res)
    })

    test('preserves all other fields', () => {
        const now = new Date()
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'myhost', running: false, launchTime: now})
        const reserved = reserve(inst, {username: 'bob', workerType: 'sandbox'})
        assert.equal(reserved.id, 'i-001')
        assert.equal(reserved.type, 'T3aSmall')
        assert.equal(reserved.host, 'myhost')
        assert.equal(reserved.running, false)
        assert.equal(reserved.launchTime, now)
    })

    test('does not mutate the original instance', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T', host: 'h'})
        reserve(inst, {username: 'x', workerType: 'SANDBOX'})
        assert.equal(inst.reservation, null)
    })
})

describe('release', () => {
    test('returns a new object with reservation cleared to null', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T3aSmall', host: 'h', reservation: {username: 'alice', workerType: 'SANDBOX'}})
        const released = release(inst)
        assert.notEqual(released, inst)          // new object (immutable pattern)
        assert.equal(released.reservation, null)
    })

    test('preserves all other fields', () => {
        const now = new Date()
        const inst = createWorkerInstance({id: 'i-002', type: 'M6aLarge', host: 'srv', running: true, launchTime: now, reservation: {username: 'bob', workerType: 'sandbox'}})
        const released = release(inst)
        assert.equal(released.id, 'i-002')
        assert.equal(released.type, 'M6aLarge')
        assert.equal(released.host, 'srv')
        assert.equal(released.running, true)
        assert.equal(released.launchTime, now)
    })

    test('does not mutate the original instance', () => {
        const res = {username: 'alice', workerType: 'SANDBOX'}
        const inst = createWorkerInstance({id: 'i-001', type: 'T', host: 'h', reservation: res})
        release(inst)
        assert.equal(inst.reservation, res)
    })

    test('isIdle is true after release', () => {
        const inst = createWorkerInstance({id: 'i-001', type: 'T', host: 'h', reservation: {username: 'x', workerType: 'SANDBOX'}})
        assert.equal(isIdle(release(inst)), true)
    })
})
