import {jest} from '@jest/globals'
import {NEVER, of, Subject} from 'rxjs'

const sandboxInfo$ = jest.fn()
const terminateSession$ = jest.fn()
const createSession$ = jest.fn()
const joinSession$ = jest.fn()

jest.unstable_mockModule('./endpoint.js', () => ({
    sandboxInfo$,
    createSession$,
    joinSession$,
    terminateSession$
}))

const readLineQueue = []
const readLine$ = jest.fn(() => readLineQueue.length ? of(readLineQueue.shift()) : NEVER)
const print = jest.fn()
const println = jest.fn()

const prompt = jest.fn()

jest.unstable_mockModule('./console.js', () => ({
    print,
    println,
    prompt,
    format: text => `${text}`,
    highlight: text => `${text}`,
    readLine$
}))

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
    sandboxInfo$.mockReset()
    sandboxInfo$.mockImplementation(() => of(info))
    terminateSession$.mockReset()
    terminateSession$.mockImplementation(() => of({}))
    readLineQueue.length = 0
    readLine$.mockClear()
    print.mockClear()
    println.mockClear()
    prompt.mockClear()
    createSession$.mockReset()
    joinSession$.mockReset()
    info.sessions[0].apps = []
})

describe('interactive$', () => {
    it('renders the menu once and waits for input when no event arrives', () => {
        const subscription = interactive$(new Subject()).subscribe()
        expect(sandboxInfo$).toHaveBeenCalledTimes(1)
        subscription.unsubscribe()
    })

    it('re-fetches and re-renders the menu when a session event arrives at the prompt', () => {
        const sessionEvent$ = new Subject()
        const subscription = interactive$(sessionEvent$).subscribe()
        expect(sandboxInfo$).toHaveBeenCalledTimes(1)
        sessionEvent$.next({username: 'admin'})
        expect(sandboxInfo$).toHaveBeenCalledTimes(2)
        subscription.unsubscribe()
    })

    it('clears the screen before redrawing when a session event arrives', () => {
        const sessionEvent$ = new Subject()
        const subscription = interactive$(sessionEvent$).subscribe()
        print.mockClear()
        sandboxInfo$.mockClear()
        sessionEvent$.next({username: 'admin'})
        expect(print.mock.calls[0][0]).toBe('\u001B[2J\u001B[3J\u001B[H')
        expect(sandboxInfo$).toHaveBeenCalledTimes(1) // re-fetch happens after the clear
        subscription.unsubscribe()
    })

    it('renders the selection prompt through prompt() so a redraw re-echoes pending input', () => {
        const sessionEvent$ = new Subject()
        const subscription = interactive$(sessionEvent$).subscribe()
        expect(prompt).toHaveBeenCalledTimes(1)
        expect(prompt.mock.calls[0][0]).toContain('Select')
        sessionEvent$.next({username: 'admin'})
        // the refresh re-issues the prompt via readline (prompt(true) semantics preserve
        // and re-display whatever the user had typed before the screen was cleared)
        expect(prompt).toHaveBeenCalledTimes(2)
        subscription.unsubscribe()
    })

    it('keeps refreshing on subsequent events', () => {
        const sessionEvent$ = new Subject()
        const subscription = interactive$(sessionEvent$).subscribe()
        sessionEvent$.next({username: 'admin'})
        sessionEvent$.next({username: 'admin'})
        expect(sandboxInfo$).toHaveBeenCalledTimes(3)
        subscription.unsubscribe()
    })

    it('asks for confirmation before stopping a session with running apps and honors refusal', async () => {
        info.sessions[0].apps = [{path: '/sandbox/shiny/foo', label: 'Foo'}]
        readLineQueue.push('1s', 'n')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        expect(terminateSession$).not.toHaveBeenCalled()
        expect(sandboxInfo$).toHaveBeenCalledTimes(2) // initial render + re-render after refusal
        subscription.unsubscribe()
    })

    it('stops immediately when the session has no running apps', async () => {
        info.sessions[0].apps = []
        readLineQueue.push('1s')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        expect(terminateSession$).toHaveBeenCalledTimes(1)
        expect(readLine$).toHaveBeenCalledTimes(2) // menu prompt + re-rendered menu prompt — NO y/N prompt in between
        subscription.unsubscribe()
    })

    it('clears the screen after stopping a session, before redrawing the menu', async () => {
        readLineQueue.push('1s')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        expect(terminateSession$).toHaveBeenCalledTimes(1)
        const clearIndex = print.mock.calls.findIndex(([text]) => text === '\u001B[2J\u001B[3J\u001B[H')
        expect(clearIndex).not.toBe(-1)
        expect(print.mock.invocationCallOrder[clearIndex])
            .toBeLessThan(sandboxInfo$.mock.invocationCallOrder[1]) // clear first, then re-fetch and redraw
        subscription.unsubscribe()
    })

    it('shows the unavailable notice, defaults the prompt to the failed type, and retries on Enter', async () => {
        const {of} = await import('rxjs')
        createSession$.mockReturnValue(of({unavailable: true, reason: 'INSTANCE_UNAVAILABLE'}))
        readLineQueue.push('t1', '') // select t1 → unavailable → Enter retries t1
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        const notices = println.mock.calls.filter(([text]) => `${text}`.includes('currently unavailable'))
        expect(notices.length).toBeGreaterThanOrEqual(1)
        expect(notices[0][0]).toContain('(t1)')
        const prompts = prompt.mock.calls.map(([text]) => text)
        expect(prompts.some(text => text.includes('Select (t1)'))).toBe(true) // retry default
        expect(createSession$).toHaveBeenCalledTimes(2) // Enter retried the same type
        subscription.unsubscribe()
    })

    it('shows the trouble-starting message for any other launch failure (quota, unclassified)', async () => {
        const {of} = await import('rxjs')
        for (const reason of ['QUOTA_EXCEEDED', 'FAILED']) {
            println.mockClear()
            createSession$.mockReturnValue(of({unavailable: true, reason}))
            readLineQueue.push('t1')
            const subscription = interactive$(NEVER).subscribe()
            await flushPromises()
            await flushPromises()
            expect(println.mock.calls.some(([text]) => `${text}`.includes('having trouble starting'))).toBe(true)
            expect(println.mock.calls.some(([text]) => `${text}`.includes('unavailable from the cloud provider'))).toBe(false)
            subscription.unsubscribe()
        }
    })

    it('shows the trouble-starting message when joining a session that dies mid-start', async () => {
        const {of} = await import('rxjs')
        joinSession$.mockReturnValue(of({unavailable: true, reason: 'FAILED'}))
        readLineQueue.push('1')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        expect(println.mock.calls.some(([text]) => `${text}`.includes('having trouble starting'))).toBe(true)
        expect(sandboxInfo$).toHaveBeenCalledTimes(2) // menu re-rendered after the notice
        subscription.unsubscribe()
    })

    it('stops after y confirmation and prints the app list', async () => {
        info.sessions[0].apps = [{path: '/sandbox/shiny/foo', label: 'Foo'}]
        readLineQueue.push('1s', 'y')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        expect(println).toHaveBeenCalledWith(expect.stringContaining('Foo'))
        expect(terminateSession$).toHaveBeenCalledTimes(1)
        subscription.unsubscribe()
    })
})

