import {describe, expect, it, vi} from 'vitest'

// appSessionMonitor imports ~/api/ws for event$; importing the real module
// triggers a live WebSocket connection (needs window._sepal_global_), which
// isn't set up in the test environment — stub it so we can exercise the
// pure handlers below without pulling that in. Same for the api registry
// (re-assert), translate and notifications (takeover message).
vi.mock('~/api/ws', () => ({
    event$: {pipe: () => ({subscribe: () => ({unsubscribe: () => {}})})},
    clientId$: {subscribe: () => ({unsubscribe: () => {}})},
    getClientId: () => undefined
}))
vi.mock('~/apiRegistry', () => ({default: {apps: {}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/notifications', () => ({Notifications: {warning: () => {}}}))

import {closeTabsForClosedSessions, closeTabsForDissociatedApp, closeTabsForSession, createReportSweep, createSessionReassert} from './appSessionMonitor'

describe('closeTabsForSession', () => {
    it('closes only tabs on the closed session', () => {
        const closeTab = vi.fn()
        const tabs = [
            {id: 't1', sessionId: 's-1'},
            {id: 't2', sessionId: 's-2'},
            {id: 't3'} // landing tab / docker app — no sessionId
        ]
        closeTabsForSession('s-1', tabs, closeTab)
        expect(closeTab).toHaveBeenCalledTimes(1)
        expect(closeTab).toHaveBeenCalledWith('t1', 'apps')
    })

    it('closes nothing when the sessionId is undefined (never matches sessionId-less tabs)', () => {
        const closeTab = vi.fn()
        const tabs = [
            {id: 't1', sessionId: 's-1'},
            {id: 't2'} // landing / docker app — no sessionId
        ]
        closeTabsForSession(undefined, tabs, closeTab)
        expect(closeTab).not.toHaveBeenCalled()
    })
})

describe('closeTabsForClosedSessions', () => {
    it('closes a tab whose session was seen earlier and is now absent', () => {
        const closeTab = vi.fn()
        const seen = new Set(['s-1'])
        const tabs = [{id: 't1', sessionId: 's-1'}, {id: 't3'}]
        closeTabsForClosedSessions([{id: 's-2'}], tabs, seen, closeTab)
        expect(closeTab).toHaveBeenCalledTimes(1)
        expect(closeTab).toHaveBeenCalledWith('t1', 'apps')
    })

    it('does NOT close a freshly stamped tab whose session was never seen in a report', () => {
        const closeTab = vi.fn()
        const seen = new Set()
        // t1 was just stamped with s-1; the report (polled) does not know it yet
        closeTabsForClosedSessions([{id: 's-other'}], [{id: 't1', sessionId: 's-1'}], seen, closeTab)
        expect(closeTab).not.toHaveBeenCalled()
    })

    it('adds the current report ids to the seen set', () => {
        const seen = new Set()
        closeTabsForClosedSessions([{id: 's-1'}, {id: 's-2'}], [], seen, vi.fn())
        expect(seen.has('s-1')).toBe(true)
        expect(seen.has('s-2')).toBe(true)
    })

    it('does nothing while the report is not loaded', () => {
        const closeTab = vi.fn()
        closeTabsForClosedSessions(undefined, [{id: 't1', sessionId: 's-1'}], new Set(), closeTab)
        expect(closeTab).not.toHaveBeenCalled()
    })
})

describe('closeTabsForDissociatedApp', () => {
    it('closes only the tab running the dissociated app and notifies once', () => {
        const close = vi.fn()
        const notify = vi.fn()
        const tabs = [
            {id: 't1', path: '/sandbox/shiny/foo', title: 'Foo', sessionId: 's-1'},
            {id: 't2', path: '/sandbox/shiny/bar', title: 'Bar', sessionId: 's-1'},
            {id: 't3'} // landing tab
        ]
        closeTabsForDissociatedApp('/sandbox/shiny/foo', tabs, close, notify)
        expect(close).toHaveBeenCalledTimes(1)
        expect(close).toHaveBeenCalledWith('t1', 'apps')
        expect(notify).toHaveBeenCalledTimes(1)
        expect(notify).toHaveBeenCalledWith('Foo')
    })

    it('does nothing when no tab runs the app', () => {
        const close = vi.fn()
        const notify = vi.fn()
        closeTabsForDissociatedApp('/sandbox/shiny/ghost', [{id: 't1', path: '/sandbox/shiny/foo'}], close, notify)
        expect(close).not.toHaveBeenCalled()
        expect(notify).not.toHaveBeenCalled()
    })

    it('does nothing without an appPath (must not match path-less tabs)', () => {
        const close = vi.fn()
        closeTabsForDissociatedApp(undefined, [{id: 't1'}], close, vi.fn())
        expect(close).not.toHaveBeenCalled()
    })
})

describe('createSessionReassert', () => {
    const apps = () => [
        {path: '/sandbox/shiny/foo', label: 'Foo', endpoint: 'shiny'},
        {path: '/sandbox/jupyter/lab', label: 'Jupyter Lab', endpoint: 'jupyter'}
    ]
    const request = () => vi.fn(() => ({subscribe: () => {}}))

    it('does not re-assert on the FIRST clientId (nothing was released before it)', () => {
        const requestSession$ = request()
        const reassert = createSessionReassert(requestSession$, apps)
        reassert('c-1', [{id: 't1', path: '/sandbox/shiny/foo', sessionId: 's-1'}])
        expect(requestSession$).not.toHaveBeenCalled()
    })

    it('re-asserts each open app tab when the clientId CHANGES (ws reconnected)', () => {
        const requestSession$ = request()
        const reassert = createSessionReassert(requestSession$, apps)
        const tabs = [
            {id: 't1', path: '/sandbox/shiny/foo', sessionId: 's-1'},
            {id: 't2', path: '/sandbox/jupyter/lab', sessionId: 's-2'},
            {id: 't3'}, // landing tab — no path
            {id: 't4', path: '/sandbox/shiny/unstamped'} // no sessionId yet
        ]
        reassert('c-1', tabs)
        reassert('c-2', tabs)
        expect(requestSession$).toHaveBeenCalledTimes(2)
        expect(requestSession$).toHaveBeenCalledWith({endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: 'Foo', sessionId: 's-1', reassert: true})
        expect(requestSession$).toHaveBeenCalledWith({endpoint: 'jupyter', appPath: '/sandbox/jupyter/lab', appLabel: 'Jupyter Lab', sessionId: 's-2', reassert: true})
    })

    it('does not re-assert when the same clientId is re-delivered', () => {
        const requestSession$ = request()
        const reassert = createSessionReassert(requestSession$, apps)
        const tabs = [{id: 't1', path: '/sandbox/shiny/foo', sessionId: 's-1'}]
        reassert('c-1', tabs)
        reassert('c-1', tabs)
        expect(requestSession$).not.toHaveBeenCalled()
    })

    it('re-asserts an app missing from the catalog with just path and sessionId', () => {
        const requestSession$ = request()
        const reassert = createSessionReassert(requestSession$, () => [])
        reassert('c-1', [])
        reassert('c-2', [{id: 't1', path: '/sandbox/shiny/gone', sessionId: 's-1'}])
        expect(requestSession$).toHaveBeenCalledWith({endpoint: undefined, appPath: '/sandbox/shiny/gone', appLabel: undefined, sessionId: 's-1', reassert: true})
    })

    // The whole point of the flag: a reconnect nobody caused must not extend the session's
    // deadline, so every re-assert has to carry it.
    it('marks every re-assert as a re-assert', () => {
        const requestSession$ = request()
        const reassert = createSessionReassert(requestSession$, apps)
        const tabs = [{id: 't1', path: '/sandbox/shiny/foo', sessionId: 's-1'}]
        reassert('c-1', tabs)
        reassert('c-2', tabs)
        expect(requestSession$.mock.calls.every(([{reassert}]) => reassert === true)).toBe(true)
    })
})

describe('createReportSweep', () => {
    it('survives a stamped tab across a report that never contained its session (Fix 1 / Fix 4)', () => {
        const closeTab = vi.fn()
        const sweep = createReportSweep(closeTab)
        const tabs = [{id: 't1', sessionId: 's-1'}]
        // stale report delivered right after the tab was stamped — must not close it
        sweep([{id: 's-other'}], tabs)
        expect(closeTab).not.toHaveBeenCalled()
    })

    it('closes a tab once its (previously seen) session disappears from a fresh report (Fix 1 / Fix 4)', () => {
        const closeTab = vi.fn()
        const sweep = createReportSweep(closeTab)
        const tabs = [{id: 't1', sessionId: 's-1'}]
        sweep([{id: 's-1'}], tabs) // report now knows s-1 → seen, still open, survives
        expect(closeTab).not.toHaveBeenCalled()
        sweep([{id: 's-9'}], tabs) // fresh report: s-1 gone → close
        expect(closeTab).toHaveBeenCalledTimes(1)
        expect(closeTab).toHaveBeenCalledWith('t1', 'apps')
    })

    it('does nothing while the report is not loaded', () => {
        const closeTab = vi.fn()
        const sweep = createReportSweep(closeTab)
        sweep(undefined, [{id: 't1', sessionId: 's-1'}])
        expect(closeTab).not.toHaveBeenCalled()
    })

    it('skips re-delivery of the same report reference (no duplicate work)', () => {
        const closeTab = vi.fn()
        const sweep = createReportSweep(closeTab)
        const tabs = [{id: 't1', sessionId: 's-1'}]
        sweep([{id: 's-1'}], tabs) // seen s-1
        const laterReport = [{id: 's-9'}] // s-1 gone
        sweep(laterReport, tabs)
        expect(closeTab).toHaveBeenCalledTimes(1)
        sweep(laterReport, tabs) // same reference re-delivered by an unrelated dispatch
        expect(closeTab).toHaveBeenCalledTimes(1) // not called again
    })
})
