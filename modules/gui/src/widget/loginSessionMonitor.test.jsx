import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// The gateway sends this event to the tabs of a login session it has just destroyed (logout in
// another tab, a password reset elsewhere, an admin lock). The tab must not linger on a page it is
// no longer authorized for: it reloads, and lands wherever the browser's current cookie says.

const event$ = new Subject()
vi.mock('~/api/ws', () => ({event$}))

const {LoginSessionMonitor} = await import('./loginSessionMonitor')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('LoginSessionMonitor', () => {
    let root, replace

    beforeEach(() => {
        replace = vi.fn()
        vi.spyOn(window, 'location', 'get').mockReturnValue({replace})
        root = createRoot(document.body.appendChild(document.createElement('div')))
        act(() => root.render(<LoginSessionMonitor/>))
    })

    afterEach(() => {
        act(() => root.unmount())
        vi.restoreAllMocks()
    })

    it('reloads the app when its login session is invalidated', () => {
        act(() => event$.next({type: 'loginSessionInvalidated'}))

        expect(replace).toHaveBeenCalledWith('/')
    })

    it('ignores other events', () => {
        act(() => event$.next({type: 'clientVersionMismatch'}))

        expect(replace).not.toHaveBeenCalled()
    })
})
