import _ from 'lodash'
import {Observable} from 'rxjs'

import {TerminalOperation} from '../recipe/terminalOperation'
import {SESSION} from './recordCurrency'
import {
    SOURCE_BASIS_CHANGED,
    SOURCE_IDENTITY_CHANGED,
    SOURCE_REVISION_BEHIND,
    SOURCE_RUNTIME_UNAVAILABLE,
    sourceRuntimeError
} from './sourceRuntimeError'

// Who is watching which output questions, and the description loading their answers need, shared across them.
//
// A question is a recipe id and the product its consumer reads, normalized as the common read names it
// (layerProduct.js). Watching is separate from loading. Every watched question is recomputed from the session whenever
// the session changes; the common read decides whether work is needed (recipeOutput.js) and names it by key. A question
// the session answers alone is still watched, and starts nothing. Its watchers are told when the work answering it
// changes - withdrawn for other work, settled, or no longer needed because the session answers alone - and not when
// an edit leaves it as it was.
//
// Work is keyed by that key, so every question whose read names the same key shares one runtime operation. It is
// claimed by the questions naming it, and exists only while claimed, or retained after settling:
//
//   - Unfinished work whose last claimant leaves is cancelled and discarded.
//   - A settled READY, INVALID or COMPLETE answer is retained for a grace period after its last release, and at
//     most `maxUnclaimed` of those are retained, the earliest released evicted first. Retained work loads and
//     watches nothing; a question naming its key again reclaims it.
//   - An UNAVAILABLE answer is held while claimed, so failure shows rather than pending for good, and discarded
//     at zero claims. It is loaded again on an explicit retry, a key or credential change, or a new watch after it
//     was discarded - never because another subscriber joined or a consumer rendered.
//   - A terminal about records other than those its key names is refused and held as a failure, never retained
//     as an answer and never left loading.
//
// Work keeps a ledger of the records it read (recordCurrency.js): the session's, from when it was created, and every
// record its operation reads, as it is read. Evidence that supersedes an entry - a newer revision, or a recipe the
// listing stopped or started listing - withdraws the work whether it has settled or not: it is discarded, its late
// terminal changes nothing, and its questions load again. A record that arrives already superseded is loaded again
// once; storage answering the same old revision again is held as a failure rather than loaded for ever.
//
// `heldFor` is a pure lookup. It checks currency when it is asked - the key, the credentials in the session now, the
// ledger against what the session knows now and the retention deadline - so an answer is withdrawn before any timer
// or component has reacted to a change.
//
// Credentials replaced in the session discard everything and restart only claimed work, once. The runtime's scope
// ending completes every watch; from then on every key is answered UNAVAILABLE, and nothing restarts.

export const DEFAULT_OUTPUT_RETENTION = Object.freeze({graceMs: 60000, maxUnclaimed: 32})

const SYSTEM_CLOCK = {
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: id => clearTimeout(id)
}

const RETAINED = new Set(['READY', 'INVALID', 'COMPLETE'])

const unavailable = (error, basis = []) =>
    ({status: 'UNAVAILABLE', description: null, diagnostics: [], error, dependencyValidity: null, basis})

const CLOSED = Object.freeze(unavailable(sourceRuntimeError(SOURCE_RUNTIME_UNAVAILABLE)))

const NO_CURRENCY = Object.freeze({
    evidence: ({id}) => ({id}),
    unread: id => ({id}),
    superseded: () => false
})

const SESSION_PARTS = ['catalogue', 'listing', 'listingState', 'tabs', 'saves']

export class OutputRegistry {
    #session
    #sessionChanges$
    #acquisitionOf
    #operationOf
    #isCompatible
    #currencyOf
    #onActive
    #retention
    #clock
    #questions = []
    #works = []
    #credentials = undefined
    #parts = undefined
    #readAgain = new Set()
    #listening = null
    #closed = false

