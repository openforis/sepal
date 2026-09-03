// Unit tests for the task websocket protocol — fake taskManager, real moduleWs$ scaffolding,
// driven through the shared taskChanged$ subject. No database, no gateway.

import {Subject} from 'rxjs'

import {emitTaskChanged} from './events.js'
import {createTaskWs} from './ws.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const aliceTask = {
    id: 't-1',
    recipeId: 'r-1',
    state: 'PENDING',
    username: 'alice',
    params: {title: 'Alice task'},
    statusDescription: 'Pending',
    creationTime: new Date('2026-07-01T00:00:00Z'),
    updateTime: new Date('2026-07-01T00:00:00Z'),
}

describe('createTaskWs', () => {
    let tasksByUser
    let in$
    let received
    let subscription

    const taskManager = {
        userTasks: async username => tasksByUser[username] ?? [],
    }

    const subscriptionUp = (username, subscriptionId) =>
        in$.next({
            event: 'subscriptionUp',
            user: {username},
            clientId: 'c-1',
            subscriptionId,
        })

    const subscriptionDown = (username, subscriptionId) =>
        in$.next({
            event: 'subscriptionDown',
            user: {username},
            clientId: 'c-1',
            subscriptionId,
        })

    beforeEach(() => {
        tasksByUser = {alice: [aliceTask]}
        in$ = new Subject()
        received = []
        const taskWs$ = createTaskWs({taskManager, debounceMilliseconds: 0})
        subscription = taskWs$(in$).subscribe(message => received.push(message))
    })

    afterEach(() => {
        subscription.unsubscribe()
    })

    it('emits ready on connect', async () => {
        await sleep(10)
        expect(received).toEqual([{ready: true}])
    })

    it('sends the full task listing on subscriptionUp', async () => {
        subscriptionUp('alice', 's-1')
        await sleep(20)
        const dataMessages = received.filter(({data}) => data)
        expect(dataMessages).toHaveLength(1)
        const {clientId, subscriptionId, data} = dataMessages[0]
        expect(clientId).toBe('c-1')
        expect(subscriptionId).toBe('s-1')
        expect(data.path).toBe('')
        expect(Object.keys(data.items)).toEqual(['t-1'])
        expect(data.items['t-1'].status).toBe('PENDING')
        expect(data.items['t-1'].id).toBe('t-1')
    })

    it('pushes an updated listing when the user tasks change', async () => {
        subscriptionUp('alice', 's-1')
        await sleep(20)
        tasksByUser.alice = [{...aliceTask, state: 'ACTIVE'}]
        emitTaskChanged('alice')
        await sleep(20)
        const dataMessages = received.filter(({data}) => data)
        expect(dataMessages).toHaveLength(2)
        expect(dataMessages[1].data.items['t-1'].status).toBe('ACTIVE')
    })

    it('does not push when an unchanged listing is re-queried', async () => {
        subscriptionUp('alice', 's-1')
        await sleep(20)
        emitTaskChanged('alice')
        await sleep(20)
        expect(received.filter(({data}) => data)).toHaveLength(1)
    })

    it('ignores changes for other users', async () => {
        subscriptionUp('alice', 's-1')
        await sleep(20)
        tasksByUser.bob = [{...aliceTask, id: 't-9', username: 'bob'}]
        emitTaskChanged('bob')
        await sleep(20)
        expect(received.filter(({data}) => data)).toHaveLength(1)
    })

    it('stops pushing after subscriptionDown', async () => {
        subscriptionUp('alice', 's-1')
        await sleep(20)
        subscriptionDown('alice', 's-1')
        tasksByUser.alice = [{...aliceTask, state: 'ACTIVE'}]
        emitTaskChanged('alice')
        await sleep(20)
        expect(received.filter(({data}) => data)).toHaveLength(1)
    })

    it('re-sends the full listing when the same subscription re-subscribes', async () => {
        subscriptionUp('alice', 's-1')
        await sleep(20)
        subscriptionUp('alice', 's-1')
        await sleep(20)
        expect(received.filter(({data}) => data)).toHaveLength(2)
    })
})

