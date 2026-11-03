import {defer, map, Observable, Subscription} from 'rxjs'

import {canonicalJson} from '#sepal/recipe/calculation/canonicalJson'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {uuid} from '~/uuid'

import {credentialId} from './credentialId'
import {acquisitionOf, askedUnder, CURRENT, DRAFTED, standingOf, SUPERSEDED} from './evidenceStanding'
import {ObservationRegistry} from './observationRegistry'
import {SOURCE_BASIS_CHANGED, SOURCE_REVISION_BEHIND, sourceRuntimeError} from './sourceRuntimeError'

// The calculations a recipe's panels ask Earth Engine for, and the current evidence of the dependencies its type
// declares their results depend on (`dependencies`, #sepal/recipe/calculation/freshness).
//
// What an answer reports it read is the session's to know (`learnSources`): a newer revision of a recipe, or another
// token for an asset than the session read before the request began, supersedes whatever else read the older one, so a
// later answer reporting what is older never overrides it. Evidence is held as acquired and judged by the same source
// currency, draft agreement, asset authority and credentials as every other runtime answer (evidenceStanding.js).
//
// A calculation is shared and retained like an observation (observationRegistry.js), identified by its kind, its
// question and the identity of the credentials it is asked under, as an evidence read is by its dependency and
// question. Its answer reports the evidence of what it read. An answer superseded as it is delivered, or read from a
// draft storage does not hold, fails with SOURCE_BASIS_CHANGED; any other is delivered, and its evidence counts as
// acquired for its question, so applying a result just calculated needs no second read.
//
// Dependency evidence is acquired while it is watched: for each dependency a recipe's type declares, as the recipe
// configures it now, published on the recipe (`ui.dependencyEvidence`), runtime only, for synchronous reads; or for one
// question an editor asks of a dependency, told to the editor (`watchQuestion$`). A dependency whose question is null
// for the configuration is not read, and what was published for it is withdrawn. Either is:
//
//   {status: PENDING | OBSERVED | FAILED, question, evidence?, observedAt?, acquisition?, retryAt?}
//
// Every session change judges it again, synchronously: evidence superseded is withdrawn as PENDING while it is read
// again, as it is when none is held; evidence held back by a draft or an asset's authority is PENDING until that
// settles. Current evidence is read again `refreshBeforeMs` before it lapses, and stays published meanwhile. A read
// answering what the session already knows is superseded is read once more, and is then a failure; a failure is retried
// after `retryMs`. Readers judge the age of what is published as they read it (`publishedDependencyEvidence`), and an
// editor judges what it is about to apply against what is held for the question it asks (`dependencyEvidence`). The
// assets held evidence names are claimed while it is watched, so their tokens are kept current (assetRefresh.js). A
// token detects the changes Earth Engine reports; it does not pin the pixels a calculation reads.

export const PENDING = 'PENDING'
export const OBSERVED = 'OBSERVED'
export const FAILED = 'FAILED'
// Published evidence older than Retrieve's authority, as a reader finds it.
export const EXPIRED = 'EXPIRED'

export const DEFAULT_DEPENDENCY_EVIDENCE_POLICY = Object.freeze({maxAgeMs: 300000, refreshBeforeMs: 30000, retryMs: 60000})

// A dependency's evidence as published on the recipe, judged at `now`: {status, evidence}, the evidence only while it is
// OBSERVED and younger than Retrieve's authority, whether or not the runtime has read it again by then.
export const publishedDependencyEvidence = (recipe, dependency, now) => {
    const entry = recipe?.ui?.dependencyEvidence?.[dependency]
    if (entry?.status !== OBSERVED) {
        return {status: entry?.status || null, evidence: null}
    }
    return now - entry.observedAt < DEFAULT_DEPENDENCY_EVIDENCE_POLICY.maxAgeMs
        ? {status: OBSERVED, evidence: entry.evidence}
        : {status: EXPIRED, evidence: null}
}

// Which of a recipe's published dependency evidence has expired at `now`: all a read of it depends on besides the recipe.
export const expiredDependencyEvidence = (recipe, now) =>
    Object.keys(recipe?.ui?.dependencyEvidence || {})
        .filter(dependency => publishedDependencyEvidence(recipe, dependency, now).status === EXPIRED)
        .join()

