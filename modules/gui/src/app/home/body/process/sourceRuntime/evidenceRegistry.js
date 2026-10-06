import {filter, map, NEVER, Observable, of, Subscription, switchMap, take, tap} from 'rxjs'

import {completeRecipeClosure$, DEFAULT_RECIPE_CLOSURE_LIMITS} from '#sepal/recipe/source/completeRecipeClosure'
import {createLoadRecipesById$} from '#sepal/recipe/source/recipeClosureLoader'
import {ASSET} from '#sepal/recipe/source/reference'
import {getLogger} from '~/log'
import {uuid} from '~/uuid'

import {OBSERVED, sourceKeyOf, UNAVAILABLE} from '../recipe/sourceEvidence'
import {
    assetVersion,
    currentRecords,
    isBehind,
    outdatedBasis,
    resolvedBasis,
    startingBasis
} from '../recipe/sourceEvidenceBasis'

const log = getLogger('sourceEvidence')

// Keeps the evidence each watched recipe's consumers need about its source current, and shares it between them: its
// editor, the map layers drawing it - on its own map or another's - its Retrieve panel and its charts.
//
// One observation per recipe, published on the recipe (`ui.sourceEvidence`), whoever watches it. What is observed is
// the type's: an editor names its observation, and the others use the one its type registers (`sourceObservation`).
// How much is acquired is what the watchers need:
//
//   FULL     the observation itself: an editor's presentation, or an operation a declared requirement holds to the
//            whole of the evidence (`operations`, sourceRequirements.js)
//   RECORDS  only the records of the source's closure, for operations held to its provider chain alone
//            (`providerOperations`): the chain is judged from those records, and nothing is asked of Earth Engine
//
// The lifecycle turns on one basis: what an answer was actually read from - records, assets, selections, credentials,
// refreshes (sourceEvidenceBasis.js). It is taken when an observation starts and replaced by what its closure read,
// complete or failed; it decides both whether to read again and whether an answer may still be published, and readers
// judge published evidence by the same rule against it (`ownerOf`). Each observation is identified uniquely across
// runtimes, and its evidence is published under that identity, so a newer basis never vouches for older evidence.
//
// Every update is synchronous with the session change that caused it, and anything it does can dispatch again - claiming
// records or assets, marking an observation started, publishing, applying an editor's defaults - re-entering it. So an
// observation's identity and the work it owns are installed before anything can dispatch, and an update re-entered from
// inside finds them in place; every write is made only for the entry, observation and basis still current when it is
// made, and only to a recipe the session still holds; and what the editor's policy has processed is recorded in the
// same write, so an update re-entered from it finds nothing left to do.
//
// Records a closure reads, from storage or from the session, are claimed in the session's recipe cache while the recipe
// is watched, as a component's are (recipeCacheClaims.js). Assets are claimed from the runtime while the observation
// reads them. The last watcher leaving cancels the work and releases both.
//
// A selection being edited is observed the same way, before it is applied (`watchCandidate$`): over the recipe as it
// would be with the edit applied, with its evidence held by the registry for the form that asked, never published.
//
// What only the editor does: apply its observation's defaults (`applyAccepted`), in the action that publishes the
// evidence they come from and only while the recipe is open, and announce a failure (`reportUnavailable`). Evidence
// obtained while no editor watched is processed by the editor's policy once it attaches, against the last evidence that
// policy processed (`ui.sourceEvidenceApplied`) - never against evidence it did not see - and a failure no editor has
// seen is announced to it once.

export const FULL = 'FULL'
export const RECORDS = 'RECORDS'

export const PENDING = 'PENDING'
export const COMPLETE = 'COMPLETE'
export const FAILED = 'FAILED'

const EMPTY_GRAPH = {recipes: [], edges: [], diagnostics: []}

const SYSTEM_CLOCK = {
    now: () => Date.now(),
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: id => clearTimeout(id)
}

