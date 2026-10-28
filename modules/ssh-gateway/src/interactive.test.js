import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {NEVER, of, Subject} from 'rxjs'

import {callsOf} from '#sepal/testSupport/mock'

const sandboxInfo$ = mock.fn()
const terminateSession$ = mock.fn()
const createSession$ = mock.fn()
const joinSession$ = mock.fn()

mock.module('./endpoint.js', {
    exports: {
        sandboxInfo$,
        createSession$,
        joinSession$,
        terminateSession$
    }
})

const readLineQueue = []
const readLine$ = mock.fn(() => readLineQueue.length ? of(readLineQueue.shift()) : NEVER)
const print = mock.fn()
const println = mock.fn()

const prompt = mock.fn()

mock.module('./console.js', {
    exports: {
        print,
        println,
        prompt,
        format: text => `${text}`,
        highlight: text => `${text}`,
        readLine$
    }
})

const {interactive$} = await import('./interactive.js')

const flushPromises = () => new Promise(resolve => setImmediate(resolve))

const info = {
    exceededBudget: false,
    spending: {
        monthlyInstanceSpending: 1,
        monthlyInstanceBudget: 10,
        monthlyStorageSpending: 1,
        monthlyStorageBudget: 10,
        storageUsed: 1,
        storageQuota: 10
    },
    instanceTypes: [{tag: 't1', cpuCount: 2, ramGiB: 4, hourlyCost: 0.1}],
    sessions: [{
        path: '/sessions/session1',
        name: 'crazy-banana',
        status: 'ACTIVE',
        creationTime: new Date().toISOString(),
        instanceType: {tag: 't1', cpuCount: 2, ramGiB: 4, hourlyCost: 0.1},
        apps: []
    }]
}

beforeEach(() => {
    sandboxInfo$.mock.resetCalls()
    sandboxInfo$.mock.mockImplementation(() => of(info))
    terminateSession$.mock.resetCalls()
    terminateSession$.mock.mockImplementation(() => of({}))
    readLineQueue.length = 0
    readLine$.mock.resetCalls()
    print.mock.resetCalls()
    println.mock.resetCalls()
    prompt.mock.resetCalls()
    createSession$.mock.resetCalls()
    createSession$.mock.mockImplementation(() => undefined)
    joinSession$.mock.resetCalls()
    joinSession$.mock.mockImplementation(() => undefined)
    info.sessions[0].apps = []
})

