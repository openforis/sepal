import {jest} from '@jest/globals'
import {Subject} from 'rxjs'

import {createSessionWsProtocol} from './ws.js'

// Let both the debounce timer and the async (fire-and-forget) report query settle. A macrotask
// timer is required, not setImmediate: debounceTime schedules on asyncScheduler, whose 0ms timer
// fires in a later loop phase than the check phase setImmediate runs in.
const flush = () => new Promise(resolve => setTimeout(resolve, 5))

// No instanceTypes: the static list is served by GET /sessions/report, never pushed.
const REPORT = {
    sessions: [{id: 's-1', status: 'ACTIVE', costSinceCreation: 0.1}],
}

// debounceMilliseconds: 0 still defers to a macrotask, so changes are asserted after a flush.
const setup = ({userSessions, sessionManager} = {}) => {
    const sent = []
    const sessionChanged$ = new Subject()
    const stop$ = new Subject()
    const sessionsApi = {
        userSessions: userSessions ?? (async () => REPORT),
    }
    const protocol = createSessionWsProtocol({sessionsApi, sessionChanged$, sessionManager, debounceMilliseconds: 0})
    const handler = protocol({send: message => sent.push(message), stop$})
    return {sent, sessionChanged$, stop$, handler, sessionsApi}
}

const subscriptionUp = (handler, {username = 'alice', clientId = 'c1', subscriptionId = 's1'} = {}) =>
    handler({event: 'subscriptionUp', user: {username}, clientId, subscriptionId})

describe('session ws protocol', () => {
    it('unicasts a report snapshot on subscriptionUp', async () => {
        const {sent, handler} = setup()
        subscriptionUp(handler)
        await flush()
        expect(sent).toEqual([{clientId: 'c1', subscriptionId: 's1', data: REPORT}])
    })

    it('multicasts to a subscribed user on sessionChanged$', async () => {
        const {sent, sessionChanged$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        sessionChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([{username: 'alice', data: REPORT}])
    })

    it('ignores sessionChanged$ for users without a subscription', async () => {
        const {sent, sessionChanged$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        sessionChanged$.next({username: 'bob'})
        await flush()
        expect(sent).toEqual([])
    })

    it('sends one multicast per change even with several tabs open', async () => {
        const {sent, sessionChanged$, handler} = setup()
        subscriptionUp(handler, {clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {clientId: 'c2', subscriptionId: 's2'})
        await flush()
        sent.length = 0
        sessionChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([{username: 'alice', data: REPORT}])
    })

    it('debounces a burst of changes for the same user into one push', async () => {
        const {sent, sessionChanged$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        sessionChanged$.next({username: 'alice'})
        sessionChanged$.next({username: 'alice'})
        sessionChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([{username: 'alice', data: REPORT}])
    })

    it('debounces per user, so one user does not suppress another', async () => {
        const {sent, sessionChanged$, handler} = setup()
        subscriptionUp(handler, {username: 'alice', clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {username: 'bob', clientId: 'c2', subscriptionId: 's2'})
        await flush()
        sent.length = 0
        sessionChanged$.next({username: 'alice'})
        sessionChanged$.next({username: 'bob'})
        await flush()
        expect(sent).toEqual([
            {username: 'alice', data: REPORT},
            {username: 'bob', data: REPORT},
        ])
    })

    it('unicasts a fresh snapshot on {refresh: true}', async () => {
        const {sent, handler} = setup()
        subscriptionUp(handler)
        await flush()
        sent.length = 0
        handler({user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1', data: {refresh: true}})
        await flush()
        expect(sent).toEqual([{clientId: 'c1', subscriptionId: 's1', data: REPORT}])
    })

    it('stops pushing to a subscription after subscriptionDown', async () => {
        const {sent, sessionChanged$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        handler({event: 'subscriptionDown', clientId: 'c1', subscriptionId: 's1'})
        sent.length = 0
        sessionChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([])
    })

    it('drops every subscription of a client on clientDown', async () => {
        const {sent, sessionChanged$, handler} = setup()
        subscriptionUp(handler, {clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {clientId: 'c1', subscriptionId: 's2'})
        subscriptionUp(handler, {clientId: 'c2', subscriptionId: 's3'})
        await flush()
        handler({event: 'clientDown', clientId: 'c1'})
        sent.length = 0
        sessionChanged$.next({username: 'alice'})
        await flush()
        // c2 still subscribed for the same user → still multicast once
        expect(sent).toEqual([{username: 'alice', data: REPORT}])
    })

    it('dissociates the client\'s apps on clientDown (tabs died with the client)', async () => {
        const sessionManager = {dissociateAppsForClient: jest.fn(async () => [])}
        const {handler} = setup({sessionManager})
        handler({event: 'clientDown', user: {username: 'alice'}, clientId: 'c1'})
        expect(sessionManager.dissociateAppsForClient).toHaveBeenCalledWith({username: 'alice', clientId: 'c1'})
    })

    it('tolerates clientDown without a sessionManager or username', async () => {
        const sessionManager = {dissociateAppsForClient: jest.fn(async () => [])}
        const {handler} = setup() // no sessionManager wired
        expect(() => handler({event: 'clientDown', user: {username: 'alice'}, clientId: 'c1'})).not.toThrow()
        const {handler: handler2} = setup({sessionManager})
        handler2({event: 'clientDown', clientId: 'c1'}) // no user on the event
        expect(sessionManager.dissociateAppsForClient).not.toHaveBeenCalled()
    })

    it('drops every subscription of a user on userDown', async () => {
        const {sent, sessionChanged$, handler} = setup()
        subscriptionUp(handler, {clientId: 'c1', subscriptionId: 's1'})
        subscriptionUp(handler, {clientId: 'c2', subscriptionId: 's2'})
        await flush()
        handler({event: 'userDown', user: {username: 'alice'}})
        sent.length = 0
        sessionChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([])
    })

    it('stops listening to sessionChanged$ once the connection stops', async () => {
        const {sent, sessionChanged$, stop$, handler} = setup()
        subscriptionUp(handler)
        await flush()
        stop$.next()
        sent.length = 0
        sessionChanged$.next({username: 'alice'})
        await flush()
        expect(sent).toEqual([])
    })

    it('survives a failing report query without sending anything', async () => {
        const {sent, handler} = setup({userSessions: async () => {
            throw new Error('db down')
        }})
        subscriptionUp(handler)
        await flush()
        expect(sent).toEqual([])
    })

    it('ignores unknown events', async () => {
        const {sent, handler} = setup()
        handler({event: 'userUp', user: {username: 'alice'}})
        await flush()
        expect(sent).toEqual([])
    })
})
