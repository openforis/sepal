import {jest} from '@jest/globals'

import {createEnforcement} from './enforcement.js'

const createEvents = () => {
    const emitted = []
    return {
        emitted,
        emitUserBudgetExceeded: username => emitted.push(['x', username]),
        emitUserBudgetCleared: username => emitted.push(['c', username]),
    }
}

test('publishes Exceeded for over-budget users and Cleared for the rest, every cycle', async () => {
    const budgetManager = {usersExceedingBudget: jest.fn(async () => ['over'])}
    const userClient = {eachUsername: async fn => { await fn('over'); await fn('ok') }}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, userClient, events})
    await enforcement.publishVerdicts()
    await enforcement.publishVerdicts() // level-triggered: re-publishes each cycle

    expect(events.emitted).toEqual([['x', 'over'], ['c', 'ok'], ['x', 'over'], ['c', 'ok']])
    expect(budgetManager.usersExceedingBudget).toHaveBeenCalledTimes(2)
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

    expect(events.emitted).toEqual([
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

    expect(events.emitted).toEqual([['c', 'a'], ['c', 'b'], ['c', 'c']])
})