describe('interactive$', () => {
    it('renders the menu once and waits for input when no event arrives', () => {
        const subscription = interactive$(new Subject()).subscribe()
        assert.equal(sandboxInfo$.mock.callCount(), 1)
        subscription.unsubscribe()
    })

    it('re-fetches and re-renders the menu when a session event arrives at the prompt', () => {
        const sessionEvent$ = new Subject()
        const subscription = interactive$(sessionEvent$).subscribe()
        assert.equal(sandboxInfo$.mock.callCount(), 1)
        sessionEvent$.next({username: 'admin'})
        assert.equal(sandboxInfo$.mock.callCount(), 2)
        subscription.unsubscribe()
    })

    it('clears the screen before redrawing when a session event arrives', () => {
        const sessionEvent$ = new Subject()
        const subscription = interactive$(sessionEvent$).subscribe()
        print.mock.resetCalls()
        sandboxInfo$.mock.resetCalls()
        sessionEvent$.next({username: 'admin'})
        assert.equal(print.mock.calls[0].arguments[0], '\u001B[2J\u001B[3J\u001B[H')
        assert.equal(sandboxInfo$.mock.callCount(), 1) // re-fetch happens after the clear
        subscription.unsubscribe()
    })

    it('renders the selection prompt through prompt() so a redraw re-echoes pending input', () => {
        const sessionEvent$ = new Subject()
        const subscription = interactive$(sessionEvent$).subscribe()
        assert.equal(prompt.mock.callCount(), 1)
        assert.ok(prompt.mock.calls[0].arguments[0].includes('Select'))
        sessionEvent$.next({username: 'admin'})
        // the refresh re-issues the prompt via readline (prompt(true) semantics preserve
        // and re-display whatever the user had typed before the screen was cleared)
        assert.equal(prompt.mock.callCount(), 2)
        subscription.unsubscribe()
    })

    it('keeps refreshing on subsequent events', () => {
        const sessionEvent$ = new Subject()
        const subscription = interactive$(sessionEvent$).subscribe()
        sessionEvent$.next({username: 'admin'})
        sessionEvent$.next({username: 'admin'})
        assert.equal(sandboxInfo$.mock.callCount(), 3)
        subscription.unsubscribe()
    })

    it('asks for confirmation before stopping a session with running apps and honors refusal', async () => {
        info.sessions[0].apps = [{path: '/sandbox/shiny/foo', label: 'Foo'}]
        readLineQueue.push('1s', 'n')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        assert.equal(terminateSession$.mock.callCount(), 0)
        assert.equal(sandboxInfo$.mock.callCount(), 2) // initial render + re-render after refusal
        subscription.unsubscribe()
    })

    it('stops immediately when the session has no running apps', async () => {
        info.sessions[0].apps = []
        readLineQueue.push('1s')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        assert.equal(terminateSession$.mock.callCount(), 1)
        assert.equal(readLine$.mock.callCount(), 2) // menu prompt + re-rendered menu prompt — NO y/N prompt in between
        subscription.unsubscribe()
    })

    it('clears the screen after stopping a session, before redrawing the menu', async () => {
        readLineQueue.push('1s')
        const printsBeforeFetch = []
        sandboxInfo$.mock.mockImplementation(() => {
            printsBeforeFetch.push(print.mock.callCount())
            return of(info)
        })
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        assert.equal(terminateSession$.mock.callCount(), 1)
        const clearIndex = callsOf(print).findIndex(([text]) => text === '\u001B[2J\u001B[3J\u001B[H')
        assert.notEqual(clearIndex, -1)
        assert.ok(clearIndex < printsBeforeFetch[1]) // clear first, then re-fetch and redraw
        subscription.unsubscribe()
    })

    it('shows the unavailable notice, defaults the prompt to the failed type, and retries on Enter', async () => {
        const {of} = await import('rxjs')
        createSession$.mock.mockImplementation(() => of({unavailable: true, reason: 'INSTANCE_UNAVAILABLE'}))
        readLineQueue.push('t1', '') // select t1 → unavailable → Enter retries t1
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        const notices = callsOf(println).filter(([text]) => `${text}`.includes('currently unavailable'))
        assert.ok(notices.length >= 1)
        assert.ok(notices[0][0].includes('(t1)'))
        const prompts = callsOf(prompt).map(([text]) => text)
        assert.equal(prompts.some(text => text.includes('Select (t1)')), true) // retry default
        assert.equal(createSession$.mock.callCount(), 2) // Enter retried the same type
        subscription.unsubscribe()
    })

    it('shows the trouble-starting message for any other launch failure (quota, unclassified)', async () => {
        const {of} = await import('rxjs')
        for (const reason of ['QUOTA_EXCEEDED', 'FAILED']) {
            println.mock.resetCalls()
            createSession$.mock.mockImplementation(() => of({unavailable: true, reason}))
            readLineQueue.push('t1')
            const subscription = interactive$(NEVER).subscribe()
            await flushPromises()
            await flushPromises()
            assert.equal(
                callsOf(println).some(([text]) => `${text}`.includes('having trouble starting')),
                true
            )
            assert.equal(
                callsOf(println).some(([text]) => `${text}`.includes('unavailable from the cloud provider')),
                false
            )
            subscription.unsubscribe()
        }
    })

    it('shows the trouble-starting message when joining a session that dies mid-start', async () => {
        const {of} = await import('rxjs')
        joinSession$.mock.mockImplementation(() => of({unavailable: true, reason: 'FAILED'}))
        readLineQueue.push('1')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        assert.equal(
            callsOf(println).some(([text]) => `${text}`.includes('having trouble starting')),
            true
        )
        assert.equal(sandboxInfo$.mock.callCount(), 2) // menu re-rendered after the notice
        subscription.unsubscribe()
    })

    it('clears the screen when a session is selected, before anything else is printed', async () => {
        joinSession$.mock.mockImplementation(() => NEVER)
        readLineQueue.push('1')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        const texts = callsOf(print).map(([text]) => text)
        assert.equal(texts[0], '\u001B[2J\u001B[3J\u001B[H')
        assert.ok(texts[1].includes('Joining running session'))
        subscription.unsubscribe()
    })

    it('clears the screen when an instance type is selected', async () => {
        createSession$.mock.mockImplementation(() => NEVER)
        readLineQueue.push('t1')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        assert.equal(print.mock.calls[0].arguments[0], '\u001B[2J\u001B[3J\u001B[H')
        subscription.unsubscribe()
    })

    it('keeps the menu on screen for an invalid option', async () => {
        readLineQueue.push('nope')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        assert.ok(
            !callsOf(print).map(([text]) => text).includes('\u001B[2J\u001B[3J\u001B[H')
        )
        assert.equal(
            callsOf(println).some(([text]) => `${text}`.includes('Invalid option')),
            true
        )
        assert.equal(sandboxInfo$.mock.callCount(), 1) // re-prompt only — the menu is still there
        subscription.unsubscribe()
    })

    it('redraws the menu with a notice when the budget is too low for the selected type', async () => {
        sandboxInfo$.mock.mockImplementation(() => of({
            ...info,
            spending: {...info.spending, monthlyInstanceSpending: info.spending.monthlyInstanceBudget}
        }))
        readLineQueue.push('t1')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        assert.equal(createSession$.mock.callCount(), 0)
        assert.equal(
            callsOf(println).some(([text]) => `${text}`.includes('enough resources')),
            true
        )
        assert.equal(sandboxInfo$.mock.callCount(), 2) // the cleared menu is drawn again, not just re-prompted
        subscription.unsubscribe()
    })

    it('stops after y confirmation and prints the app list', async () => {
        info.sessions[0].apps = [{path: '/sandbox/shiny/foo', label: 'Foo'}]
        readLineQueue.push('1s', 'y')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        assert.ok(callsOf(println).some(([text]) => `${text}`.includes('Foo')))
        assert.equal(terminateSession$.mock.callCount(), 1)
        subscription.unsubscribe()
    })
})

