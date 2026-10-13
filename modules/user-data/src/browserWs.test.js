import {Subject} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {configureNoLogging} from '#sepal/log'

import {createBrowserWs} from './browserWs.js'

beforeAll(() => configureNoLogging())

const stops = []
afterEach(() => stops.splice(0).forEach(stop$ => stop$.next()))

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

const harness = async ({listings = [A], fail, pollMs = POLL_MS}) => {
    const sent = []
    const stop$ = new Subject()
    stops.push(stop$)
    const browser = {
        listCalls: [],
        removeCalls: [],
        list: async (username, path) => {
            browser.listCalls.push([username, path])
            if (fail) {
                throw fail
            }
            return listings[Math.min(browser.listCalls.length - 1, listings.length - 1)]
        },
        remove: async (username, paths) => {
            browser.removeCalls.push([username, paths])
        }
    }
    const handle = await createBrowserWs({browser, pollMs})({send: message => sent.push(message), stop$})
    return {handle, sent, browser, stop$}
}

const monitor = paths => ({
    data: {monitor: paths},
    user: {username: 'alice'},
    clientId: 'c1',
    subscriptionId: 's1'
})

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