export class EvidenceRegistry {
    #session
    #sessionChanges$
    #claimRecords
    #claimAssets
    #write
    #observationOf
    #requirementsOf
    #clock
    #entries = new Map()
    #candidates = new Map()
    #candidateIds = 0
    #runtime = uuid()
    #observations = 0
    #listening = null
    #closed = false

    // session()               → the evidence session (evidenceSession, sourceEvidenceBasis.js), or null when there is none
    // sessionChanges$         notifies after every session change
    // claimRecords()          → {use(id), load$(id), reload$(id), release()}, a claimant on the session's recipe cache
    // claimAssets(ids)        → release
    // write({recipeId, type, writes, whenOpen})
    //                         applies [{path, value, merge?}] to the recipe if the session still holds it, and `whenOpen`
    //                         with them if it is open; returns whether it wrote
    // observationOf(recipe)   → the observation the recipe's type registers
    // requirementsOf(recipe)  → the source requirements the recipe's type declares
    constructor({
        session, sessionChanges$ = NEVER, claimRecords, claimAssets = () => () => {}, write,
        observationOf = () => null, requirementsOf = () => [], clock = SYSTEM_CLOCK
    }) {
        this.#session = session
        this.#sessionChanges$ = sessionChanges$
        this.#claimRecords = claimRecords
        this.#claimAssets = claimAssets
        this.#write = write
        this.#observationOf = observationOf
        this.#requirementsOf = requirementsOf
        this.#clock = clock
    }

    // Watches a recipe's evidence for as long as it is subscribed: for an operation over it, or as its editor, naming the
    // observation and the defaults and announcements that are the editor's.
    watch$({recipeId, operation = null, observation = null}) {
        return new Observable(subscriber => {
            if (this.#closed) {
                subscriber.complete()
                return
            }
            const watcher = {operation, observation, subscriber}
            const entry = this.#entries.get(recipeId) || this.#add(recipeId)
            entry.watchers.add(watcher)
            this.#listen()
            this.#update(entry)
            return () => this.#unwatch(entry, watcher)
        })
    }

    // Keeps evidence current for a selection being edited - `overlay(recipe)` the recipe as it would be with the edit
    // applied, which must hand back the same selection objects for as long as the edit is the same - without publishing
    // it. The evidence is held here, and the subscriber is handed {owner, evidence} whenever either changes, `owner` as
    // `ownerOf` answers for a recipe and `evidence` as a recipe's `ui.sourceEvidence` would hold it. It is observed by the
    // observation the recipe's type registers, under the same rules as a recipe's evidence; it applies no defaults,
    // announces nothing and writes nothing.
    watchCandidate$({recipeId, overlay}) {
        return new Observable(subscriber => {
            if (this.#closed) {
                subscriber.complete()
                return
            }
            const entry = this.#addCandidate(recipeId, overlay, subscriber)
            this.#listen()
            this.#update(entry)
            subscriber.next(candidateState(entry))
            return () => {
                this.#teardown(entry)
                this.#stopListeningIfIdle()
            }
        })
    }

    // {observationId, basis, observes, records} of the observation the recipe's evidence is being kept current by, or null.
    ownerOf(recipeId) {
        return this.#entries.get(recipeId)?.state || null
    }

    close() {
        if (this.#closed) {
            return
        }
        this.#closed = true
        this.#stopListening()
        const entries = [...this.#entries.values(), ...this.#candidates.values()]
        entries.forEach(entry => this.#teardown(entry))
        entries.flatMap(({watchers}) => [...watchers]).forEach(({subscriber}) => subscriber.complete())
    }

    #add(recipeId) {
        const entry = {
            ...newEntry(recipeId),
            key: recipeId,
            table: this.#entries,
            recipeOf: session => session.loadedRecipes[recipeId]
        }
        this.#entries.set(recipeId, entry)
        return entry
    }

    #addCandidate(recipeId, overlay, subscriber) {
        const entry = {
            ...newEntry(recipeId),
            key: ++this.#candidateIds,
            table: this.#candidates,
            candidate: subscriber,
            evidence: null,
            recipeOf: session => {
                const recipe = session.loadedRecipes[recipeId]
                return recipe && {...overlay(recipe), ui: {...recipe.ui, sourceEvidence: entry.evidence || undefined}}
            }
        }
        entry.watchers.add({subscriber})
        this.#candidates.set(entry.key, entry)
        return entry
    }

