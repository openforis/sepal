import _ from 'lodash'
import {EMPTY, filter, fromEvent, merge, NEVER} from 'rxjs'

import api from '~/apiRegistry'
import {getLogger} from '~/log'

import {
    DEFAULT_AUTHORITY_MAX_AGE_MS,
    expiredListing,
    failedListing,
    listingRequest,
    mergedListing,
    refreshedListing,
    refreshingListing
} from '../recipeListing'

// Keeps the recipe listing - this session's evidence of recipe revisions (recipeListing.js) - recent while any output
// is watched. One request at a time; a trigger while one is in flight joins it.
//
//   - A consumer opening, or the browser becoming visible or reconnecting, refreshes evidence older than
//     `openMaxAgeMs` at once.
//   - While anything is watched, the listing is refreshed `refreshLeadMs` before Retrieve's authority lapses, so a
//     routine refresh has settled before it could block a Retrieve, and the lapse itself is published when it comes.
//   - A failure is published and kept until a refresh succeeds. The next attempt comes from a trigger, an explicit
//     retry or the next scheduled refresh - the same bounded interval after the attempt that failed, before the first
//     success too - never from a read: reads and Apply start nothing.
//
// Evidence dates from when its request started, so a slow response cannot make old evidence look recent.

const log = getLogger('recipeListing')

export const DEFAULT_LISTING_POLICY = Object.freeze({
    openMaxAgeMs: 60000,
    authorityMaxAgeMs: DEFAULT_AUTHORITY_MAX_AGE_MS,
    refreshLeadMs: 30000
})

const SYSTEM_CLOCK = {
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: id => clearTimeout(id)
}

export class ListingRefresh {
    #session
    #sessionChanges$
    #updateListing
    #loadListing$
    #wakeups$
    #policy
    #clock
    #inFlight = null
    #lastAttemptAt = -Infinity
    #active = false
    #timers = []
    #wakeups = null
    #changes = null
    #scheduledFor = undefined
    #closed = false

    // session()                 → {listingState, ...}, read synchronously
    // sessionChanges$           notifies after every session change, so a listing dated by anyone is scheduled from
    // updateListing(update)     applies update({recipes, listingState, saves}) → {recipes?, listingState?} to the session
    // loadListing$()            → the listing as storage holds it
    // wakeups$                  notifies when the browser becomes visible or reconnects
    constructor({
        session, sessionChanges$ = NEVER, updateListing, loadListing$ = () => api.recipe.loadAll$(),
        wakeups$ = browserWakeups$(), policy = DEFAULT_LISTING_POLICY, clock = SYSTEM_CLOCK
    }) {
        this.#session = session
        this.#sessionChanges$ = sessionChanges$
        this.#updateListing = updateListing
        this.#loadListing$ = loadListing$
        this.#wakeups$ = wakeups$
        this.#policy = policy
        this.#clock = clock
    }

    // Refreshes unless the evidence is younger than `maxAgeMs`, or a refresh - this one's, or the session's first
    // listing - is already in flight.
    refresh({maxAgeMs} = {}) {
        const {listingState, saves} = this.#session()
        if (this.#closed || this.#inFlight || listingState?.refreshing) {
            return
        }
        const now = this.#clock.now()
        if (maxAgeMs !== undefined && now - (listingState?.checkedAt ?? -Infinity) < maxAgeMs) {
            return
        }
        const request = listingRequest({listingState, saves, now})
        this.#inFlight = request
        this.#lastAttemptAt = now
        this.#updateListing(current => ({listingState: refreshingListing(current.listingState, now)}))
        request.subscription = this.#loadListing$().subscribe({
            next: response => this.#settled(request, current => {
                log.debug(() => `Listing of ${response.length} recipes, ${JSON.stringify(response).length} characters`)
                const merged = mergedListing({
                    ...current,
                    ...request,
                    response,
                    now: this.#clock.now(),
                    authorityMaxAgeMs: this.#policy.authorityMaxAgeMs
                })
                return {...merged, listingState: refreshedListing(merged.listingState)}
            }),
            error: error => this.#settled(request, current => ({
                listingState: failedListing(current.listingState, error, this.#clock.now())
            }))
        })
    }

    // Whether anything is watched: only then is the listing kept recent.
    watch(active) {
        if (this.#closed || active === this.#active) {
            return
        }
        this.#active = active
        if (active) {
            this.#wakeups = this.#wakeups$.subscribe(() => this.refresh({maxAgeMs: this.#policy.openMaxAgeMs}))
            this.#changes = this.#sessionChanges$.subscribe(() => this.#rescheduleIfRedated())
            this.#schedule()
        } else {
            this.#wakeups?.unsubscribe()
            this.#changes?.unsubscribe()
            this.#wakeups = null
            this.#changes = null
            this.#clearTimers()
        }
    }

    close() {
        this.watch(false)
        this.#closed = true
        this.#inFlight?.subscription?.unsubscribe()
        this.#inFlight = null
    }

    #settled(request, update) {
        if (this.#inFlight !== request) {
            return
        }
        this.#inFlight = null
        this.#updateListing(update)
        this.#schedule()
    }

    // Evidence dated, or a failure reported, by another writer - the session's first listing - is scheduled from when
    // it arrives.
    #rescheduleIfRedated() {
        if (!_.isEqual(scheduleBasis(this.#session().listingState), this.#scheduledFor)) {
            this.#schedule()
        }
    }

    #schedule() {
        this.#clearTimers()
        if (!this.#active) {
            return
        }
        const {listingState} = this.#session()
        this.#scheduledFor = scheduleBasis(listingState)
        const {checkedAt, failedAt} = this.#scheduledFor
        const {authorityMaxAgeMs, refreshLeadMs} = this.#policy
        if (Number.isFinite(checkedAt) && !listingState.expired) {
            this.#at(checkedAt + authorityMaxAgeMs, () => this.#expire(checkedAt))
        }
        // With no evidence and no attempt yet, the first listing is the session's own to make.
        const since = Math.max(checkedAt ?? -Infinity, failedAt ?? -Infinity, this.#lastAttemptAt)
        if (Number.isFinite(since)) {
            this.#at(since + authorityMaxAgeMs - refreshLeadMs, () => this.refresh())
        }
    }

    #expire(checkedAt) {
        this.#updateListing(current => current.listingState?.checkedAt === checkedAt && !current.listingState.expired
            ? {listingState: expiredListing(current.listingState)}
            : {})
    }

    #at(time, callback) {
        const delay = Math.max(0, time - this.#clock.now())
        this.#timers.push(this.#clock.setTimeout(() => {
            if (this.#active) {
                callback()
            }
        }, delay))
    }

    #clearTimers() {
        this.#timers.forEach(timer => this.#clock.clearTimeout(timer))
        this.#timers = []
    }
}

const scheduleBasis = listingState => ({checkedAt: listingState?.checkedAt, failedAt: listingState?.failure?.at})

const browserWakeups$ = () => typeof document === 'undefined' || typeof window === 'undefined'
    ? EMPTY
    : merge(
        fromEvent(document, 'visibilitychange').pipe(filter(() => document.visibilityState === 'visible')),
        fromEvent(window, 'online')
    )
