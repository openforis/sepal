import assert from 'node:assert/strict'
import {mock, test} from 'node:test'

import {createEnforcement} from './enforcement.js'

test('publishes Exceeded for over-budget users and Cleared for the rest, every cycle', async () => {
    const budgetManager = {usersExceedingBudget: mock.fn(async () => ['over'])}
    const userClient = {eachUsername: async fn => { await fn('over'); await fn('ok') }}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, userClient, events})
    await enforcement.publishVerdicts()
    await enforcement.publishVerdicts() // level-triggered: re-publishes each cycle

    assert.deepEqual(events.emitted, [['x', 'over'], ['c', 'ok'], ['x', 'over'], ['c', 'ok']])
    assert.equal(budgetManager.usersExceedingBudget.mock.callCount(), 2)
})

test('recomputes the exceeded set fresh each cycle (no cached/edge-triggered state)', async () => {
    let usersOverBudget = ['alice']
    const budgetManager = {usersExceedingBudget: async () => usersOverBudget}
    const userClient = {eachUsername: async fn => { await fn('alice'); await fn('bob') }}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, userClient, events})
    await enforcement.publishVerdicts()
    usersOverBudget = ['bob'] // alice clears, bob goes over — between cycles
    await enforcement.publishVerdicts()

    assert.deepEqual(events.emitted, [
        ['x', 'alice'], ['c', 'bob'],
        ['c', 'alice'], ['x', 'bob'],
    ])
})

test('iterates every user known to userClient, not just the exceeded ones', async () => {
    const budgetManager = {usersExceedingBudget: async () => []}
    const userClient = {eachUsername: async fn => { await fn('a'); await fn('b'); await fn('c') }}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, userClient, events})
    await enforcement.publishVerdicts()

    assert.deepEqual(events.emitted, [['c', 'a'], ['c', 'b'], ['c', 'c']])
})

test('publishes the live verdict for each user with an open session', async () => {
    const budgetManager = {verdict: async username => ({username, exceeded: username === 'over'})}
    const openSessionUse = {usersWithOpenSessions: async () => ['over', 'ok']}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, openSessionUse, events})
    await enforcement.publishOpenSessionVerdicts()

    assert.deepEqual(events.emitted, [['x', 'over'], ['c', 'ok']])
})

test('leaves users without open sessions to the hourly pass', async () => {
    const budgetManager = {verdict: async username => ({username, exceeded: true})}
    const openSessionUse = {usersWithOpenSessions: async () => []}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, openSessionUse, events})
    await enforcement.publishOpenSessionVerdicts()

    assert.deepEqual(events.emitted, [])
})

const createEvents = () => {
    const emitted = []
    return {
        emitted,
        emitUserBudgetExceeded: username => emitted.push(['x', username]),
        emitUserBudgetCleared: username => emitted.push(['c', username]),
    }
}
