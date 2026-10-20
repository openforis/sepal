import {Observable, Subject} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {ListingRefresh} from './listingRefresh'

// When the recipe listing is refreshed, and what a refresh publishes. The session is a plain holder of the listing
// and its state; the clock moves only when a test says so; storage answers only when a test says so.

const MINUTE = 60000

describe('a consumer opening', () => {
    it('refreshes a listing older than a minute at once', () => {
        const session = sessionWith({checkedAt: 0})
        session.advance(MINUTE)

        session.refresher.refresh({maxAgeMs: MINUTE})

        expect(session.requests).toHaveLength(1)
    })

    it('leaves a younger listing alone', () => {
        const session = sessionWith({checkedAt: 0})
        session.advance(MINUTE - 1)

        session.refresher.refresh({maxAgeMs: MINUTE})

        expect(session.requests).toHaveLength(0)
    })

    it('joins a refresh already in flight rather than starting another', () => {
        const session = sessionWith({checkedAt: 0})
        session.advance(MINUTE)

        session.refresher.refresh({maxAgeMs: MINUTE})
        session.refresher.refresh({maxAgeMs: MINUTE})
        session.refresher.refresh()

        expect(session.requests).toHaveLength(1)
    })

    it('starts nothing while the session\'s first listing is still loading', () => {
        const session = sessionWith({refreshing: true})

        session.refresher.refresh({maxAgeMs: MINUTE})

        expect(session.requests).toHaveLength(0)
    })
})

describe('while outputs are watched', () => {
    it('refreshes the listing half a minute before Retrieve\'s authority lapses', () => {
        const session = sessionWith({checkedAt: 0})
        session.refresher.watch(true)

        session.advance(4.5 * MINUTE - 1)
        expect(session.requests).toHaveLength(0)
        session.advance(1)

        expect(session.requests).toHaveLength(1)
    })

    it('publishes the lapse when the refresh has not renewed the listing in time', () => {
        const session = sessionWith({checkedAt: 0})
        session.refresher.watch(true)

        session.advance(5 * MINUTE)

        expect(session.state.listingState).toMatchObject({refreshing: true, expired: true})
    })

    it('renews it when the refresh answers, dated from when it was asked', () => {
        const session = sessionWith({checkedAt: 0})
        session.refresher.watch(true)
        session.advance(4.5 * MINUTE)

        session.advance(10000)
        session.answer([])

        expect(session.state.listingState).toMatchObject({checkedAt: 4.5 * MINUTE, expired: false, refreshing: false})
    })

    it('refreshes on the browser becoming visible or reconnecting, if the listing is over a minute old', () => {
        const session = sessionWith({checkedAt: 0})
        session.refresher.watch(true)

        session.advance(MINUTE - 1)
        session.wake()
        expect(session.requests).toHaveLength(0)
        session.advance(1)
        session.wake()

        expect(session.requests).toHaveLength(1)
    })

    it('is kept recent from when the session\'s first listing arrives, when watching began before it', () => {
        const session = sessionWith({refreshing: true})
        session.refresher.watch(true)

        session.advance(MINUTE)
        session.redate({checkedAt: MINUTE})
        session.advance(4.5 * MINUTE)

        expect(session.requests).toHaveLength(1)
    })

    it('does nothing once nothing is watched', () => {
        const session = sessionWith({checkedAt: 0})
        session.refresher.watch(true)
        session.refresher.watch(false)

        session.advance(10 * MINUTE)
        session.wake()

        expect(session.requests).toHaveLength(0)
        expect(session.state.listingState.expired).toBeUndefined()
    })
})

describe('a refresh that fails', () => {
    it('is published and kept, and is not retried before the next scheduled refresh', () => {
        const session = sessionWith({checkedAt: 0})
        session.refresher.watch(true)
        session.advance(4.5 * MINUTE)

        session.fail(new Error('unreachable'))
        session.advance(4.5 * MINUTE - 1)

        expect(session.state.listingState).toMatchObject({failure: {message: 'unreachable'}, refreshing: false})
        expect(session.requests).toHaveLength(1)
        session.advance(1)
        expect(session.requests).toHaveLength(2)
    })

    it('is attempted again on the bounded schedule when no listing has ever succeeded', () => {
        const session = sessionWith({})
        session.refresher.watch(true)
        session.refresher.refresh()
        session.fail(new Error('offline'))

        session.advance(4.5 * MINUTE)

        expect(session.requests).toHaveLength(2)
    })

    it('is attempted again on that schedule when the session\'s own first listing failed', () => {
        const session = sessionWith({refreshing: true})
        session.refresher.watch(true)

        session.redate({failure: {message: 'offline', at: MINUTE}})
        session.advance(MINUTE + 4.5 * MINUTE)

        expect(session.requests).toHaveLength(1)
    })

    it('is cleared by the next success', () => {
        const session = sessionWith({checkedAt: 0})
        session.refresher.refresh()
        session.fail(new Error('unreachable'))

        session.refresher.refresh()
        session.answer([])

        expect(session.state.listingState.failure).toBeNull()
    })
})

// A session holding a listing, a refresher over it, and storage answering the latest request when told to.
const sessionWith = listingState => {
    let now = 0
    let timers = []
    const requests = []
    const wakeups = new Subject()
    const changes = new Subject()
    const state = {recipes: [], listingState, saves: {}}
    const clock = {
        now: () => now,
        setTimeout: (callback, ms) => {
            const timer = {at: now + ms, callback}
            timers.push(timer)
            return timer
        },
        clearTimeout: timer => timers = timers.filter(other => other !== timer)
    }
    const refresher = new ListingRefresh({
        session: () => ({listingState: state.listingState}),
        sessionChanges$: changes,
        updateListing: update => {
            Object.assign(state, update(state))
            changes.next()
        },
        loadListing$: () => new Observable(subscriber => {
            requests.push(subscriber)
        }),
        wakeups$: wakeups,
        clock
    })
    return {
        refresher,
        requests,
        state,
        wake: () => wakeups.next(),
        // Another writer - the session's first listing - dates the evidence.
        redate: listingState => {
            state.listingState = listingState
            changes.next()
        },
        answer: recipes => {
            requests.at(-1).next(recipes)
            requests.at(-1).complete()
        },
        fail: error => requests.at(-1).error(error),
        advance: ms => {
            const until = now + ms
            for (;;) {
                const due = timers.filter(({at}) => at <= until).sort((a, b) => a.at - b.at)[0]
                if (!due) {
                    break
                }
                timers = timers.filter(timer => timer !== due)
                now = due.at
                due.callback()
            }
            now = until
        }
    }
}