describe('instance names', () => {
    const printed = () => println.mock.calls.flat().map(t => `${t}`).join('\n')

    it('shows the instance name alongside the number', async () => {
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        expect(printed()).toContain('crazy-banana')
        expect(printed()).toContain('Name')
        subscription.unsubscribe()
    })

    it('leaves the name column empty for a session that has none', async () => {
        info.sessions[0].name = undefined
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        expect(printed()).toContain('Name')
        expect(printed()).not.toContain('undefined')
        subscription.unsubscribe()
    })

    // The number is what a user TYPES; a name is a poor thing to retype over a flaky link. Adding
    // the name column must not disturb the selection grammar.
    it('still joins by number', async () => {
        const {of} = await import('rxjs')
        joinSession$.mockReturnValue(of({}))
        readLineQueue.push('1')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        expect(joinSession$).toHaveBeenCalled()
        subscription.unsubscribe()
    })

    it('still stops by number with the s suffix', async () => {
        const {of} = await import('rxjs')
        joinSession$.mockReturnValue(of({}))
        readLineQueue.push('1s', 'y')
        const subscription = interactive$(NEVER).subscribe()
        await flushPromises()
        await flushPromises()
        expect(terminateSession$).toHaveBeenCalledTimes(1)
        subscription.unsubscribe()
    })
})
