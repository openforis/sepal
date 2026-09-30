import _ from 'lodash'
import {Observable} from 'rxjs'

import {TerminalOperation} from '../recipe/terminalOperation'
import {
    SOURCE_BASIS_CHANGED,
    SOURCE_IDENTITY_CHANGED,
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
// `heldFor` is a pure lookup. It checks currency when it is asked - the key, the credentials in the session now and
// the retention deadline - so an answer is withdrawn before any timer or component has reacted to a change.
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

export class OutputRegistry {
    #session
    #sessionChanges$
    #acquisitionOf
    #operationOf
    #isCompatible
    #retention
    #clock
    #questions = []
    #works = []
    #credentials = undefined
    #catalogue = undefined
    #listening = null
    #closed = false

    // session()                                  → {catalogue, credentials, closed}, read synchronously
    // sessionChanges$                             notifies after every session change, completing when the scope ends
    // acquisitionOf({recipeId, product, catalogue}) → {acquisition, recipe, graph} | null when nothing is to load
    // operationOf({kind, recipe})                 → the runtime operation for that kind of work
    // isCompatible(basis, graph)                  whether a terminal read the records its key names
    constructor({
        session, sessionChanges$, acquisitionOf, operationOf, isCompatible,
        retention = DEFAULT_OUTPUT_RETENTION, clock = SYSTEM_CLOCK
    }) {
        this.#session = session
        this.#sessionChanges$ = sessionChanges$
        this.#acquisitionOf = acquisitionOf
        this.#operationOf = operationOf
        this.#isCompatible = isCompatible
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
        this.#catalogue = this.#session().catalogue
        return [...this.#questions].filter(question => this.#questions.includes(question) && this.#reload(question))
    }

    // Returns whether the question's work changed.
    #reload(question) {
        const previous = question.work
        const loading = this.#acquisitionOf({...question, catalogue: this.#session().catalogue})
        if (!loading) {
            this.#attach(question, null)
            return previous !== null
        }
        const {acquisition: {key}, recipe, graph} = loading
        if (previous && _.isEqual(previous.key, key)) {
            return false
        }
        const reused = this.#reusable(key)
        const work = reused || this.#addWork({key, graph})
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
        work.operation.start(
            this.#operationOf({kind: work.key.kind, recipe}),
            terminal => this.#settled(work, terminal)
        )
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
            this.#stopListening()
        }
    }

    #stopListening() {
        const listening = this.#listening
        this.#listening = null
        listening?.unsubscribe()
    }

    #sessionChanged() {
        const {catalogue, credentials, closed} = this.#session()
        if (closed) {
            return this.close()
        }
        if (credentials !== this.#credentials) {
            return this.#notify(this.#credentialsChanged(credentials))
        }
        if (catalogue !== this.#catalogue) {
            this.#notify(this.#refreshAll())
        }
    }

    // Returns the questions to tell: every one, unless these are the first credentials seen.
    #credentialsChanged(credentials) {
        const initial = this.#credentials === undefined
        this.#credentials = credentials
        if (!initial) {
            ;[...this.#works].forEach(work => this.#discard(work))
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

    #addWork({key, graph}) {
        const work = {
            key,
            graph,
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
