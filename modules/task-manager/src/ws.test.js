// Unit tests for the task websocket protocol — fake tasks, real moduleWs$ scaffolding,
// driven through the shared taskChanged$ subject. No database, no gateway.

import assert from 'node:assert/strict'
import {afterEach, beforeEach, describe, it} from 'node:test'

import {Subject} from 'rxjs'

import {emitTaskChanged} from './events.js'
import {createTask} from './task.js'
import {createTaskWs} from './ws.js'

describe('createTaskWs', () => {
    let tasksByUser
    let in$
    let messages
    let queries
    let subscription

    const tasks = {
        userTasks: async username => {
            queries.add(username)
            return tasksByUser[username] ?? []
        },
    }

    const subscriptionUp = (username, subscriptionId, clientId = 'c-1') =>
        in$.next({
            event: 'subscriptionUp',
            user: {username},
            clientId,
            subscriptionId,
        })

    const subscriptionDown = (username, subscriptionId, clientId = 'c-1') =>
        in$.next({
            event: 'subscriptionDown',
            user: {username},
            clientId,
            subscriptionId,
        })

    const listings = () => messages.values.filter(({data}) => data)

    const listingsFor = subscriptionId =>
        listings().filter(message => message.subscriptionId === subscriptionId)

    const untilListings = count =>
        messages.until(`${count} listing message(s)`, () => listings().length >= count)

    const untilListingsFor = (subscriptionId, count) =>
        messages.until(`${count} listing(s) for ${subscriptionId}`,
            () => listingsFor(subscriptionId).length >= count)

    const untilQueries = count =>
        queries.until(`${count} listing quer(ies)`, () => queries.values.length >= count)

    const queriesFor = username => queries.values.filter(queried => queried === username)

    beforeEach(async () => {
        tasksByUser = {alice: [aliceTask]}
        in$ = new Subject()
        messages = collector()
        queries = collector()
        const taskWs$ = createTaskWs({tasks, debounceMilliseconds: 0})
        subscription = taskWs$(in$).subscribe(message => messages.add(message))
        await untilReady(messages)
    })

    afterEach(() => {
        subscription.unsubscribe()
    })

    it('emits ready on connect', async () => {
        assert.deepEqual(messages.values, [{ready: true}])
    })

    it('sends the full task listing on subscriptionUp', async () => {
        subscriptionUp('alice', 's-1')
        await untilListings(1)
        const dataMessages = listings()
        assert.equal(dataMessages.length, 1)
        const {clientId, subscriptionId, data} = dataMessages[0]
        assert.equal(clientId, 'c-1')
        assert.equal(subscriptionId, 's-1')
        assert.equal(data.path, '')
        assert.deepEqual(Object.keys(data.items), ['t-1'])
        assert.equal(data.items['t-1'].status, 'PENDING')
        assert.equal(data.items['t-1'].id, 't-1')
    })

    it('pushes an updated listing when the user tasks change', async () => {
        subscriptionUp('alice', 's-1')
        await untilListings(1)
        tasksByUser.alice = [{...aliceTask, state: 'ACTIVE'}]
        emitTaskChanged('alice')
        await untilListings(2)
        const dataMessages = listings()
        assert.equal(dataMessages.length, 2)
        assert.equal(dataMessages[1].data.items['t-1'].status, 'ACTIVE')
    })

    // Nothing arriving cannot be awaited, so this waits for the re-query it provoked, then for a later
    // change it knows must push. A push from the unchanged re-query would sit between the two.
    it('does not push when an unchanged listing is re-queried', async () => {
        subscriptionUp('alice', 's-1')
        await untilListings(1)
        emitTaskChanged('alice')
        await untilQueries(2)

        tasksByUser.alice = [{...aliceTask, state: 'ACTIVE'}]
        emitTaskChanged('alice')
        await untilListings(2)

        assert.equal(listings().length, 2)
        assert.equal(listings()[1].data.items['t-1'].status, 'ACTIVE')
    })

    // Each user has their own listing pipeline with its own debounce window, so bob's push is the barrier
    // that proves his change was processed end to end. Only then does alice's query count mean anything:
    // a change reaching her pipeline would have queried for her.
    it('ignores changes for other users', async () => {
        subscriptionUp('alice', 's-1')
        subscriptionUp('bob', 's-2', 'c-2')
        await untilListings(2)
        const aliceQueries = queriesFor('alice').length

        tasksByUser.bob = [{...aliceTask, id: 't-9', username: 'bob'}]
        emitTaskChanged('bob')
        await untilListingsFor('s-2', 2)

        assert.equal(queriesFor('alice').length, aliceQueries)
        assert.equal(listingsFor('s-1').length, 1)
    })

    // A second subscription of the same user shares one listing, so its push is the proof that the
    // change was delivered - and that the subscription taken down received nothing from it.
    it('stops pushing after subscriptionDown', async () => {
        subscriptionUp('alice', 's-1')
        subscriptionUp('alice', 's-2')
        await untilListings(2)
        subscriptionDown('alice', 's-1')
        tasksByUser.alice = [{...aliceTask, state: 'ACTIVE'}]
        emitTaskChanged('alice')
        await untilListingsFor('s-2', 2)

        assert.equal(listingsFor('s-1').length, 1)
    })

    it('re-sends the full listing when the same subscription re-subscribes', async () => {
        subscriptionUp('alice', 's-1')
        await untilListings(1)
        subscriptionUp('alice', 's-1')
        await untilListings(2)
        assert.equal(listings().length, 2)
    })
})

