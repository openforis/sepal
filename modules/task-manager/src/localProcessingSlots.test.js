import assert from 'node:assert/strict'
import {test} from 'node:test'

import {LocalProcessingSlots} from './localProcessingSlots.js'

const ALICE = {id: 't-1', username: 'alice'}
const ALICE_2 = {id: 't-2', username: 'alice'}
const BOB = {id: 't-3', username: 'bob'}
const NONE_HELD = new Map()

test('a free slot goes to the task that has waited longest', () => {
    const slots = new LocalProcessingSlots()
    slots.request({task: ALICE, free: 0, heldByUser: NONE_HELD, now: 0})
    slots.request({task: BOB, free: 0, heldByUser: NONE_HELD, now: 1000})

    assert.equal(
        slots.request({task: BOB, free: 1, heldByUser: NONE_HELD, now: 2000}),
        false
    )
    assert.equal(
        slots.request({task: ALICE, free: 1, heldByUser: NONE_HELD, now: 2000}),
        true
    )
})

test('a task of a user holding fewer slots goes before one that has waited longer', () => {
    const slots = new LocalProcessingSlots()
    slots.request({task: ALICE_2, free: 0, heldByUser: NONE_HELD, now: 0})
    const heldByUser = new Map([['alice', 1]])

    assert.equal(slots.request({task: BOB, free: 1, heldByUser, now: 1000}), true)
    assert.equal(slots.request({task: ALICE_2, free: 0, heldByUser, now: 1000}), false)
})

test('a granted task leaves the line', () => {
    const slots = new LocalProcessingSlots()
    slots.request({task: ALICE, free: 1, heldByUser: NONE_HELD, now: 0})

    assert.equal(
        slots.request({task: BOB, free: 1, heldByUser: NONE_HELD, now: 1000}),
        true
    )
})

test('a task that stopped asking for 30 seconds loses its place', () => {
    const slots = new LocalProcessingSlots()
    slots.request({task: ALICE, free: 0, heldByUser: NONE_HELD, now: 0})

    assert.equal(
        slots.request({task: BOB, free: 1, heldByUser: NONE_HELD, now: 30_001}),
        true
    )
})

test('a removed task loses its place', () => {
    const slots = new LocalProcessingSlots()
    slots.request({task: ALICE, free: 0, heldByUser: NONE_HELD, now: 0})

    slots.remove(ALICE.id)

    assert.equal(
        slots.request({task: BOB, free: 1, heldByUser: NONE_HELD, now: 1000}),
        true
    )
})

test('nobody is granted while more slots are held than allowed', () => {
    const slots = new LocalProcessingSlots()

    assert.equal(
        slots.request({task: ALICE, free: -1, heldByUser: NONE_HELD, now: 0}),
        false
    )
})

test('a refused task is waiting until it is granted', () => {
    const slots = new LocalProcessingSlots()
    assert.equal(slots.isWaiting(ALICE.id), false)

    slots.request({task: ALICE, free: 0, heldByUser: NONE_HELD, now: 0})
    assert.equal(slots.isWaiting(ALICE.id), true)

    slots.request({task: ALICE, free: 1, heldByUser: NONE_HELD, now: 1000})
    assert.equal(slots.isWaiting(ALICE.id), false)
})