    #unwatch(entry, watcher) {
        entry.watchers.delete(watcher)
        if (!this.#live(entry)) {
            return
        }
        if (entry.watchers.size) {
            return this.#update(entry)
        }
        this.#teardown(entry)
        this.#stopListeningIfIdle()
    }

    #teardown(entry) {
        if (entry.table.get(entry.key) === entry) {
            entry.table.delete(entry.key)
        }
        this.#stop(entry)
        entry.records?.release()
        entry.records = null
    }

    #live(entry) {
        return !this.#closed && entry.table.get(entry.key) === entry
    }

    #current(entry, observationId) {
        return this.#live(entry) && entry.state?.observationId === observationId
    }

    #update(entry) {
        const session = this.#sessionNow()
        const recipe = session && entry.recipeOf(session)
        const wanted = recipe && this.#wanted(entry, recipe)
        const key = wanted && sourceKeyOf(wanted.observation.sourceReference(recipe))
        if (!key) {
            return this.#stop(entry)
        }
        this.#adoptFirstVersions(entry, session)
        if (!this.#live(entry)) {
            return
        }
        if (!entry.state || this.#needsObservation(entry, wanted, recipe, session)) {
            return this.#observe(entry, wanted, recipe, session)
        }
        this.#editorEffects(entry, recipe, session)
    }

    // What the watchers need, by what its type declares for the operations they watch for. An editor needs it all, and
    // so does a selection being edited, since every requirement over it is judged.
    #wanted(entry, recipe) {
        if (entry.candidate) {
            const observation = this.#observationOf(recipe)
            return observation && {mode: FULL, observation}
        }
        const watchers = [...entry.watchers]
        const editor = watchers.find(({observation}) => observation)
        if (editor) {
            return {mode: FULL, observation: editor.observation}
        }
        const observation = this.#observationOf(recipe)
        const operations = watchers.map(({operation}) => operation).filter(Boolean)
        const requirements = this.#requirementsOf(recipe)
        const needs = field => requirements.some(requirement => operations.some(operation => requirement[field]?.includes(operation)))
        if (!observation) {
            return null
        }
        if (needs('operations')) {
            return {mode: FULL, observation}
        }
        return needs('providerOperations') ? {mode: RECORDS, observation} : null
    }

    // An observation already acquiring all of it goes on answering a watcher that needs only the records.
    #needsObservation(entry, wanted, recipe, session) {
        return wanted.observation !== entry.observation
            || (wanted.mode === FULL && entry.mode !== FULL)
            || this.#outdated(entry, recipe, session)
    }

    #observe(entry, {mode, observation}, recipe, session) {
        entry.work?.unsubscribe()
        this.#clock.clearTimeout(entry.expiry)
        const work = new Subscription()
        const observationId = `${this.#runtime}:${++this.#observations}`
        entry.work = work
        entry.mode = mode
        entry.observation = observation
        entry.error = null
        entry.records = entry.records || this.#claimRecords()
        // Held from the moment the request starts and replaced once the closure says what it actually read. Kept
        // whatever the outcome: a failure that cleared it would be retried by the next update.
        entry.state = {
            observationId,
            basis: startingBasis({reference: observation.sourceReference(recipe), recipe, session}),
            observes: mode === FULL,
            records: PENDING
        }
        // From here on anything may dispatch, and an update it causes finds this observation in place.
        this.#claimAssetsOf(entry, observationId)
        this.#notify(entry, observationId, {observationId})
        if (!this.#current(entry, observationId)) {
            return
        }
        work.add(this.#acquire$(entry, observationId, recipe, session).subscribe({
            next: evidence => mode === FULL
                ? this.#publish(entry, observationId, {status: OBSERVED, ...evidence})
                : this.#settleRecords(entry, observationId, COMPLETE),
            error: error => {
                log.debug(() => `Could not observe source ${entry.state?.basis.key}: ${error.message}`)
                this.#settleRecords(entry, observationId, FAILED)
                mode === FULL && this.#publish(entry, observationId, {status: UNAVAILABLE}, error)
            }
        }))
    }

    #acquire$(entry, observationId, recipe, session) {
        const reference = entry.observation.sourceReference(recipe)
        return this.#closure$(entry, observationId, reference, recipe, session).pipe(
            switchMap(({graph, recipesById}) => {
                // Recorded before anything is decided about the graph. A graph that cannot run was still read from
                // records, and those records are what a repair would change.
                this.#resolved(entry, observationId, this.#resolvedBasis(entry, {reference, recipe, graph, recipesById, session}))
                if (entry.mode !== FULL) {
                    return of(null)
                }
                this.#settleRecords(entry, observationId, COMPLETE)
                // COMPLETE carries either no diagnostics or definitive ones - a cycle, a malformed declaration. There
                // is no answer to give about a graph that cannot run.
                if (graph.diagnostics.length) {
                    throw new Error(`Unresolved dependencies: ${graph.diagnostics[0].code}`)
                }
                return entry.observation.observe$({recipe, graph, recipesById})
            })
        )
    }

    #closure$(entry, observationId, reference, recipe, session) {
        // A directly selected asset has no recipe edges; the basis tracks its version explicitly.
        if (reference.type === ASSET) {
            return of({graph: EMPTY_GRAPH, recipesById: new Map()})
        }
        const loadRecipesById$ = this.#loadRecipesById$(entry, session)
        const seeds = new ClaimedSeeds(currentRecords(session), entry.records, () => this.#sessionNow())
        const seeded = seeds.get(reference.id)
        return (seeded ? of(seeded) : loadRecipesById$({ids: [reference.id], concurrency: 1}).pipe(map(([record]) => record))).pipe(
            switchMap(rootRecipe => completeRecipeClosure$({
                rootRecipe,
                seedRecipesById: seeds,
                loadRecipesById$,
                limits: DEFAULT_RECIPE_CLOSURE_LIMITS
            }).pipe(
                // A closure that fails still read records before it stopped, and repairing one of those is what would
                // let it succeed - so they become the basis, as a completed closure's do.
                tap(({status, graph, recipesById}) => {
                    if (status === 'FAILED') {
                        this.#resolved(entry, observationId, this.#resolvedBasis(entry, {reference, recipe, graph, recipesById, session}))
                    }
                }),
                filter(({status}) => status === 'COMPLETE'),
                take(1)
            ))
        )
    }

    // Records the recipe cache claims for this recipe's watchers. One the listing has moved past is read again
    // rather than answered from the copy the session holds.
    #loadRecipesById$(entry, session) {
        const records = entry.records
        return createLoadRecipesById$({
            loadRecipe$: id => isBehind(session, id) ? records.reload$(id) : records.load$(id)
        })
    }

    // An acquisition of records reads no asset, so its basis names none.
    #resolvedBasis(entry, read) {
        return resolvedBasis({...read, assets: entry.mode === FULL})
    }

    #resolved(entry, observationId, basis) {
        if (this.#current(entry, observationId)) {
            entry.state = {...entry.state, basis}
            this.#claimAssetsOf(entry, observationId)
            this.#expireAt(entry, basis)
        }
    }

    // The provider chain is known once its records are, or known not to be had once they cannot be.
    #settleRecords(entry, observationId, records) {
        if (!this.#current(entry, observationId) || entry.state.records !== PENDING) {
            return
        }
        entry.state = {...entry.state, records}
        if (entry.mode !== FULL) {
            this.#notify(entry, observationId, {observationId, records})
        }
    }

    #publish(entry, observationId, evidence, error) {
        const session = this.#sessionNow()
        const recipe = session && entry.recipeOf(session)
        if (!this.#current(entry, observationId) || !recipe || this.#outdated(entry, recipe, session)) {
            return
        }
        const {basis} = entry.state
        const published = {
            sourceKey: basis.key,
            ...evidence,
            ...retainedObservation(recipe, evidence),
            observationId
        }
        if (entry.candidate) {
            entry.evidence = published
            return entry.candidate.next(candidateState(entry))
        }
        const editor = this.#editor(entry)
        entry.error = error || null
        if (evidence.status === UNAVAILABLE && editor) {
            entry.reported = observationId
        }
        this.#write({
            recipeId: entry.recipeId,
            type: 'SET_SOURCE_EVIDENCE',
            writes: [{path: 'ui.sourceEvidence', value: published}],
            whenOpen: evidence.status === OBSERVED ? this.#applied(editor, recipe, published) : []
        })
        if (evidence.status === UNAVAILABLE && editor) {
            editor.reportUnavailable?.({recipe, error})
        }
    }

    // Evidence obtained while no editor watched, processed once one does - or, for a failure, announced.
    #editorEffects(entry, recipe, session) {
        const editor = this.#editor(entry)
        const evidence = recipe.ui?.sourceEvidence
        if (!editor || evidence?.observationId !== entry.state.observationId || this.#outdated(entry, recipe, session)) {
            return
        }
        if (evidence.status === OBSERVED && editor.applyAccepted
            && recipe.ui?.sourceEvidenceApplied?.observationId !== evidence.observationId) {
            this.#write({
                recipeId: entry.recipeId,
                type: 'APPLY_SOURCE_EVIDENCE',
                writes: [],
                whenOpen: this.#applied(editor, recipe, evidence)
            })
        }
        if (evidence.status === UNAVAILABLE && editor.reportUnavailable && entry.error && entry.reported !== evidence.observationId) {
            entry.reported = evidence.observationId
            editor.reportUnavailable({recipe, error: entry.error})
        }
    }

    // The editor's defaults from accepted evidence, written with the record of what its policy has processed - whether or
    // not that produced any. Failures never seed defaults or replace that record.
    #applied(editor, recipe, evidence) {
        if (!editor?.applyAccepted) {
            return []
        }
        return [
            ...editor.applyAccepted({recipe, evidence, previous: recipe.ui?.sourceEvidenceApplied}),
            {path: 'ui.sourceEvidenceApplied', value: evidence}
        ]
    }

    #editor(entry) {
        return [...entry.watchers].find(({observation}) => observation)?.observation || null
    }

    #notify(entry, observationId, observation) {
        if (!this.#current(entry, observationId)) {
            return
        }
        if (entry.candidate) {
            return entry.candidate.next(candidateState(entry))
        }
        this.#write({
            recipeId: entry.recipeId,
            type: 'SOURCE_EVIDENCE_OBSERVATION',
            writes: [{path: 'ui.sourceEvidenceObservation', value: observation}],
            whenOpen: []
        })
    }

    #stop(entry) {
        entry.work?.unsubscribe()
        entry.work = null
        entry.state = null
        entry.mode = null
        entry.observation = null
        entry.error = null
        this.#clock.clearTimeout(entry.expiry)
        entry.expiry = null
        entry.releaseAssets?.()
        entry.releaseAssets = null
        if (entry.candidate && this.#live(entry)) {
            entry.candidate.next(candidateState(entry))
        }
    }

    // The assets the basis names are claimed before those it no longer names are released. An acquisition of records
    // reads no asset. Claiming can dispatch, and a claim made for an observation that ended meanwhile is no one's.
    #claimAssetsOf(entry, observationId) {
        const ids = entry.mode === FULL
            ? entry.state.basis.dependencies.filter(({assetId}) => assetId).map(({assetId}) => assetId)
            : []
        const release = ids.length ? this.#claimAssets(ids) : null
        if (!this.#current(entry, observationId)) {
            release?.()
            return
        }
        const previous = entry.releaseAssets
        entry.releaseAssets = release
        previous?.()
    }

    // A token first learned after the basis was taken is no change: the evidence was read from what it describes, so the
    // basis takes it, and the next token that differs is one. A candidate's form judges by the owner it was handed, so it
    // is handed this one at once: a change before the next update must find it.
    #adoptFirstVersions(entry, session) {
        const basis = entry.state?.basis
        const unknown = dependency => dependency.assetId && dependency.version === undefined
            && assetVersion(session, dependency.assetId) !== undefined
        if (basis?.dependencies.some(unknown)) {
            entry.state = {
                ...entry.state,
                basis: {
                    ...basis,
                    dependencies: basis.dependencies.map(dependency => unknown(dependency)
                        ? {...dependency, version: assetVersion(session, dependency.assetId)}
                        : dependency)
                }
            }
            entry.candidate?.next(candidateState(entry))
        }
    }

    // Evidence read from a source without a token is read again once it is too old.
    #expireAt(entry, basis) {
        this.#clock.clearTimeout(entry.expiry)
        entry.expiry = Number.isFinite(basis.expiresAt)
            ? this.#clock.setTimeout(() => this.#live(entry) && this.#update(entry), Math.max(0, basis.expiresAt - this.#clock.now()))
            : null
    }

    #outdated(entry, recipe, session) {
        return outdatedBasis(entry.state.basis, {
            recipe,
            sourceKey: sourceKeyOf(entry.observation.sourceReference(recipe)),
            session
        })
    }

    #sessionNow() {
        const session = this.#session()
        return session && {...session, now: this.#clock.now()}
    }

    #listen() {
        if (!this.#listening && !this.#closed) {
            this.#listening = this.#sessionChanges$.subscribe(() =>
                [...this.#entries.values(), ...this.#candidates.values()].forEach(entry => this.#live(entry) && this.#update(entry))
            )
        }
    }

    #stopListeningIfIdle() {
        if (!this.#entries.size && !this.#candidates.size) {
            this.#stopListening()
        }
    }

    #stopListening() {
        this.#listening?.unsubscribe()
        this.#listening = null
    }
}