describe('createTaskWs retry', () => {
    let calls
    let in$
    let messages
    let subscription

    const tasks = {
        userTasks: async () => {
            calls++
            if (calls === 1) {
                throw new Error('transient failure')
            }
            return [aliceTask]
        }
    }

    const subscriptionUp = (username, subscriptionId) =>
        in$.next({
            event: 'subscriptionUp',
            user: {username},
            clientId: 'c-1',
            subscriptionId,
        })

    const listings = () => messages.values.filter(({data}) => data)

    beforeEach(async () => {
        calls = 0
        in$ = new Subject()
        messages = collector()
        const taskWs$ = createTaskWs({
            tasks,
            debounceMilliseconds: 0,
            retryConfig: {maxRetries: 3, minRetryDelay: 0, maxRetryDelay: 0, retryDelayFactor: 1}
        })
        subscription = taskWs$(in$).subscribe(message => messages.add(message))
        await untilReady(messages)
    })

    afterEach(() => {
        subscription.unsubscribe()
    })

    it('retries a failed listing query and still delivers the full listing', async () => {
        subscriptionUp('alice', 's-1')
        await messages.until('the listing delivered after the retry', () => listings().length >= 1)

        const dataMessages = listings()
        assert.equal(dataMessages.length, 1)
        assert.deepEqual(Object.keys(dataMessages[0].data.items), ['t-1'])
        assert.equal(calls, 2)
    })
})