    // session()                                  → {catalogue, credentials, closed}, read synchronously
    // sessionChanges$                             notifies after every session change, completing when the scope ends
    // acquisitionOf({recipeId, product, catalogue, session})
    //                                             → {acquisition, recipe, graph, records?} | null when nothing is to load;
    //                                               `records` are the session records the work reads, the graph's if absent
    // operationOf({kind, recipe})                 → the runtime operation for that kind of work
    // isCompatible(basis, graph)                  whether a terminal read the records its key names
    // currencyOf(session)                         → what the session knows of each record (recordCurrency.js)
    // onActive(active)                            told when the first question is watched and when the last is not
    constructor({
        session, sessionChanges$, acquisitionOf, operationOf, isCompatible, currencyOf = () => NO_CURRENCY,
        onActive = () => {},
        retention = DEFAULT_OUTPUT_RETENTION, clock = SYSTEM_CLOCK
    }) {
        this.#session = session
        this.#sessionChanges$ = sessionChanges$
        this.#acquisitionOf = acquisitionOf
        this.#operationOf = operationOf
        this.#isCompatible = isCompatible
        this.#currencyOf = currencyOf
        this.#onActive = onActive
        this.#retention = retention
        this.#clock = clock
    }

    // Notifies whenever what `heldFor` answers for the question may have changed. Unsubscribing releases the claim.
    watchOutput$({recipeId, product}) {
        return new Observable(subscriber => {
            this.#listen()
            if (this.#isClosed()) {
                this.close()
                subscriber.complete()
                return
            }
            const question = this.#claim({recipeId, product}, subscriber)
            this.#notify(this.#refresh(question), subscriber)
            return () => this.#release(question, subscriber)
        })
    }

    heldFor(key) {
        if (this.#isClosed()) {
            return CLOSED
        }
        const work = this.#workFor(key)
        return work?.terminal && this.#isCurrent(work) ? work.terminal : null
    }

    retryOutput({recipeId, product}) {
        const failed = this.#questionFor({recipeId, product})?.work
        if (this.#closed || failed?.terminal?.status !== 'UNAVAILABLE') {
            return
        }
        const claimants = this.#discard(failed)
        const changed = claimants.flatMap(question => this.#refresh(question))
        this.#notify(_.uniq([...claimants, ...changed]))
    }

    close() {
        if (this.#closed) {
            return
        }
        this.#closed = true
        this.#stopListening()
        ;[...this.#works].forEach(work => this.#discard(work))
        const watchers = this.#questions.flatMap(({watchers}) => [...watchers])
        this.#questions = []
        watchers.forEach(watcher => watcher.complete())
    }

    #claim({recipeId, product}, subscriber) {
        const question = this.#questionFor({recipeId, product}) || this.#addQuestion({recipeId, product})
        question.watchers.add(subscriber)
        return question
    }

    #release(question, subscriber) {
        question.watchers.delete(subscriber)
        if (question.watchers.size || !this.#questions.includes(question)) {
            return
        }
        this.#questions = this.#questions.filter(other => other !== question)
        this.#attach(question, null)
        if (!this.#questions.length) {
            this.#stopListening()
        }
    }