const SYSTEM_CLOCK = {
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: id => clearTimeout(id)
}

export class CalculationEvidence {
    #session
    #sessionChanges$
    #write
    #claimAssets
    #learnSources
    #loadEvidence$
    #policy
    #clock
    #calculations
    #requests
    #acquired = new Map()
    #watches = new Set()
    #runtime = uuid()
    #acquisitions = 0
    #closed = false

    // learnSources({recipes, assets, askedAt})  tells the session what an answer read: [{id, revision}], [{id, version}],
    //                                            and when its request began
    constructor({
        session, sessionChanges$, write, claimAssets, learnSources, loadEvidence$, policy = DEFAULT_DEPENDENCY_EVIDENCE_POLICY,
        retention, clock = SYSTEM_CLOCK
    }) {
        this.#session = session
        this.#sessionChanges$ = sessionChanges$
        this.#write = write
        this.#claimAssets = claimAssets
        this.#learnSources = learnSources
        this.#loadEvidence$ = loadEvidence$
        this.#policy = policy
        this.#clock = clock
        const deliverableAnswer = (_key, {acquisitions}) => acquisitions.every(acquisition => deliverable(this.#standing(acquisition)))
        this.#calculations = new ObservationRegistry({request$: request => request(), isCurrent: deliverableAnswer, retention, clock})
        // Shared while in flight only: what was acquired is held here.
        this.#requests = new ObservationRegistry({request$: request => request(), isCurrent: () => false, retention, clock})
    }

    // `request$()` asks Earth Engine; `evidenceOf(answer)` is the dependency evidence the answer reports, [] for none.
    calculate$({kind, question, request$, evidenceOf}) {
        return defer(() => {
            const acquired$ = () => {
                const asked = this.#asked()
                return request$().pipe(
                    map(answer => ({answer, acquisitions: evidenceOf(answer).map(evidence => this.#acquired$(evidence, asked))}))
                )
            }
            const key = {kind, question, credentials: credentialId(this.#credentials())}
            return this.#calculations.observe$(acquired$, {key, complete: true})
        }).pipe(
            map(({answer, acquisitions}) => {
                if (!acquisitions.every(acquisition => deliverable(this.#standing(acquisition)))) {
                    throw sourceRuntimeError(SOURCE_BASIS_CHANGED)
                }
                acquisitions.forEach(acquisition => this.#hold(acquisition))
                return answer
            })
        )
    }

    // A dependency's current evidence for `question`, as the session establishes it now: {status, evidence}, the evidence
    // only while OBSERVED. PENDING while it is read for a watch or held back, FAILED while that read failed, and null
    // where nothing establishes it.
    dependencyEvidence({dependency, question}) {
        const held = this.#acquired.get(keyOf(dependency, question))
        const standing = held ? this.#standing(held) : SUPERSEDED
        if (standing !== SUPERSEDED) {
            return standing === CURRENT ? {status: OBSERVED, evidence: held.evidence} : {status: PENDING, evidence: null}
        }
        const watched = [...this.#watches]
            .map(({entries}) => entries.get(dependency))
            .find(entry => entry && same(entry.question, question))
        return {status: watched?.request ? PENDING : watched?.failure ? FAILED : null, evidence: null}
    }

    // The dependencies a recipe's type declares, as it configures them, kept current and published on it.
    watch$(recipeId) {
        return this.#watch$(() => {
            const recipe = this.#session().catalogue?.[recipeId]
            return recipe
                ? (recipeType(recipe.type)?.dependencies || []).map(({id, question}) => ({id, question: question(recipe.model)}))
                : null
        }, () => (id, entry) => this.#publish(recipeId, id, entry))
    }

    // One question an editor asks of a dependency, kept current and told to it whenever what it is told changes.
    watchQuestion$({dependency, question}) {
        return this.#watch$(() => [{id: dependency, question}], subscriber => {
            let told = null
            return (_id, entry) => {
                if (entry && !samePublication(told, entry)) {
                    told = entry
                    subscriber.next(entry)
                }
            }
        })
    }

    close() {
        this.#closed = true
        this.#calculations.clear()
        this.#requests.clear()
        this.#acquired.clear()
    }

    #watch$(dependencies, publisherOf) {
        return new Observable(subscriber => {
            const watch = {dependencies, publish: publisherOf(subscriber), entries: new Map(), release: null}
            this.#watches.add(watch)
            const changes = this.#sessionChanges$.subscribe(() => this.#update(watch))
            this.#update(watch)
            return () => {
                this.#watches.delete(watch)
                changes.unsubscribe()
                watch.entries.forEach(entry => this.#cancel(entry))
                watch.release?.()
            }
        })
    }

    #update(watch) {
        const dependencies = this.#closed || !this.#watches.has(watch) ? null : watch.dependencies()
        if (dependencies) {
            const held = dependencies.map(({id, question}) =>
                question == null ? this.#drop(watch, id) : this.#keep(watch, id, question))
            this.#claim(watch, held.filter(Boolean))
        }
    }

    // A dependency the configuration asks nothing of: nothing is read for it, and nothing is held or published.
    #drop(watch, id) {
        const entry = watch.entries.get(id)
        if (entry) {
            this.#cancel(entry)
            watch.entries.delete(id)
        }
        watch.publish(id, null)
        return null
    }

    // What a watch is told of one dependency as it asks it now, and whether it is read for it. Returns the evidence held
    // for it, if any.
    #keep(watch, id, question) {
        const entry = this.#entryOf(watch, id, question)
        const credentials = this.#credentials()
        if (entry.request && entry.request.credentials !== credentials) {
            this.#cancel(entry)
        }
        const held = this.#acquired.get(keyOf(id, question)) || null
        const standing = held ? this.#standing(held) : SUPERSEDED
        const retryAt = entry.failure?.credentials === credentials ? entry.failure.retryAt : 0
        if (standing === CURRENT) {
            watch.publish(id, observed(question, held))
        } else if (standing !== SUPERSEDED || entry.request) {
            watch.publish(id, {status: PENDING, question})
        } else if (retryAt > this.#clock.now()) {
            watch.publish(id, {status: FAILED, question, error: entry.failure.error, retryAt})
        }
        const waiting = standing !== CURRENT && standing !== SUPERSEDED
        if (!waiting && !entry.request) {
            const due = standing === CURRENT ? held.observedAt + this.#policy.maxAgeMs - this.#policy.refreshBeforeMs : 0
            this.#readAt(watch, entry, id, Math.max(due, retryAt))
        }
        return held
    }

    #readAt(watch, entry, id, at) {
        if (at > this.#clock.now()) {
            this.#schedule(watch, entry, at)
        } else {
            this.#acquire(watch, entry, id)
        }
    }

    // The watch's state for a dependency, started again whenever it is asked another question.
    #entryOf(watch, id, question) {
        const entry = watch.entries.get(id)
        if (entry && same(entry.question, question)) {
            return entry
        }
        entry && this.#cancel(entry)
        const fresh = {question, request: null, timer: null, timerAt: null, failure: null, reread: null}
        watch.entries.set(id, fresh)
        return fresh
    }

    #acquire(watch, entry, id) {
        const {question} = entry
        const credentials = this.#credentials()
        this.#clearTimer(entry)
        entry.failure = null
        const subscription = new Subscription()
        entry.request = {credentials, subscription}
        const held = this.#acquired.get(keyOf(id, question))
        if (!held || this.#standing(held) !== CURRENT) {
            watch.publish(id, {status: PENDING, question})
        }
        // Whoever joins a read shares what its requester asked under, which names the same credentials.
        const read$ = () => {
            const asked = this.#asked()
            return this.#loadEvidence$({dependency: id, question}).pipe(map(evidence => this.#acquired$(evidence, asked)))
        }
        const key = {dependency: id, question, credentials: credentialId(credentials)}
        subscription.add(this.#requests.observe$(read$, {key, complete: false}).subscribe({
            next: acquisition => this.#arrived(watch, entry, id, acquisition),
            error: error => this.#failed(watch, entry, credentials, String(error?.message || error))
        }))
    }

    // Storage answering with what the session already knows is superseded is asked once more, in case the answer was
    // just late; the same answer again is a failure, retried after its interval rather than read for ever.
    #arrived(watch, entry, id, acquisition) {
        entry.request = null
        if (this.#standing(acquisition) === SUPERSEDED) {
            const attempt = canonicalJson(acquisition.evidence.provenance)
            if (entry.reread !== attempt) {
                entry.reread = attempt
                return this.#acquire(watch, entry, id)
            }
            return this.#failed(watch, entry, acquisition.credentials, sourceRuntimeError(SOURCE_REVISION_BEHIND).message)
        }
        entry.reread = null
        this.#hold(acquisition)
        this.#update(watch)
    }

    #failed(watch, entry, credentials, error) {
        entry.request = null
        entry.failure = {credentials, error, retryAt: this.#clock.now() + this.#policy.retryMs}
        this.#update(watch)
    }

    #schedule(watch, entry, at) {
        if (entry.timer !== null && entry.timerAt === at) {
            return
        }
        this.#clearTimer(entry)
        entry.timerAt = at
        entry.timer = this.#clock.setTimeout(() => {
            entry.timer = null
            this.#update(watch)
        }, at - this.#clock.now())
    }

    #cancel(entry) {
        entry.request?.subscription.unsubscribe()
        entry.request = null
        this.#clearTimer(entry)
    }

    #clearTimer(entry) {
        if (entry.timer !== null) {
            this.#clock.clearTimeout(entry.timer)
            entry.timer = null
        }
    }

    #publish(recipeId, id, entry) {
        const published = this.#session().catalogue?.[recipeId]?.ui?.dependencyEvidence?.[id]
        const changed = entry ? !samePublication(published, entry) : Boolean(published)
        if (!this.#closed && changed) {
            this.#write({recipeId, type: 'DEPENDENCY_EVIDENCE', writes: [{path: `ui.dependencyEvidence.${id}`, value: entry || undefined}]})
        }
    }

    #claim(watch, held) {
        const ids = held.flatMap(({evidence}) => evidence.provenance.assets.map(({id}) => id))
        const release = watch.release
        watch.release = ids.length ? this.#claimAssets(ids) : null
        release?.()
    }

    #asked() {
        return askedUnder(this.#session(), this.#clock.now())
    }

    // What an answer read is learned before it is judged, so it is judged against it.
    #acquired$(evidence, asked) {
        const {recipes, assets} = evidence.provenance
        this.#learnSources({recipes, assets, askedAt: asked.at})
        const id = `${this.#runtime}:${++this.#acquisitions}`
        return acquisitionOf({id, evidence, asked, session: this.#session(), now: this.#clock.now()})
    }

    #standing(acquisition) {
        return standingOf(acquisition, this.#session(), {now: this.#clock.now(), maxAgeMs: this.#policy.maxAgeMs})
    }

    // The latest evidence acquired for a question is held; what has outlived its authority is forgotten.
    #hold(acquisition) {
        const now = this.#clock.now()
        this.#acquired.forEach((held, key) => now - held.observedAt >= this.#policy.maxAgeMs && this.#acquired.delete(key))
        const key = keyOf(acquisition.evidence.dependency, acquisition.evidence.question)
        const held = this.#acquired.get(key)
        if (!held || held.observedAt <= acquisition.observedAt) {
            this.#acquired.set(key, acquisition)
        }
    }

    #credentials() {
        return this.#session().credentials
    }
}

// An answer read from what the session already knows is superseded, or from a draft storage does not hold, is not
// about the sources as they are; one waiting on an asset's authority is, once that settles.
const deliverable = standing => standing !== SUPERSEDED && standing !== DRAFTED

const observed = (question, {id, evidence, observedAt}) => ({status: OBSERVED, question, evidence, observedAt, acquisition: id})

const samePublication = (published, entry) => Boolean(published)
    && published.status === entry.status
    && published.acquisition === entry.acquisition
    && published.retryAt === entry.retryAt
    && same(published.question, entry.question)

const keyOf = (dependency, question) => canonicalJson({dependency, question})

const same = (a, b) => canonicalJson(a) === canonicalJson(b)
