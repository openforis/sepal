import {firstValueFrom, of, throwError} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// A fake of the gateway's login session as the browser sees it: a login on a session held by another
// user replaces that session (its id is destroyed, a fresh one is issued), a login on a free session
// fills it. An accepted reset logs in as the account its token belongs to; the test flips whether it is accepted. The browser's session must never be
// dropped by the client itself: the gateway kicks the other account's tabs only once the login
// response has gone out, so their reload lands as the new user.

const browser = {session: null}
const server = {resetAccepted: true, resetUsername: 'bob', oldPassword: 'old-password', destroyedSessions: [], logins: 0, logouts: 0, otherSessionsInvalidatedFor: []}
let nextSessionId = 1
const logInAs = username => {
    if (browser.session && browser.session.username !== username) {
        server.destroyedSessions.push(browser.session.id)
        browser.session = null
    }
    browser.session = {id: browser.session?.id ?? `s${nextSessionId++}`, username}
    return {username}
}
vi.mock('~/apiRegistry', () => ({
    default: {
        user: {
            loadCurrentUser$: () => of(browser.session ? {username: browser.session.username} : null),
            changePassword$: ({oldPassword}) => of(oldPassword === server.oldPassword
                ? {status: 'success', message: 'Password changed'}
                : {status: 'failure', message: 'Invalid old password'}),
            resetPassword$: () => server.resetAccepted
                ? of(logInAs(server.resetUsername))
                : throwError(() => new Error('Invalid token')),
            logout$: () => {
                server.logouts++
                browser.session = null
                return of({status: 'success'})
            },
            login$: ({username}) => {
                server.logins++
                return of(logInAs(username))
            },
            invalidateOtherSessions$: () => {
                server.otherSessionsInvalidatedFor.push(browser.session?.username)
                return of({status: 'success'})
            }
        }
    }
}))

const assigned = []
vi.mock('~/action-builder', () => ({
    actionBuilder: () => ({
        assign(path, value) {
            assigned.push({path, value})
            return this
        },
        set() {
            return this
        },
        del() {
            return this
        },
        dispatch() {}
    })
}))

vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/eventPublisher', () => ({publishCurrentUserEvent: () => {}, publishEvent: () => {}}))
vi.mock('~/store', () => ({select: () => undefined}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}, warning: () => {}}}))

const {changeCurrentUserPassword$, login$, logout$, resetPassword$, startLoggedOff$} = await import('./user')
const {notePreviousUsername, takePreviousUsername} = await import('./loginSession')

const RESET = {token: 't-1', password: 'new-password-123', type: 'reset', recaptchaToken: 'r'}

describe('startLoggedOff$', () => {
    const userState = () => assigned.find(({path}) => path === 'user')?.value

    beforeEach(() => {
        assigned.length = 0
        window.sessionStorage.clear()
    })

    it('initializes the app logged off, whoever the browser is logged in as', async () => {
        browser.session = {id: 's-alice', username: 'alice'}

        await firstValueFrom(startLoggedOff$())

        expect(userState()).toEqual({currentUser: null, initialized: true, loggedOn: false})
    })

    it('leaves the tab a note of who the browser was logged in as', async () => {
        browser.session = {id: 's-alice', username: 'alice'}

        await firstValueFrom(startLoggedOff$())

        expect(takePreviousUsername()).toBe('alice')
    })

    it('leaves no note when nobody is logged in', async () => {
        browser.session = null

        await firstValueFrom(startLoggedOff$())

        expect(takePreviousUsername()).toBeNull()
    })
})

describe('login$', () => {
    it('discards the note of who the browser was logged in as: the user chose this account', async () => {
        notePreviousUsername('alice')
        browser.session = null

        await firstValueFrom(login$({username: 'bob', password: 'bob-pw'}, 'r'))

        expect(takePreviousUsername()).toBeNull()
    })
})

describe('logout$', () => {
    it('discards the note of who the browser was logged in as: nothing is to be told after a logout', async () => {
        notePreviousUsername('alice')
        vi.spyOn(document, 'location', 'set').mockImplementation(() => {})

        await firstValueFrom(logout$())

        expect(takePreviousUsername()).toBeNull()
    })
})

describe('changeCurrentUserPassword$', () => {
    beforeEach(() => {
        browser.session = {id: 's-alice', username: 'alice'}
        server.otherSessionsInvalidatedFor.length = 0
    })

    it('reports success and invalidates the other sessions when the old password is right', async () => {
        const result = await firstValueFrom(changeCurrentUserPassword$({oldPassword: server.oldPassword, newPassword: 'new-password-123'}))

        expect(result.status).toBe('success')
        expect(server.otherSessionsInvalidatedFor).toEqual(['alice'])
    })

    it('reports the failure and leaves the other sessions alone when the old password is wrong', async () => {
        const result = await firstValueFrom(changeCurrentUserPassword$({oldPassword: 'wrong', newPassword: 'new-password-123'}))

        expect(result.status).toBe('failure')
        expect(server.otherSessionsInvalidatedFor).toEqual([])
    })
})

describe('resetPassword$', () => {
    const ALICE_SESSION = {id: 's-alice', username: 'alice'}

    beforeEach(() => {
        browser.session = {...ALICE_SESSION}
        server.resetAccepted = true
        server.destroyedSessions.length = 0
        server.logins = 0
        server.logouts = 0
        server.otherSessionsInvalidatedFor.length = 0
    })

    it('ends logged in as the reset account, in a fresh session', async () => {
        const user = await firstValueFrom(resetPassword$(RESET))

        expect(user).toEqual({username: 'bob'})
        expect(browser.session).toMatchObject({username: 'bob'})
        expect(browser.session.id).not.toBe(ALICE_SESSION.id)
    })

    it('needs no separate login, which the login throttle could refuse', async () => {
        await firstValueFrom(resetPassword$(RESET))

        expect(server.logins).toBe(0)
    })

    it('lets the reset replace the other account\'s session, without logging out first', async () => {
        await firstValueFrom(resetPassword$(RESET))

        expect(server.logouts).toBe(0)
        expect(server.destroyedSessions).toEqual([ALICE_SESSION.id])
    })

    it('invalidates the other sessions of the reset account, not of the account replaced', async () => {
        await firstValueFrom(resetPassword$(RESET))

        expect(server.otherSessionsInvalidatedFor).toEqual(['bob'])
    })

    it('keeps the note of who the browser was logged in as, so the switch is told', async () => {
        notePreviousUsername('alice')

        await firstValueFrom(resetPassword$(RESET))

        expect(takePreviousUsername()).toBe('alice')
    })

    it('leaves the current session untouched when the reset is rejected', async () => {
        server.resetAccepted = false

        await expect(firstValueFrom(resetPassword$(RESET))).rejects.toThrow('Invalid token')
        expect(browser.session).toEqual(ALICE_SESSION)
        expect(server.destroyedSessions).toEqual([])
    })
})