describe('instance names', () => {
    const printed = () => callsOf(println).flat().map(t => `${t}`).join('\n')

    it('shows the instance name alongside the number', async () => {
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        assert.ok(printed().includes('crazy-banana'))
        assert.ok(printed().includes('Name'))
        subscription.unsubscribe()
    })

    it('leaves the name column empty for a session that has none', async () => {
        info.sessions[0].name = undefined
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        assert.ok(printed().includes('Name'))
        assert.ok(!printed().includes('undefined'))
        subscription.unsubscribe()
    })

    // The number is what a user TYPES; a name is a poor thing to retype over a flaky link. Adding
    // the name column must not disturb the selection grammar.
    it('still joins by number', async () => {
        const {of} = await import('rxjs')
        joinSession$.mock.mockImplementation(() => of({}))
        readLineQueue.push('1')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        assert.ok(joinSession$.mock.callCount() > 0)
        subscription.unsubscribe()
    })

    it('still stops by number with the s suffix', async () => {
        const {of} = await import('rxjs')
        joinSession$.mock.mockImplementation(() => of({}))
        readLineQueue.push('1s', 'y')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        assert.equal(terminateSession$.mock.callCount(), 1)
        subscription.unsubscribe()
    })
})

describe('instance types table', () => {
    const printed = () => callsOf(println).flat().map(t => `${t}`).join('\n')
    const rowOf = tag => printed().split('\n').find(line => line.includes(` ${tag} `))

    it('shows local SSD capacity and performance relative to t1', async () => {
        sandboxInfo$.mock.mockImplementation(() => of({...info, instanceTypes: [
            {tag: 't1', cpuCount: 2, ramGiB: 2, ssdGB: 0, performance: 1, hourlyCost: 0.0204},
            {tag: 'r4d', cpuCount: 4, ramGiB: 32, ssdGB: 237, performance: 4.3, hourlyCost: 0.3696}
        ]}))
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        assert.ok(printed().includes('GB SSD'))
        assert.match(rowOf('r4d'), /237.*4\.3x.*0\.37/)
        assert.match(rowOf('t1'), /-.*1\.0x.*0\.02/)
        subscription.unsubscribe()
    })

    it('lists instance types with SSD in a table of their own', async () => {
        sandboxInfo$.mock.mockImplementation(() => of({...info, instanceTypes: [
            {tag: 't1', cpuCount: 2, ramGiB: 2, ssdGB: 0, performance: 1, hourlyCost: 0.0204},
            {tag: 'r4d', cpuCount: 4, ramGiB: 32, ssdGB: 237, performance: 4.3, hourlyCost: 0.3696}
        ]}))
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        const lines = printed().split('\n')
        const index = text => lines.findIndex(line => line.includes(text))
        assert.ok(index('without SSD') < index(' t1 '))
        assert.ok(index(' t1 ') < index('with SSD'))
        assert.ok(index('with SSD') < index(' r4d '))
        assert.ok(index('with SSD') < index('SSD storage is available under /tmp'))
        assert.ok(
            index('SSD storage is available under /tmp') < lines.findLastIndex(line => line.includes(' Type '))
        )
        subscription.unsubscribe()
    })

    it('fits the SSD explanation within the width of the table', async () => {
        sandboxInfo$.mock.mockImplementation(() => of({...info, instanceTypes: [
            {tag: 'r4d', cpuCount: 4, ramGiB: 32, ssdGB: 237, performance: 4.3, hourlyCost: 0.3696}
        ]}))
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        const ssdTable = callsOf(println).flat().map(t => `${t}`).find(text => text.includes('with SSD'))
        const widths = ssdTable.trim().split('\n').map(line => line.length)
        assert.equal(new Set(widths).size, 1)
        subscription.unsubscribe()
    })

    it('explains the SSD storage only when there are instance types with SSD', async () => {
        sandboxInfo$.mock.mockImplementation(() => of({...info, instanceTypes: [
            {tag: 't1', cpuCount: 2, ramGiB: 2, ssdGB: 0, performance: 1, hourlyCost: 0.0204}
        ]}))
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        assert.ok(!printed().includes('SSD storage'))
        subscription.unsubscribe()
    })
})
