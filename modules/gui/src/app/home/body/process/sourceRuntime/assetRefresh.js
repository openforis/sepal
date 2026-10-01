import _ from 'lodash'
import {NEVER} from 'rxjs'

import api from '~/apiRegistry'
import {browserWakeups$, isVisible} from '~/browserWakeups'

import {
    answeredAssets,
    checkingAssets,
    DEFAULT_ASSET_POLICY,
    expiredAsset,
    failedAssets,
    releasedAssets,
    settledAssets,
    staleAssets
} from './assetEvidence'

// Keeps the evidence about every asset an active consumer reads (assetEvidence.js) recent, in batched requests.
//
//   - Consumers claim the assets they read; an asset is polled while claimed and the page is visible. Releasing the
//     last claim stops polling it at once. Its evidence is kept for `retentionMs` after that, for a consumer reopening
//     soon, and then forgotten.
//   - Claiming an asset, or the browser becoming visible or reconnecting, reads evidence older than `openMaxAgeMs` at
//     once. While claimed, evidence is read again `refreshLeadMs` before its authority lapses, and the lapse itself is
//     published when it comes. A failure is retried on the same interval, from a trigger, or on an explicit refresh.
//   - A change the asset catalogue reports - a new `updateTime`, or an asset gone from it - reads that asset at once.
//   - A mutation the session records (`assetMutation`) is invalidated as below.
//   - A forced refresh reads even recent evidence; a forced refresh already in flight is joined rather than repeated.
//   - A mutation this session knows of - an asset created, deleted, replaced or renamed - makes the evidence of every
//     asset it names stale at once: it authorizes nothing until a read answers differently. It is read at once and
//     again after each `followUpDelaysMs` while nothing different has been answered, since Earth Engine takes seconds
//     to report a change, and then what was read stands. No token is ever made up for it.
//   - A failure naming an asset reads that asset, at most once per
//     `failureCheckIntervalMs` unless its token changes meanwhile, so a failure that persists over unchanged evidence
//     cannot keep starting reads, and a failed read starts none.
//   - Only the latest request issued for an asset is accepted. Replacing credentials cancels every request in flight
//     and every follow-up, and every claimed asset is read again once.
//   - Releasing the last claim on an asset ends its follow-up reads; claiming it again while its evidence is still
//     stale resumes them, from the read due by then.
//
// Evidence dates from when its request started, so a slow response cannot make old evidence look recent.

export class AssetRefresh {
    #session
    #sessionChanges$
    #updateEvidence
    #loadVersions$
    #wakeups$
    #visible
    #policy
    #clock
    #claims = new Map()
    #attempts = new Map()
    #catalogue = new Map()
    #retained = new Map()
    #requests = new Set()
    #requestIds = 0
    #followUps = new Map()
    #failureChecks = new Map()
    #credentials = undefined
    #mutation = undefined
    #timers = []
    #listening = null
    #closed = false

    // session()               → {assetEvidence, assetCatalogue, assetMutation, credentials}, read synchronously
    // sessionChanges$         notifies after every session change
    // updateEvidence(update)  applies update(assets) → assets to the session's evidence
    // loadVersions$(ids)      → {assets: [{id, version, unversioned?, type} | {id, failure}]}
    // wakeups$                notifies when the browser becomes visible or reconnects
    // visible()               whether the page is visible
    constructor({
        session, sessionChanges$ = NEVER, updateEvidence, loadVersions$ = ids => api.gee.assetVersions$({ids}),
        wakeups$ = browserWakeups$(), visible = isVisible, policy = DEFAULT_ASSET_POLICY, clock = SYSTEM_CLOCK
    }) {
        this.#session = session
        this.#sessionChanges$ = sessionChanges$
        this.#updateEvidence = updateEvidence
        this.#loadVersions$ = loadVersions$
        this.#wakeups$ = wakeups$
        this.#visible = visible
        this.#policy = policy
        this.#clock = clock
    }

