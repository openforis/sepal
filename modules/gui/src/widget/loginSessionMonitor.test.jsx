import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// The gateway sends this event to the tabs of a login session it has just replaced or destroyed
// (a password reset in another tab, a logout, an admin lock). The tab must not linger on a page it
// is no longer authorized for: it reloads, and lands wherever the browser's current cookie says.
// When that is another account, the user is told, since nothing in this tab asked for it.

const event$ = new Subject()
vi.mock('~/api/ws', () => ({event$}))

const store = {user: {username: 'alice'}}
vi.mock('~/user', () => ({currentUser: () => store.user}))

const notifications = []
vi.mock('~/widget/notifications', () => ({Notifications: {info: notification => notifications.push(notification)}}))
vi.mock('~/translate', () => ({msg: (key, values) => `${key} ${JSON.stringify(values)}`}))

const {LoginSessionMonitor} = await import('./loginSessionMonitor')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('LoginSessionMonitor', () => {
    let root, replace

    const mount = () => {
        root = createRoot(document.body.appendChild(document.createElement('div')))
        act(() => root.render(<LoginSessionMonitor/>))
    }

    beforeEach(() => {
        replace = vi.fn()
        vi.spyOn(window, 'location', 'get').mockReturnValue({replace})
        window.sessionStorage.clear()
        notifications.length = 0
        store.user = {username: 'alice'}
    })

    afterEach(() => {
        act(() => root.unmount())
        vi.restoreAllMocks()
    })

    describe('when the login session is invalidated', () => {
        it('reloads the app', () => {
            mount()

            act(() => event$.next({type: 'loginSessionInvalidated'}))

            expect(replace).toHaveBeenCalledWith('/')
        })

        it('leaves the tab a note of who it was logged in as, for after the reload', () => {
            mount()

            act(() => event$.next({type: 'loginSessionInvalidated'}))

            expect(window.sessionStorage.getItem('loginSession.previousUsername')).toBe('alice')
        })

        it('ignores other events', () => {
            mount()

            act(() => event$.next({type: 'clientVersionMismatch'}))

            expect(replace).not.toHaveBeenCalled()
        })
    })

    describe('after the reload', () => {
        it('tells the user when the tab is now logged in as another account', () => {
            window.sessionStorage.setItem('loginSession.previousUsername', 'alice')
            store.user = {username: 'bob'}

            mount()

            expect(notifications).toEqual([
                expect.objectContaining({message: 'home.loginSession.switched {"username":"bob"}', timeout: 0})
            ])
        })

        it('consumes the note, so a later reload says nothing', () => {
            window.sessionStorage.setItem('loginSession.previousUsername', 'alice')
            store.user = {username: 'bob'}

            mount()

            expect(window.sessionStorage.getItem('loginSession.previousUsername')).toBeNull()
        })

        it('says nothing when the tab is logged in as the same account', () => {
            window.sessionStorage.setItem('loginSession.previousUsername', 'alice')

            mount()

            expect(notifications).toEqual([])
        })

        it('says nothing without a note', () => {
            mount()

            expect(notifications).toEqual([])
        })
    })
})
