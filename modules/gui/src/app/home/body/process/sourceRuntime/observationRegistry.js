import _ from 'lodash'
import {Observable} from 'rxjs'

// Answers to the runtime's Earth Engine requests, shared between every consumer asking the same question: band
// observations - what Earth Engine answers about one image, whichever output question it describes - and calculations
// with the evidence they answer with.
//
// A request is identified by what Earth Engine evaluates. For an observation that is what is asked (`observes`), of
// which reference, the recipe exactly as it is sent, the evidence about every record Earth Engine reads for it itself
// (recordCurrency.js), the assets it reads, and the credentials it is asked under. That evidence is the best this
// session has, not what Earth Engine read, so an answer is kept only while nothing known since supersedes it. A
// calculation answers with the evidence of what it read, which `isCurrent` is given with its identity.
//
//   - Requests with equal identities share one request while it is in flight. Closing one leaves the others' running;
//     the request is cancelled once nobody waits for it.
//   - A settled answer is kept for reuse only when its evidence is complete - every record it depends on at a known
//     revision, with no draft among them that storage does not hold - and still current when it arrives. It is reused
//     for at most `maxAgeMs` after it was observed and `graceMs` after it was last used, and at most `maxUnclaimed` are
//     kept, the least recently used evicted first. These bound reuse, not the freshness of a description already held.
//   - A failure is never kept. An answer arriving for evidence superseded meanwhile reaches only who still waits, and
//     is not kept for anyone else.

export const DEFAULT_OBSERVATION_RETENTION = Object.freeze({graceMs: 60000, maxUnclaimed: 64, maxAgeMs: 300000})

const SYSTEM_CLOCK = {
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: id => clearTimeout(id)
}

export class ObservationRegistry {
    #request$
    #isCurrent
    #retention
    #clock
    #entries = []

    // request$(request)            the request to Earth Engine
    // isCurrent(identity, answer)  whether nothing known now supersedes the evidence an identity was taken with, or
    //                              the evidence its answer reports
    constructor({request$, isCurrent, retention = DEFAULT_OBSERVATION_RETENTION, clock = SYSTEM_CLOCK}) {
        this.#request$ = request$
        this.#isCurrent = isCurrent
        this.#retention = retention
        this.#clock = clock
    }

    // `identity` is {key, complete}: what identifies the observation, and whether its evidence allows keeping it.
    observe$(request, {key, complete}) {
        return new Observable(subscriber => {
            const found = this.#reusable(key)
            if (found?.answer) {
                this.#used(found)
                subscriber.next(found.answer)
                subscriber.complete()
                return
            }
            const entry = found || this.#added(key, complete)
            entry.waiting.add(subscriber)
            if (!found) {
                this.#request(entry, request)
            }
            return () => this.#leave(entry, subscriber)
        })
    }

    // Nothing kept is reused, and nothing in flight is kept: what is waited for still reaches who waits.
    clear() {
        ;[...this.#entries].forEach(entry => entry.answer ? this.#remove(entry) : this.#detach(entry))
    }

    // Decided when asked: the timers only clean up, so an answer is reused only within its bounds and while nothing
    // known now supersedes its evidence, whether or not its cleanup has run.
    #reusable(key) {
        const entry = this.#entries.find(entry => _.isEqual(entry.key, key))
        if (!entry?.answer || this.#reusableNow(entry)) {
            return entry
        }
        this.#remove(entry)
        return null
    }

    #reusableNow({key, answer, observedAt, usedAt}) {
        const now = this.#clock.now()
        const {maxAgeMs, graceMs} = this.#retention
        return now - observedAt < maxAgeMs && now - usedAt < graceMs && this.#isCurrent(key, answer)
    }

    #added(key, complete) {
        const entry = {
            key, complete, waiting: new Set(), answer: null, observedAt: null, usedAt: null, timer: null,
            subscription: null, settled: false
        }
        this.#entries.push(entry)
        return entry
    }

    // A request answering inside subscribe() has settled before its subscription is known.
    #request(entry, request) {
        const subscription = this.#request$(request).subscribe({
            next: answer => this.#answered(entry, answer),
            error: error => this.#failed(entry, error)
        })
        if (entry.settled) {
            subscription.unsubscribe()
        } else {
            entry.subscription = subscription
        }
    }

    #answered(entry, answer) {
        if (entry.settled) {
            return
        }
        entry.settled = true
        const waiting = [...entry.waiting]
        entry.waiting.clear()
        entry.subscription = null
        if (this.#entries.includes(entry) && entry.complete && this.#isCurrent(entry.key, answer)) {
            entry.answer = answer
            entry.observedAt = this.#clock.now()
            this.#used(entry)
        } else {
            this.#remove(entry)
        }
        waiting.forEach(subscriber => {
            subscriber.next(answer)
            subscriber.complete()
        })
    }

    #failed(entry, error) {
        if (entry.settled) {
            return
        }
        entry.settled = true
        const waiting = [...entry.waiting]
        entry.waiting.clear()
        this.#remove(entry)
        waiting.forEach(subscriber => subscriber.error(error))
    }

    #leave(entry, subscriber) {
        entry.waiting.delete(subscriber)
        if (!entry.waiting.size && !entry.settled) {
            entry.settled = true
            this.#remove(entry)
        }
    }

    #used(entry) {
        entry.usedAt = this.#clock.now()
        if (entry.timer !== null) {
            this.#clock.clearTimeout(entry.timer)
        }
        entry.timer = this.#clock.setTimeout(() => this.#remove(entry), this.#retention.graceMs)
        this.#evictBeyondCap()
    }

    #evictBeyondCap() {
        const kept = _.sortBy(this.#entries.filter(({answer}) => answer), 'usedAt')
        kept.slice(0, Math.max(0, kept.length - this.#retention.maxUnclaimed)).forEach(entry => this.#remove(entry))
    }

    #detach(entry) {
        this.#entries = this.#entries.filter(other => other !== entry)
    }

    #remove(entry) {
        this.#detach(entry)
        if (entry.timer !== null) {
            this.#clock.clearTimeout(entry.timer)
            entry.timer = null
        }
        const subscription = entry.subscription
        entry.subscription = null
        subscription?.unsubscribe()
    }
}