describe('createTaskWs retry', () => {
    let calls
    let in$
    let received
    let subscription

    const taskManager = {
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

    beforeEach(() => {
        calls = 0
        in$ = new Subject()
        received = []
        const taskWs$ = createTaskWs({
            taskManager,
            debounceMilliseconds: 0,
            retryConfig: {maxRetries: 3, minRetryDelay: 0, maxRetryDelay: 0, retryDelayFactor: 1}
        })
        subscription = taskWs$(in$).subscribe(message => received.push(message))
    })

    afterEach(() => {
        subscription.unsubscribe()
    })

    it('retries a failed listing query and still delivers the full listing', async () => {
        subscriptionUp('alice', 's-1')
        await sleep(20)

        const dataMessages = received.filter(({data}) => data)
        expect(dataMessages).toHaveLength(1)
        expect(Object.keys(dataMessages[0].data.items)).toEqual(['t-1'])
        expect(calls).toBe(2)
    })
})

describe('createTaskWs shared listing pipeline', () => {
    let tasksByUser
    let in$
    let received
    let subscription

    const countingTaskManager = () => {
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

    beforeEach(() => {
        tasksByUser = {alice: [aliceTask]}
        in$ = new Subject()
        received = []
    })

    afterEach(() => {
        subscription.unsubscribe()
    })

    it('serves all of a user\'s subscriptions with one shared query', async () => {
        const taskManager = countingTaskManager()
        const taskWs$ = createTaskWs({taskManager, debounceMilliseconds: 0})
        subscription = taskWs$(in$).subscribe(message => received.push(message))
        await sleep(0)

        subscriptionUp('c-1', 's-1', 'alice')
        subscriptionUp('c-2', 's-2', 'alice')
        await sleep(20)

        const dataMessages = received.filter(({data}) => data)
        expect(dataMessages).toHaveLength(2)
        const bySubscription = id => dataMessages.find(({subscriptionId}) => subscriptionId === id)
        expect(bySubscription('s-1').clientId).toBe('c-1')
        expect(bySubscription('s-2').clientId).toBe('c-2')
        expect(Object.keys(bySubscription('s-1').data.items)).toEqual(['t-1'])
        expect(bySubscription('s-1').data.items).toEqual(bySubscription('s-2').data.items)
        expect(taskManager.calls.count).toBe(1)

        tasksByUser.alice = [{...aliceTask, state: 'ACTIVE'}]
        emitTaskChanged('alice')
        await sleep(20)

        const allDataMessages = received.filter(({data}) => data)
        expect(allDataMessages).toHaveLength(4)
        expect(taskManager.calls.count).toBe(2)
    })

    it('resets the shared pipeline after the last subscription ends', async () => {
        const taskManager = countingTaskManager()
        const taskWs$ = createTaskWs({taskManager, debounceMilliseconds: 0})
        subscription = taskWs$(in$).subscribe(message => received.push(message))
        await sleep(0)

        subscriptionUp('c-1', 's-1', 'alice')
        await sleep(20)
        expect(received.filter(({data}) => data)).toHaveLength(1)
        expect(taskManager.calls.count).toBe(1)

        subscriptionDown('c-1', 's-1')
        tasksByUser.alice = [{...aliceTask, state: 'ACTIVE'}]
        // no emitTaskChanged: the shared pipeline should be torn down, not re-queried
        await sleep(20)
        expect(received.filter(({data}) => data)).toHaveLength(1)

        subscriptionUp('c-1', 's-9', 'alice')
        await sleep(20)

        const dataMessages = received.filter(({data}) => data)
        expect(dataMessages).toHaveLength(2)
        expect(dataMessages[1].data.items['t-1'].status).toBe('ACTIVE')
        expect(taskManager.calls.count).toBe(2)
    })
})
