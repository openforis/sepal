import {firstValueFrom, of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// A fake of the gateway's login session as the browser sees it. The gateway keeps the session the
// browser already has and relabels it on login, so a reset submitted from a browser logged in as
// someone else must first drop that session — otherwise the other account's tabs silently become
// the reset account. The reset endpoint is a switch the test flips.

const browser = {session: null}
const server = {resetAccepted: true, destroyedSessions: [], otherSessionsInvalidatedFor: []}
let nextSessionId = 1
vi.mock('~/apiRegistry', () => ({
    default: {
        user: {
            resetPassword$: () => server.resetAccepted ? of({}) : throwError(() => new Error('Invalid token')),
            logout$: () => {
                if (browser.session) {
                    server.destroyedSessions.push(browser.session.id)
                    browser.session = null
                }
                return of({status: 'success'})
            },
            login$: ({username}) => {
                browser.session = {id: browser.session?.id ?? `s${nextSessionId++}`, username}
                return of({username})
            },
            invalidateOtherSessions$: () => {
                server.otherSessionsInvalidatedFor.push(browser.session?.username)
                return of({status: 'success'})
            }
        }
    }
}))

vi.mock('~/action-builder', () => ({
    actionBuilder: () => ({
        assign() {
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

const {resetPassword$} = await import('./user')

const RESET = {token: 't-1', username: 'bob', password: 'new-password-123', type: 'reset', recaptchaToken: 'r'}

// The flow waits a couple of seconds between the reset and the login; the settled promise is
// taken before flushing the timers so a synchronous rejection is not reported as unhandled.
const runToCompletion = async observable => {
    const result = firstValueFrom(observable)
    result.catch(() => {})
    await vi.runAllTimersAsync()
    return result
}

describe('resetPassword$', () => {
    const ALICE_SESSION = {id: 's-alice', username: 'alice'}

    beforeEach(() => {
        vi.useFakeTimers()
        browser.session = {...ALICE_SESSION}
        server.resetAccepted = true
        server.destroyedSessions.length = 0
        server.otherSessionsInvalidatedFor.length = 0
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('drops the session of the account the browser was logged in as', async () => {
        await runToCompletion(resetPassword$(RESET))

        expect(server.destroyedSessions).toEqual([ALICE_SESSION.id])
    })

    it('ends logged in as the reset account, in a fresh session', async () => {
        const user = await runToCompletion(resetPassword$(RESET))

        expect(user).toEqual({username: 'bob'})
        expect(browser.session).toMatchObject({username: 'bob'})
        expect(browser.session.id).not.toBe(ALICE_SESSION.id)
    })

    it('invalidates the other sessions of the reset account, not of the account logged out', async () => {
        await runToCompletion(resetPassword$(RESET))

        expect(server.otherSessionsInvalidatedFor).toEqual(['bob'])
    })

    it('leaves the current session untouched when the reset is rejected', async () => {
        server.resetAccepted = false

        await expect(runToCompletion(resetPassword$(RESET))).rejects.toThrow('Invalid token')
        expect(browser.session).toEqual(ALICE_SESSION)
        expect(server.destroyedSessions).toEqual([])
    })
})