describe('createTaskWs shared listing pipeline', () => {
    let tasksByUser
    let in$
    let messages
    let subscription

    const countingTasks = () => {
        const calls = {count: 0}
        return {
            calls,
            userTasks: async username => {
                calls.count++
                return tasksByUser[username] ?? []
            }
        }
    }

    const subscriptionUp = (clientId, subscriptionId, username) =>
        in$.next({
            event: 'subscriptionUp',
            user: {username},
            clientId,
            subscriptionId,
        })

    const subscriptionDown = (clientId, subscriptionId) =>
        in$.next({
            event: 'subscriptionDown',
            clientId,
            subscriptionId,
        })

    const listings = () => messages.values.filter(({data}) => data)

    const untilListings = count =>
        messages.until(`${count} listing message(s)`, () => listings().length >= count)

    const connect = async tasks => {
        const taskWs$ = createTaskWs({tasks, debounceMilliseconds: 0})
        subscription = taskWs$(in$).subscribe(message => messages.add(message))
        await untilReady(messages)
    }

    beforeEach(() => {
        tasksByUser = {alice: [aliceTask]}
        in$ = new Subject()
        messages = collector()
    })

    afterEach(() => {
        subscription.unsubscribe()
    })

    it('serves all of a user\'s subscriptions with one shared query', async () => {
        const tasks = countingTasks()
        await connect(tasks)

        subscriptionUp('c-1', 's-1', 'alice')
        subscriptionUp('c-2', 's-2', 'alice')
        await untilListings(2)

        const dataMessages = listings()
        assert.equal(dataMessages.length, 2)
        const bySubscription = id => dataMessages.find(({subscriptionId}) => subscriptionId === id)
        assert.equal(bySubscription('s-1').clientId, 'c-1')
        assert.equal(bySubscription('s-2').clientId, 'c-2')
        assert.deepEqual(Object.keys(bySubscription('s-1').data.items), ['t-1'])
        assert.deepEqual(bySubscription('s-1').data.items, bySubscription('s-2').data.items)
        assert.equal(tasks.calls.count, 1)

        tasksByUser.alice = [{...aliceTask, state: 'ACTIVE'}]
        emitTaskChanged('alice')
        await untilListings(4)

        assert.equal(listings().length, 4)
        assert.equal(tasks.calls.count, 2)
    })

    // Nothing is emitted while no subscription is up, so the re-subscribe that follows is what proves it:
    // a pipeline still running would have queried again for the change made in between.
    it('resets the shared pipeline after the last subscription ends', async () => {
        const tasks = countingTasks()
        await connect(tasks)

        subscriptionUp('c-1', 's-1', 'alice')
        await untilListings(1)
        assert.equal(tasks.calls.count, 1)

        subscriptionDown('c-1', 's-1')
        tasksByUser.alice = [{...aliceTask, state: 'ACTIVE'}]
        // no emitTaskChanged: the shared pipeline should be torn down, not re-queried

        subscriptionUp('c-1', 's-9', 'alice')
        await untilListings(2)

        const dataMessages = listings()
        assert.equal(dataMessages.length, 2)
        assert.equal(dataMessages[1].data.items['t-1'].status, 'ACTIVE')
        assert.equal(tasks.calls.count, 2)
    })
})

// Cases wait for the emission they are about, never for a wall-clock deadline: a slower machine makes a
// test slower rather than wrong. The timeout is a safety net for a case that would otherwise hang, not a
// synchronization device — the waits it guards are microtasks and millisecond timers.
const WAIT_TIMEOUT_MS = 4000

const collector = () => {
    const values = []
    const waiting = new Set()
    return {
        values,
        add: value => {
            values.push(value)
            waiting.forEach(waiter => waiter.check())
        },
        until: (description, satisfied) => new Promise((resolve, reject) => {
            const waiter = {
                check: () => {
                    if (satisfied()) {
                        waiting.delete(waiter)
                        clearTimeout(waiter.timer)
                        resolve()
                    }
                }
            }
            waiter.timer = setTimeout(() => {
                waiting.delete(waiter)
                reject(new Error(`Timed out waiting for ${description}`))
            }, WAIT_TIMEOUT_MS)
            waiting.add(waiter)
            waiter.check()
        })
    }
}

// The protocol is installed when it announces itself; a subscription sent before that is dropped, because
// nothing is listening on in$ yet.
const untilReady = messages =>
    messages.until('the ready message', () => messages.values.length >= 1)

const aliceTask = createTask({
    id: 't-1',
    recipeId: 'r-1',
    state: 'PENDING',
    username: 'alice',
    operation: 'image.GEE',
    params: {title: 'Alice task'},
    creationTime: new Date('2026-07-01T00:00:00Z'),
    updateTime: new Date('2026-07-01T00:00:00Z')
})