    // Returns the questions whose work changed.
    #refresh(question) {
        const {credentials} = this.#session()
        if (credentials !== this.#credentials) {
            return this.#credentialsChanged(credentials)
        }
        return this.#reload(question) ? [question] : []
    }

    // The session change marker is kept only here: one question refreshed when it is watched has not handled a
    // change for the others.
    #refreshAll() {
        this.#parts = partsOf(this.#session())
        return [...this.#questions].filter(question => this.#questions.includes(question) && this.#reload(question))
    }

    // Returns whether the question's work changed.
    #reload(question) {
        const previous = question.work
        const session = this.#session()
        const loading = this.#acquisitionOf({...question, catalogue: session.catalogue, session})
        if (!loading) {
            this.#attach(question, null)
            return previous !== null
        }
        const {acquisition: {key}, recipe, graph, records = graph.recipes} = loading
        if (previous && _.isEqual(previous.key, key)) {
            return false
        }
        const reused = this.#reusable(key)
        const work = reused || this.#addWork({key, graph, records, rootId: recipe.id})
        this.#attach(question, work)
        if (!reused) {
            this.#load(work, recipe)
        }
        return true
    }

    // Whether work already under this key may answer: loading, held while claimed, or retained and still current.
    #reusable(key) {
        const work = this.#workFor(key)
        if (!work || !work.terminal || this.#isCurrent(work)) {
            return work
        }
        this.#discard(work)
        return null
    }

    #isCurrent(work) {
        return work.credentials === this.#session().credentials
            && (work.claims.size > 0 || this.#clock.now() < work.expiresAt)
            && !this.#superseded(work, this.#currency())
    }

    #superseded(work, currency) {
        return work.ledger.some(entry => currency.superseded(entry))
    }

    #currency() {
        return this.#currencyOf(this.#session())
    }

    // Claimed before the question lets go of what it had, so work both name is never cancelled in between.
    #attach(question, work) {
        const previous = question.work
        if (previous === work) {
            return
        }
        if (work) {
            work.claims.add(question)
            this.#cancelExpiry(work)
        }
        question.work = work
        if (previous) {
            this.#unclaim(previous, question)
        }
    }

    #unclaim(work, question) {
        work.claims.delete(question)
        if (work.claims.size) {
            return
        }
        if (!work.terminal || !RETAINED.has(work.terminal.status)) {
            return this.#discard(work)
        }
        work.expiresAt = this.#clock.now() + this.#retention.graceMs
        work.timer = this.#clock.setTimeout(() => this.#expire(work), this.#retention.graceMs)
        this.#evictBeyondCap()
    }

    #load(work, recipe) {
        const reads = {
            read: (record, origin) => this.#read(work, record, origin),
            unread: (id, origin) => this.#record(work, this.#currency().unread(id, origin))
        }
        work.operation.start(
            this.#operationOf({kind: work.key.kind, recipe, key: work.key, reads}),
            terminal => this.#settled(work, terminal)
        )
    }

    #read(work, record, origin) {
        const currency = this.#currency()
        const entry = currency.evidence(record, origin)
        if (this.#record(work, entry) && currency.superseded(entry)) {
            this.#arrivedSuperseded(work, entry, currency)
        }
    }

    #record(work, entry) {
        if (entry.id === work.rootId || !this.#works.includes(work) || work.terminal) {
            return false
        }
        work.ledger.push(entry)
        return true
    }

    // Storage answered with a revision older than one already known. Loaded again once, in case the answer was just
    // late; the same answer again is a failure about the revision known now, held until newer evidence or a retry.
    #arrivedSuperseded(work, entry, currency) {
        const {id, revision, origin} = entry
        const attempt = `${id}@${revision}`
        if (this.#readAgain.has(attempt)) {
            work.operation.stop()
            work.ledger = [...work.ledger.filter(other => other !== entry), currency.unread(id, origin)]
            work.terminal = unavailable(sourceRuntimeError(SOURCE_REVISION_BEHIND))
            return this.#notify([...work.claims])
        }
        this.#readAgain.add(attempt)
        const claimants = this.#discard(work)
        const changed = claimants.flatMap(question => this.#refresh(question))
        this.#notify(_.uniq([...claimants, ...changed]))
    }

    #settled(work, terminal) {
        if (!this.#works.includes(work) || work.terminal) {
            return
        }
        const code = terminal.error?.code
        if (code === SOURCE_RUNTIME_UNAVAILABLE) {
            return this.close()
        }
        if (code === SOURCE_IDENTITY_CHANGED) {
            // The replacement belongs to whichever notices the new credentials first; this work is gone once it has.
            this.#sessionChanged()
            if (!this.#works.includes(work)) {
                return
            }
        }
        work.terminal = this.#isCompatible(terminal.basis, work.graph)
            ? terminal
            : unavailable(sourceRuntimeError(SOURCE_BASIS_CHANGED), terminal.basis)
        this.#notify([...work.claims])
    }

    // A scope that has already ended completes the subscription inside subscribe(), before it is assigned.
    #listen() {
        if (this.#listening || this.#closed) {
            return
        }
        this.#listening = this.#sessionChanges$.subscribe({
            next: () => this.#sessionChanged(),
            error: () => this.close(),
            complete: () => this.close()
        })
        if (this.#closed) {
            return this.#stopListening()
        }
        this.#onActive(true)
    }

    #stopListening() {
        const listening = this.#listening
        this.#listening = null
        listening?.unsubscribe()
        if (listening) {
            this.#onActive(false)
        }
    }

    #sessionChanged() {
        const session = this.#session()
        const {credentials, closed} = session
        if (closed) {
            return this.close()
        }
        if (credentials !== this.#credentials) {
            return this.#notify(this.#credentialsChanged(credentials))
        }
        if (!this.#parts || SESSION_PARTS.some(part => session[part] !== this.#parts[part])) {
            const withdrawn = this.#withdrawSuperseded()
            this.#notify(_.uniq([...withdrawn, ...this.#refreshAll()]))
        }
    }

    // Discards every work the session now knows to be superseded, returning the questions that claimed it.
    #withdrawSuperseded() {
        const currency = this.#currency()
        return this.#works
            .filter(work => this.#superseded(work, currency))
            .flatMap(work => this.#discard(work))
    }

    // Returns the questions to tell: every one, unless these are the first credentials seen.
    #credentialsChanged(credentials) {
        const initial = this.#credentials === undefined
        this.#credentials = credentials
        if (!initial) {
            ;[...this.#works].forEach(work => this.#discard(work))
            this.#readAgain.clear()
        }
        const changed = this.#refreshAll()
        return initial ? changed : [...this.#questions]
    }

    #expire(work) {
        if (this.#works.includes(work) && !work.claims.size) {
            this.#discard(work)
        }
    }

    #evictBeyondCap() {
        const unclaimed = _.sortBy(this.#works.filter(({claims}) => !claims.size), 'expiresAt')
        unclaimed.slice(0, Math.max(0, unclaimed.length - this.#retention.maxUnclaimed))
            .forEach(work => this.#discard(work))
    }

    #cancelExpiry(work) {
        if (work.timer !== null) {
            this.#clock.clearTimeout(work.timer)
        }
        work.timer = null
        work.expiresAt = null
    }

    // Stops the work and forgets it, returning the questions that had claimed it; they now claim nothing.
    #discard(work) {
        work.operation.stop()
        this.#cancelExpiry(work)
        this.#works = this.#works.filter(other => other !== work)
        const claimants = [...work.claims]
        work.claims.clear()
        claimants.forEach(question => question.work = null)
        return claimants
    }

    // `records` are the session's records the work reads. The root is sent as it is, so only the records around it
    // are evidence.
    #addWork({key, graph, records, rootId}) {
        const currency = this.#currency()
        const work = {
            key,
            graph,
            rootId,
            ledger: records.filter(({id}) => id !== rootId).map(record => currency.evidence(record, SESSION)),
            credentials: this.#credentials,
            claims: new Set(),
            operation: new TerminalOperation(),
            terminal: null,
            expiresAt: null,
            timer: null
        }
        this.#works.push(work)
        return work
    }

    #addQuestion({recipeId, product}) {
        const question = {recipeId, product, watchers: new Set(), work: null}
        this.#questions.push(question)
        return question
    }

    #questionFor({recipeId, product}) {
        return this.#questions.find(question => question.recipeId === recipeId && _.isEqual(question.product, product))
    }

    #workFor(key) {
        return this.#works.find(work => work.key.kind === key.kind && _.isEqual(work.key, key))
    }

    #isClosed() {
        return this.#closed || this.#session().closed
    }

    // A watcher just subscribing is not told about its own refresh; it reads once it has subscribed.
    #notify(questions, subscribing = null) {
        questions.flatMap(({watchers}) => [...watchers])
            .filter(watcher => watcher !== subscribing)
            .forEach(watcher => watcher.next())
    }
}

const partsOf = session => Object.fromEntries(SESSION_PARTS.map(part => [part, session[part]]))
