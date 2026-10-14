import {Subject} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {configureNoLogging} from '#sepal/log'
import {moduleWs$} from '#sepal/ws/module'

import {createBrowserWs} from './browserWs.js'

beforeAll(() => configureNoLogging())

const stops = []
const connections = []
afterEach(() => {
    stops.splice(0).forEach(stop$ => stop$.next())
    connections.splice(0).forEach(subscription => subscription.unsubscribe())
})

const POLL_MS = 20
const A = {'a.txt': {file: true, size: 1, mtime: 1}}
const B = {'b.txt': {file: true, size: 2, mtime: 2}}

describe('monitor', () => {
    it('sends the listing of a monitored path at once, and again only when it changes', async () => {
        const {handle, sent, browser} = await harness({listings: [A, A, B]})

        handle(monitor('data'))
        await wait(70)

        expect(sent).toEqual([
            {clientId: 'c1', subscriptionId: 's1', data: {path: 'data', items: A}},
            {clientId: 'c1', subscriptionId: 's1', data: {path: 'data', items: B}}
        ])
        expect(browser.listCalls.length).toBeGreaterThanOrEqual(3)
    })

    it('reports an invalid path once and does not poll it', async () => {
        const {handle, sent, browser} = await harness({fail: new ClientException('bad')})

        handle(monitor('data/../x'))
        await wait(70)

        expect(sent).toEqual([{clientId: 'c1', subscriptionId: 's1', data: {path: 'data/../x', error: 'INVALID_PATH'}}])
        expect(browser.listCalls).toHaveLength(1)
    })

    it('replaces the earlier paths of the subscription on reset', async () => {
        const {handle, browser} = await harness({listings: [A]})
        handle(monitor('data/one'))
        await wait(30)

        handle({...monitor('data/two'), data: {monitor: 'data/two', reset: true}})
        await wait(10)
        browser.listCalls.length = 0
        await wait(50)

        expect(new Set(browser.listCalls.map(([, path]) => path))).toEqual(new Set(['data/two']))
    })
})

describe('unmonitor', () => {
    it('stops a path and its subpaths', async () => {
        const {handle, browser} = await harness({listings: [A]})
        handle(monitor(['data', 'data/sub']))
        await wait(30)

        handle({...monitor('data'), data: {unmonitor: 'data'}})
        await wait(10)
        browser.listCalls.length = 0
        await wait(60)

        expect(browser.listCalls).toEqual([])
    })

    it('keeps another subscription\'s monitoring', async () => {
        const {handle, browser} = await harness({listings: [A]})
        handle(monitor('data'))
        handle({...monitor('data'), subscriptionId: 's2'})
        await wait(30)

        handle({...monitor('data'), data: {unmonitor: 'data'}})
        await wait(10)
        browser.listCalls.length = 0
        await wait(50)

        expect(browser.listCalls.length).toBeGreaterThan(0)
    })
})

describe('remove', () => {
    it('removes, then lists the monitored paths again at once', async () => {
        const {handle, browser} = await harness({listings: [A], pollMs: 10000})
        handle(monitor('data'))
        await wait(30)
        const listed = browser.listCalls.length

        handle({...monitor('data'), data: {remove: ['data/a.txt']}})
        await wait(30)

        expect(browser.removeCalls).toEqual([['alice', ['data/a.txt']]])
        expect(browser.listCalls.length).toBe(listed + 1)
    })

    it('lists again after a removal that finished while a listing was in flight', async () => {
        const {handle, sent, browser} = await harness({listings: [A, B], listMs: [50, 0], pollMs: 10000})
        handle(monitor('data'))
        await wait(10)

        handle({...monitor('data'), data: {remove: ['data/a.txt']}})
        await wait(80)

        expect(browser.listCalls).toHaveLength(2)
        expect(sent.at(-1).data).toEqual({path: 'data', items: B})
    })

    it('reports the paths that failed to be removed, and lists again', async () => {
        const {handle, sent, browser} = await harness({listings: [A], pollMs: 10000, removeResult: {failed: ['data/b']}})
        handle(monitor('data'))
        await wait(30)
        const listed = browser.listCalls.length

        handle({...monitor('data'), data: {remove: ['data/a', 'data/b']}})
        await wait(30)

        expect(sent).toContainEqual({clientId: 'c1', subscriptionId: 's1', data: {removeFailed: ['data/b']}})
        expect(browser.listCalls.length).toBe(listed + 1)
    })

    it('reports every path as failed when the request is refused', async () => {
        const {handle, sent} = await harness({listings: [A], removeFailure: new ClientException('The Data folder cannot be removed')})

        handle({...monitor('data'), data: {remove: ['data']}})
        await wait(30)

        expect(sent).toContainEqual({clientId: 'c1', subscriptionId: 's1', data: {removeFailed: ['data']}})
    })

    it('reports nothing when every path was removed', async () => {
        const {handle, sent} = await harness({listings: [A]})

        handle({...monitor('data'), data: {remove: ['data/a']}})
        await wait(30)

        expect(sent.filter(({data}) => data.removeFailed)).toEqual([])
    })
})

