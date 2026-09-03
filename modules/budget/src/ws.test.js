import {Subject} from 'rxjs'

import {createBudgetWsProtocol} from './ws.js'

// flush pending promise chains (the snapshot path is async fire-and-forget)
const flush = () => new Promise(resolve => setImmediate(resolve))

const DTO = {
    monthlyInstanceBudget: 10,
    monthlyInstanceSpending: 2,
    monthlyStorageBudget: 5,
    monthlyStorageSpending: 1,
    storageQuota: 100,
    storageUsed: 30,
    costPerGbMonth: 0.3,
    budgetUpdateRequest: null,
}

const PAYLOAD = {
    spending: {
        monthlyInstanceBudget: 10,
        monthlyInstanceSpending: 2,
        monthlyStorageBudget: 5,
        monthlyStorageSpending: 1,
        storageQuota: 100,
        storageUsed: 30,
        costPerGbMonth: 0.3,
    },
    budgetUpdateRequest: null,
}

const setup = ({userSpending} = {}) => {
    const sent = []
    const spending$ = new Subject()
    const stop$ = new Subject()
    const budgetManager = {
        userSpending: userSpending ?? (async () => DTO),
    }
    const protocol = createBudgetWsProtocol({budgetManager, spending$})
    const handler = protocol({send: message => sent.push(message), stop$})
    return {sent, spending$, stop$, handler}
}

const subscriptionUp = (handler, {username = 'alice', clientId = 'c1', subscriptionId = 's1'} = {}) =>
    handler({event: 'subscriptionUp', user: {username}, clientId, subscriptionId})

describe('budget ws protocol', () => {
    it('unicasts a spending snapshot on subscriptionUp', async () => {
        const {sent, handler} = setup()
        subscriptionUp(handler)
        await flush()
        expect(sent).toEqual([{clientId: 'c1', subscriptionId: 's1', data: PAYLOAD}])
    })

    it('forwards a spending$ emission to all tabs of a subscribed user', async () => {
        const {sent, spending$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        spending$.next({username: 'alice', spending: DTO})
        expect(sent).toEqual([{username: 'alice', data: PAYLOAD}])
    })

    it('ignores spending$ emissions for users without a subscription', async () => {
        const {sent, spending$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        spending$.next({username: 'bob', spending: DTO})
        expect(sent).toEqual([])
    })

    it('forwards one multicast per emission even with multiple subscriptions', async () => {
        const {sent, spending$, handler} = setup()
        subscriptionUp(handler, {username: 'alice', clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {username: 'alice', clientId: 'c2', subscriptionId: 's2'})
        await flush()
        sent.length = 0
        spending$.next({username: 'alice', spending: DTO})
        expect(sent).toEqual([{username: 'alice', data: PAYLOAD}])
    })

    it('stops forwarding after subscriptionDown', async () => {
        const {sent, spending$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        handler({event: 'subscriptionDown', user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'})
        sent.length = 0
        spending$.next({username: 'alice', spending: DTO})
        expect(sent).toEqual([])
    })

    it('drops all of a client\'s subscriptions on clientDown', async () => {
        const {sent, spending$, handler} = setup()
        subscriptionUp(handler, {clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {clientId: 'c1', subscriptionId: 's2'})
        await flush()
        handler({event: 'clientDown', user: {username: 'alice'}, clientId: 'c1'})
        sent.length = 0
        spending$.next({username: 'alice', spending: DTO})
        expect(sent).toEqual([])
    })

    it('drops all of a user\'s subscriptions on userDown', async () => {
        const {sent, spending$, handler} = setup()
        subscriptionUp(handler, {clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {clientId: 'c2', subscriptionId: 's2'})
        await flush()
        handler({event: 'userDown', user: {username: 'alice'}})
        sent.length = 0
        spending$.next({username: 'alice', spending: DTO})
        expect(sent).toEqual([])
    })

    it('unicasts a fresh snapshot on a {refresh: true} data message', async () => {
        const {sent, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        handler({user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1', data: {refresh: true}})
        await flush()
        expect(sent).toEqual([{clientId: 'c1', subscriptionId: 's1', data: PAYLOAD}])
    })

    it('swallows snapshot failures without sending or crashing', async () => {
        const {sent, handler} = setup({
            userSpending: async () => {
                throw new Error('db down')
            },
        })
        subscriptionUp(handler)
        await flush()
        expect(sent).toEqual([])
    })

    it('unsubscribes from spending$ on stop$', async () => {
        const {sent, spending$, stop$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        stop$.next()
        spending$.next({username: 'alice', spending: DTO})
        expect(sent).toEqual([])
    })
})