const newEntry = recipeId => ({
    recipeId, watchers: new Set(), state: null, mode: null, observation: null, work: null,
    records: null, releaseAssets: null, expiry: null, error: null, reported: null
})

const candidateState = ({state, evidence}) => ({owner: state, evidence})

// A read that failed says the source could not be reached. It does not unsay what the last successful read found, or
// which source that was - and which source an answer was about is what a consumer needs to know whether an answer
// coming back now is about the one it last had an answer for. Availability is the status; this is provenance.
const retainedObservation = (recipe, evidence) => {
    if (evidence.status === OBSERVED) {
        return {}
    }
    const evidenceNow = recipe?.ui?.sourceEvidence
    const observed = evidenceNow?.status === OBSERVED ? evidenceNow : evidenceNow?.lastObserved
    return observed ? {lastObserved: observed} : {}
}

// The session's records a closure starts from, each claimed for the watch as the closure takes it. A record read from
// the session is held by whoever cached it, and could otherwise leave with them while the watch still needs it. One they
// let go of after the closure started - an editor closing on a selection it had read, as the alerts begin observing it -
// is no seed: the closure loads it through the watch's claim, so the session holds it again for as long as that lasts.
class ClaimedSeeds extends Map {
    #claimant
    #sessionNow

    constructor(records, claimant, sessionNow) {
        super(records)
        this.#claimant = claimant
        this.#sessionNow = sessionNow
    }

    has(id) {
        return super.has(id) && Boolean(this.#sessionNow()?.loadedRecipes[id])
    }

    get(id) {
        if (!this.has(id)) {
            return undefined
        }
        this.#claimant.use(id)
        return super.get(id)
    }
}