describe('malformed messages', () => {
    it('keeps handling other clients\' messages after one it cannot handle', async () => {
        const {in$, sent} = await connection({listings: [A]})

        in$.next({data: {unmonitor: [null]}, user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'})
        in$.next({...monitor('data'), user: {username: 'bob'}, clientId: 'c2'})
        await wait(30)

        expect(sent).toContainEqual({clientId: 'c2', subscriptionId: 's1', data: {path: 'data', items: A}})
    })

    it('ignores paths that are not strings', async () => {
        const {handle, browser} = await harness({listings: [A]})

        handle(monitor([{}, 42, 'data']))
        await wait(10)

        expect(browser.listCalls).toEqual([['alice', 'data']])
    })
})

describe('events', () => {
    it('stops everything for a client that went down', async () => {
        const {handle, browser} = await harness({listings: [A]})
        handle(monitor('data'))
        await wait(30)

        handle({event: 'clientDown', user: {username: 'alice'}, clientId: 'c1'})
        await wait(10)
        browser.listCalls.length = 0
        await wait(60)

        expect(browser.listCalls).toEqual([])
    })

    it('stops a subscription that went down, and no other', async () => {
        const {handle, browser} = await harness({listings: [A]})
        handle(monitor('data'))
        handle({...monitor('data/x'), subscriptionId: 's2'})
        await wait(30)

        handle({event: 'subscriptionDown', user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'})
        await wait(10)
        browser.listCalls.length = 0
        await wait(50)

        expect(new Set(browser.listCalls.map(([, path]) => path))).toEqual(new Set(['data/x']))
    })

    it('stops everything when the connection ends', async () => {
        const {handle, browser, stop$} = await harness({listings: [A]})
        handle(monitor('data'))
        await wait(30)

        stop$.next()
        await wait(10)
        browser.listCalls.length = 0
        await wait(60)

        expect(browser.listCalls).toEqual([])
    })
})

const harness = async ({listings = [A], listMs, fail, pollMs = POLL_MS, removeResult = {failed: []}, removeFailure}) => {
    const sent = []
    const stop$ = new Subject()
    stops.push(stop$)
    const browser = fakeBrowser({listings, listMs, fail, removeResult, removeFailure})
    const handle = await createBrowserWs({browser, pollMs})({send: message => sent.push(message), stop$})
    return {handle, sent, browser, stop$}
}

// The protocol behind the module websocket's own message handling, as main.js serves it.
const connection = async ({listings}) => {
    const sent = []
    const in$ = new Subject()
    const subscription = moduleWs$(createBrowserWs({browser: fakeBrowser({listings}), pollMs: POLL_MS}))(in$)
        .subscribe(message => sent.push(message))
    connections.push(subscription)
    await wait(0)
    return {in$, sent}
}

// listMs: how long each successive listing takes; the last one repeats.
const fakeBrowser = ({listings, listMs = [0], fail, removeResult = {failed: []}, removeFailure}) => {
    const browser = {
        listCalls: [],
        removeCalls: [],
        list: async (username, path) => {
            browser.listCalls.push([username, path])
            const call = browser.listCalls.length - 1
            await wait(listMs[Math.min(call, listMs.length - 1)])
            if (fail) {
                throw fail
            }
            return listings[Math.min(call, listings.length - 1)]
        },
        remove: async (username, paths) => {
            browser.removeCalls.push([username, paths])
            if (removeFailure) {
                throw removeFailure
            }
            return removeResult
        }
    }
    return browser
}

const monitor = paths => ({
    data: {monitor: paths},
    user: {username: 'alice'},
    clientId: 'c1',
    subscriptionId: 's1'
})

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
