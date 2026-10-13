import {createEnforcement} from './enforcement.js'

test('publishes Exceeded with the reason for over-budget users and Cleared for the rest, every cycle', async () => {
    const budgetManager = {verdict: verdictOf({over: 'DATA_QUOTA'})}
    const userClient = {eachUsername: async fn => { await fn('over'); await fn('ok') }}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, userClient, events})
    await enforcement.publishVerdicts()
    await enforcement.publishVerdicts() // level-triggered: re-publishes each cycle

    expect(events.emitted).toEqual([
        ['x', 'over', 'DATA_QUOTA'], ['c', 'ok'],
        ['x', 'over', 'DATA_QUOTA'], ['c', 'ok'],
    ])
})

test('recomputes the verdict fresh each cycle (no cached/edge-triggered state)', async () => {
    let reasons = {alice: 'STORAGE_QUOTA'}
    const budgetManager = {verdict: async username => verdictOf(reasons)(username)}
    const userClient = {eachUsername: async fn => { await fn('alice'); await fn('bob') }}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, userClient, events})
    await enforcement.publishVerdicts()
    reasons = {bob: 'INSTANCE_BUDGET'} // alice clears, bob goes over — between cycles
    await enforcement.publishVerdicts()

    expect(events.emitted).toEqual([
        ['x', 'alice', 'STORAGE_QUOTA'], ['c', 'bob'],
        ['c', 'alice'], ['x', 'bob', 'INSTANCE_BUDGET'],
    ])
})

test('iterates every user known to userClient, not just the exceeded ones', async () => {
    const budgetManager = {verdict: verdictOf({})}
    const userClient = {eachUsername: async fn => { await fn('a'); await fn('b'); await fn('c') }}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, userClient, events})
    await enforcement.publishVerdicts()

    expect(events.emitted).toEqual([['c', 'a'], ['c', 'b'], ['c', 'c']])
})

test('publishes the live verdict and reason for each user with an open session', async () => {
    const budgetManager = {verdict: verdictOf({over: 'STORAGE_BUDGET'})}
    const openSessionUse = {usersWithOpenSessions: async () => ['over', 'ok']}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, openSessionUse, events})
    await enforcement.publishOpenSessionVerdicts()

    expect(events.emitted).toEqual([['x', 'over', 'STORAGE_BUDGET'], ['c', 'ok']])
})

test('leaves users without open sessions to the hourly pass', async () => {
    const budgetManager = {verdict: verdictOf({})}
    const openSessionUse = {usersWithOpenSessions: async () => []}
    const events = createEvents()

    const enforcement = createEnforcement({budgetManager, openSessionUse, events})
    await enforcement.publishOpenSessionVerdicts()

    expect(events.emitted).toEqual([])
})

const verdictOf = reasonByUser => async username => username in reasonByUser
    ? {username, exceeded: true, reason: reasonByUser[username]}
    : {username, exceeded: false, reason: null}

const createEvents = () => {
    const emitted = []
    return {
        emitted,
        emitUserBudgetExceeded: (username, reason) => emitted.push(['x', username, reason]),
        emitUserBudgetCleared: username => emitted.push(['c', username]),
    }
}