    // Returns the release. Claiming the same asset again counts; each release is counted once.
    claim(ids) {
        const unique = _.uniq(ids)
        if (this.#closed || !unique.length) {
            return () => {}
        }
        this.#listen()
        const catalogue = this.#session().assetCatalogue || {}
        const added = unique.filter(id => {
            const count = this.#claims.get(id) || 0
            this.#claims.set(id, count + 1)
            if (!count) {
                this.#cancelRetention(id)
                this.#catalogue.set(id, catalogue[id])
            }
            return !count
        })
        if (added.length) {
            const resumed = this.#resumeFollowUps(added)
            this.refresh(added.filter(id => !resumed.includes(id)), {maxAgeMs: this.#policy.openMaxAgeMs})
            this.#schedule()
        }
        let released = false
        return () => {
            if (!released) {
                released = true
                this.#release(unique)
            }
        }
    }

    // Reads the evidence of `ids` unless it is younger than `maxAgeMs` or already being read; `force` reads it anyway,
    // joining a forced read already in flight. Resolves once every read it started or joined has settled.
    refresh(ids, {maxAgeMs, force = false} = {}) {
        if (this.#closed) {
            return Promise.resolve()
        }
        const now = this.#clock.now()
        const assets = this.#session().assetEvidence || {}
        const joined = new Set()
        const due = _.uniq(ids).filter(id => {
            const inFlight = this.#inFlightFor(id, force)
            if (inFlight) {
                joined.add(inFlight)
                return false
            }
            return force || maxAgeMs === undefined || now - this.#lastRead(id, assets[id]) >= maxAgeMs
        })
        const started = _.chunk(due, this.#policy.maxBatch).map(chunk => this.#request(chunk, {force, now}))
        return Promise.all([...joined, ...started].map(({settled}) => settled))
    }

    // A mutation this session knows of, to the assets it names: those an active consumer reads or that are still
    // remembered. Their evidence is stale until a read answers differently or the follow-up reads end.
    invalidate(ids) {
        const assets = this.#session().assetEvidence || {}
        const known = _.uniq(ids).filter(id => this.#claims.has(id) || assets[id])
        if (this.#closed || !known.length) {
            return
        }
        const at = this.#clock.now()
        known.forEach(id => this.#cancelFollowUp(id))
        this.#updateEvidence(current => staleAssets(current, known, at))
        this.#followUp(known, at, 0)
    }

    // Operations that failed over these assets: they are read, unless one was read for a failure recently and its
    // token has not changed since.
    reportFailure(ids) {
        if (this.#closed) {
            return Promise.resolve()
        }
        const now = this.#clock.now()
        const assets = this.#session().assetEvidence || {}
        const due = _.uniq(ids).filter(id => {
            const previous = this.#failureChecks.get(id)
            return this.#claims.has(id) && (!previous
                || now - previous.at >= this.#policy.failureCheckIntervalMs
                || previous.version !== assets[id]?.version)
        })
        due.forEach(id => this.#failureChecks.set(id, {at: now, version: assets[id]?.version}))
        return due.length ? this.refresh(due, {force: true}) : Promise.resolve()
    }

    close() {
        this.#cancelFollowUps()
        this.#closed = true
        this.#stopListening()
        this.#clearTimers()
        this.#requests.forEach(request => {
            request.subscription?.unsubscribe()
            request.resolve()
        })
        this.#requests.clear()
        this.#retained.forEach(timer => this.#clock.clearTimeout(timer))
        this.#retained.clear()
    }

    #request(ids, {force, now}) {
        const request = {id: ++this.#requestIds, ids, startedAt: now, force}
        request.settled = new Promise(resolve => request.resolve = resolve)
        this.#requests.add(request)
        ids.forEach(id => this.#attempts.set(id, now))
        this.#updateEvidence(assets => checkingAssets(assets, ids, request.id))
        const subscription = this.#loadVersions$(ids).subscribe({
            next: ({assets: answers = []} = {}) => this.#settled(request, assets => answeredAssets(assets, {
                requestId: request.id, startedAt: request.startedAt, answers, now: this.#clock.now()
            })),
            error: () => this.#settled(request, assets => failedAssets(assets, {
                requestId: request.id, ids, now: this.#clock.now()
            }))
        })
        // An answer inside subscribe() has settled the request before its subscription is known.
        if (this.#requests.has(request)) {
            request.subscription = subscription
        }
        return request
    }

    #settled(request, update) {
        if (!this.#requests.delete(request)) {
            return
        }
        this.#updateEvidence(update)
        request.resolve()
        this.#schedule()
    }

    // One sequence of reads after a mutation; an asset named by a later mutation leaves it for the later one.
    #followUp(ids, at, step, sequence = {ids: new Set(ids), at, timer: null}) {
        const assets = this.#session().assetEvidence || {}
        const pending = [...sequence.ids].filter(id => assets[id]?.stale?.at === at)
        const delays = this.#followUpDelays()
        sequence.ids = new Set(pending)
        if (this.#closed || !pending.length) {
            return
        }
        if (step >= delays.length) {
            pending.forEach(id => this.#followUps.delete(id))
            return this.#updateEvidence(current => settledAssets(current, pending, at))
        }
        sequence.timer = this.#clock.setTimeout(() => {
            sequence.timer = null
            this.refresh([...sequence.ids], {force: true}).then(() => this.#followUp(null, at, step + 1, sequence))
        }, Math.max(0, at + delays[step] - this.#clock.now()))
        pending.forEach(id => this.#followUps.set(id, sequence))
    }

    // Returns the assets whose follow-up reads it resumed: the latest read due is made at once.
    #resumeFollowUps(ids) {
        const assets = this.#session().assetEvidence || {}
        const stale = ids.filter(id => assets[id]?.stale && !this.#followUps.has(id))
        const now = this.#clock.now()
        Object.values(_.groupBy(stale, id => assets[id].stale.at)).forEach(group => {
            const at = assets[group[0]].stale.at
            this.#followUp(group, at, Math.max(0, _.findLastIndex(this.#followUpDelays(), delay => at + delay <= now)))
        })
        return stale
    }

    #followUpDelays() {
        return [0, ...this.#policy.followUpDelaysMs]
    }

    #cancelFollowUp(id) {
        const sequence = this.#followUps.get(id)
        if (!sequence) {
            return
        }
        this.#followUps.delete(id)
        sequence.ids.delete(id)
        if (!sequence.ids.size && sequence.timer !== null) {
            this.#clock.clearTimeout(sequence.timer)
        }
    }

    #cancelFollowUps() {
        new Set(this.#followUps.values()).forEach(({timer}) => timer !== null && this.#clock.clearTimeout(timer))
        this.#followUps.clear()
    }

    #inFlightFor(id, force) {
        return [...this.#requests].find(request => request.ids.includes(id) && (request.force || !force))
    }

    #lastRead(id, entry) {
        return Math.max(this.#attempts.get(id) ?? -Infinity, entry?.checkedAt ?? -Infinity)
    }

    #release(ids) {
        ids.forEach(id => {
            const count = this.#claims.get(id) - 1
            if (count > 0) {
                return this.#claims.set(id, count)
            }
            this.#claims.delete(id)
            this.#catalogue.delete(id)
            this.#cancelFollowUp(id)
            this.#retain(id)
        })
        this.#requests.forEach(request => {
            if (!request.ids.some(id => this.#claims.has(id))) {
                request.subscription?.unsubscribe()
                this.#requests.delete(request)
                request.resolve()
            }
        })
        if (!this.#claims.size) {
            this.#stopListening()
        }
        this.#schedule()
    }

    #retain(id) {
        this.#cancelRetention(id)
        this.#retained.set(id, this.#clock.setTimeout(() => {
            this.#retained.delete(id)
            if (!this.#claims.has(id)) {
                this.#attempts.delete(id)
                this.#updateEvidence(assets => releasedAssets(assets, [id]))
            }
        }, this.#policy.retentionMs))
    }

    #cancelRetention(id) {
        const timer = this.#retained.get(id)
        if (timer !== undefined) {
            this.#clock.clearTimeout(timer)
            this.#retained.delete(id)
        }
    }

    #listen() {
        if (this.#listening || this.#closed) {
            return
        }
        this.#credentials = this.#session().credentials
        this.#mutation = this.#session().assetMutation
        this.#listening = [
            this.#sessionChanges$.subscribe(() => this.#sessionChanged()),
            this.#wakeups$.subscribe(() => this.refresh([...this.#claims.keys()], {maxAgeMs: this.#policy.openMaxAgeMs}))
        ]
    }

    #stopListening() {
        this.#listening?.forEach(subscription => subscription.unsubscribe())
        this.#listening = null
    }

    #sessionChanged() {
        const {credentials, assetCatalogue = {}, assetMutation} = this.#session()
        if (credentials !== this.#credentials) {
            return this.#credentialsChanged(credentials)
        }
        if (assetMutation !== this.#mutation) {
            this.#mutation = assetMutation
            assetMutation && this.invalidate(assetMutation.ids)
        }
        const moved = [...this.#claims.keys()].filter(id => assetCatalogue[id] !== this.#catalogue.get(id))
        moved.forEach(id => this.#catalogue.set(id, assetCatalogue[id]))
        if (moved.length) {
            this.refresh(moved)
        }
    }

    #credentialsChanged(credentials) {
        this.#credentials = credentials
        this.#requests.forEach(request => {
            request.subscription?.unsubscribe()
            request.resolve()
        })
        this.#requests.clear()
        this.#attempts.clear()
        this.#failureChecks.clear()
        this.#cancelFollowUps()
        const catalogue = this.#session().assetCatalogue || {}
        this.#claims.forEach((_count, id) => this.#catalogue.set(id, catalogue[id]))
        this.refresh([...this.#claims.keys()])
    }

    #schedule() {
        this.#clearTimers()
        if (this.#closed || !this.#claims.size) {
            return
        }
        const {authorityMaxAgeMs, refreshLeadMs} = this.#policy
        const assets = this.#session().assetEvidence || {}
        const claimed = [...this.#claims.keys()]
        claimed.forEach(id => {
            const entry = assets[id]
            if (Number.isFinite(entry?.checkedAt) && !entry.expired) {
                this.#at(entry.checkedAt + authorityMaxAgeMs, () =>
                    this.#updateEvidence(current => expiredAsset(current, id, entry.checkedAt)))
            }
        })
        const lastReads = claimed.map(id => this.#lastRead(id, assets[id])).filter(Number.isFinite)
        if (lastReads.length) {
            this.#at(Math.min(...lastReads) + authorityMaxAgeMs - refreshLeadMs, () => this.#poll())
        }
    }

    // Hidden, nothing is polled: becoming visible reads whatever is older than `openMaxAgeMs`.
    #poll() {
        if (!this.#visible()) {
            return
        }
        const {authorityMaxAgeMs, refreshLeadMs} = this.#policy
        const assets = this.#session().assetEvidence || {}
        const now = this.#clock.now()
        const due = [...this.#claims.keys()]
            .filter(id => now - this.#lastRead(id, assets[id]) >= authorityMaxAgeMs - refreshLeadMs)
        due.length ? this.refresh(due) : this.#schedule()
    }

    #at(time, callback) {
        const delay = Math.max(0, time - this.#clock.now())
        this.#timers.push(this.#clock.setTimeout(callback, delay))
    }

    #clearTimers() {
        this.#timers.forEach(timer => this.#clock.clearTimeout(timer))
        this.#timers = []
    }
}

const SYSTEM_CLOCK = {
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: id => clearTimeout(id)
}
