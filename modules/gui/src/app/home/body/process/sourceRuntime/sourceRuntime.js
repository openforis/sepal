import _ from 'lodash'
import {defer, NEVER, Observable, Subscriber, Subscription, tap} from 'rxjs'

import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {dependencyValidity} from '#sepal/recipe/source/dependencyValidity'

import {AGREED} from '../draftAgreement'
import {createRecipeImageOutputObserver, observeImageBands$} from '../recipe/imageOutputObserver'
import {recipeContent} from '../recipe/recipeContent'
import {compatibleBasis, DEPENDENCIES, DESCRIBE, outputLoading, REFRESH} from '../recipe/recipeOutput'
import {DEFAULT_LISTING_POLICY, ListingRefresh} from './listingRefresh'
import {DEFAULT_OBSERVATION_RETENTION, ObservationRegistry} from './observationRegistry'
import {DEFAULT_OUTPUT_RETENTION, OutputRegistry} from './outputRegistry'
import {createLoadRecipesById$} from './recipeClosureLoader'
import {PRIVATE, recordCurrency, SESSION} from './recordCurrency'
import {SOURCE_IDENTITY_CHANGED, SOURCE_RUNTIME_UNAVAILABLE, sourceRuntimeError} from './sourceRuntimeError'

// The GUI source runtime.
//
// Consumers ask it about a source; they never learn where dependency records come from, how observations are
// routed, or how a missing recipe is loaded. Those are the things this boundary exists to hide.
//
// `resolveImageOutput$` is deliberately distinct from the shared library's pure synchronous `resolveImageOutput`:
// this one observes runtime evidence asynchronously.
//
// Cold and one-shot. Subscription starts the operation and captures the environment; unsubscription is the only
// public cancellation. The stream never errors - a failed observation, a broken environment and an unexpected
// throw all become a terminal UNAVAILABLE carrying the original error - so no consumer has to defend the error
// channel to stay correct.
//
// A terminal answers two questions about the one closure this operation completed: what the recipe's output is,
// from what its providers read, and whether its dependencies are structurally sound, from the whole closure.
// `dependencyValidity` is null where the operation ended before its closure said anything. `basis` is the content
// of every record that closure read, so a caller holding the answer can tell whether it is still about the
// records it now has.
//
// `completeDependencies$` is the same operation stopped after its closure: validity without describing, for a
// caller whose bands are already known and must not be failed by a description it never needed.
//
// `watchOutput$`, `heldFor` and `retryOutput` are for consumers with a lifetime of their own - map layers and Retrieve
// panels. They watch an output question for as long as they are open and read what the runtime holds for it; the
// runtime shares the loading their reads name between them (outputRegistry.js). `session` and `sessionChanges$` are
// what the watches read the session from; without them nothing is ever watched.
//
// A watch's work is told of every record its closure reads as the record is read - from the session or loaded here -
// so evidence arriving later that supersedes one withdraws the work, finished or not (outputRegistry.js). A cached
// record the listing has moved past is read again before a watch answers from it (`REFRESH`), and replaces the cached
// copy only where one is present, closed and older.
//
// Band observations are shared between every description asking Earth Engine the same question, whichever output it
// describes (observationRegistry.js), identified by what Earth Engine evaluates: the recipe as it is sent, the evidence
// about every record Earth Engine reads for it itself, the assets it reads and the credentials.
//
// While anything is watched the runtime keeps the recipe listing - its evidence of recipe revisions - recent
// (listingRefresh.js). A consumer opening a watch refreshes evidence older than a minute; `refreshRecipeListing` does
// the same for one that opens without watching.

const PENDING = 'PENDING'

export const createSourceRuntime = ({
    environment$,
    session = () => NO_SESSION,
    sessionChanges$ = NEVER,
    createObserver = createRecipeImageOutputObserver,
    observeBands$ = observeImageBands$,
    observationRetention = DEFAULT_OBSERVATION_RETENTION,
    completeClosure$ = completeRecipeClosure$,
    loadRecipesById$ = createLoadRecipesById$(),
    closureLimits = DEFAULT_RECIPE_CLOSURE_LIMITS,
    retention = DEFAULT_OUTPUT_RETENTION,
    updateRecipeListing = () => {},
    replaceCachedRecipe = () => false,
    loadRecipeListing$,
    wakeups$,
    listingPolicy = DEFAULT_LISTING_POLICY,
    clock
}) => {
    const observations = new ObservationRegistry({
        observeBands$,
        isCurrent: key => {
            const current = session()
            const currency = recordCurrency(current)
            return key.credentials === credentialId(current.credentials)
                && !key.dependencies.some(dependency => currency.superseded(dependency))
        },
        retention: observationRetention,
        ...(clock && {clock})
    })

    // What identifies an observation of `request`, made while describing `graph`.
    const observationOf = (request, graph) => {
        const current = session()
        const currency = recordCurrency(current)
        const {records, assets, missing} = closureOf(request.reference, graph)
        const dependencies = records.map(record => _.pick(currency.evidence(record, PRIVATE), EVIDENCE))
        return {
            key: {
                observes: request.observes ?? null,
                reference: request.reference,
                submitted: request.recipe ? _.omit(request.recipe, NOT_EXECUTED) : null,
                dependencies,
                assets,
                credentials: credentialId(current.credentials)
            },
            complete: !missing && dependencies.every(({revision, agreement}) => revision !== null && agreement === AGREED)
        }
    }

    const operation$ = ({recipe, describes, reads = NO_READS}) => new Observable(subscriber => {
        // Ownership is established before anything can publish. A synchronous LOADING, or an invalidation raised
        // from inside a subscriber reacting to it, both re-enter here while setup is still running; without this
        // the operation would be publishing before it owned the work it was publishing about.
        let settled = false
        let observer = null
        let captured = null
        let closureOutcome = null
        let loadingPublished = false
        const work = new Subscription()

        const release = () => {
            const currentObserver = observer
            observer = null
            work.unsubscribe()
            currentObserver?.cancel()
        }

        const terminate = envelope => {
            if (settled) {
                return
            }
            settled = true
            subscriber.next({
                ...envelope,
                dependencyValidity: closureOutcome ? dependencyValidity(closureOutcome) : null,
                basis: closureOutcome ? basisOf(closureOutcome.graph) : []
            })
            release()
            subscriber.complete()
        }

        const unavailable = error => terminate(describes
            ? {status: 'UNAVAILABLE', description: null, diagnostics: [], error}
            : {status: 'UNAVAILABLE', error})

        const publishLoading = () => {
            if (!settled && !loadingPublished) {
                loadingPublished = true
                subscriber.next(describes
                    ? {status: 'LOADING', description: null, diagnostics: [], error: null}
                    : {status: 'LOADING', error: null})
            }
        }

        const observe = graph => {
            const currentObserver = createObserver({
                observeBands$: request => observations.observe$(request, observationOf(request, graph))
            })
            observer = currentObserver
            const observation = new Subscriber({
                next: state => {
                    if (settled || state.status === PENDING) {
                        return
                    }
                    if (state.status === 'LOADING') {
                        publishLoading()
                    } else {
                        terminate(state)
                    }
                },
                error: unavailable
            })
            work.add(observation)
            currentObserver.state$.subscribe(observation)
            currentObserver.observe({graph})
        }

        const completeClosure = ({catalogue}) => {
            const closure = completeClosure$({
                rootRecipe: recipe,
                seedRecipesById: new ReportedSeeds(Object.entries(catalogue || {}), record => reads.read(record, SESSION)),
                loadRecipesById$: reported(loadRecipesById$, reads),
                limits: closureLimits
            })
            const closureSubscriber = new Subscriber({
                next: state => {
                    try {
                        if (settled) {
                            return
                        }
                        if (state.status === 'LOADING') {
                            publishLoading()
                        } else if (state.status === 'COMPLETE') {
                            closureOutcome = state
                            describes
                                ? observe(state.graph)
                                : terminate({status: 'COMPLETE', error: null})
                        } else if (state.status === 'FAILED') {
                            // What the failed closure had established, for the failure it is about to deliver.
                            closureOutcome = state
                        } else {
                            unavailable(new Error(`Source runtime: unexpected closure state ${state.status}`))
                        }
                    } catch (error) {
                        unavailable(error)
                    }
                },
                error: unavailable
            })
            // The subscriber belongs to the operation before subscription. A synchronous LOADING callback can
            // invalidate the runtime and close it before the closure attempts authenticated HTTP work.
            work.add(closureSubscriber)
            closure.subscribe(closureSubscriber)
        }

        const onEnvironment = environment => {
            try {
                if (settled) {
                    return
                }
                if (!captured) {
                    captured = environment
                    return completeClosure(environment)
                }
                if (environment.earthEngineGeneration !== captured.earthEngineGeneration) {
                    unavailable(sourceRuntimeError(SOURCE_IDENTITY_CHANGED))
                }
            } catch (error) {
                unavailable(error)
            }
        }

        const environment = new Subscriber({
            next: onEnvironment,
            error: error => unavailable(error),
            // Completion means the scope that owned this runtime ended, whether before or during the
            // operation. Reported before cleanup so detached work learns why it stopped.
            complete: () => unavailable(sourceRuntimeError(SOURCE_RUNTIME_UNAVAILABLE))
        })
        work.add(environment)
        environment$.subscribe(environment)

        return () => {
            settled = true
            release()
        }
    })

    const resolveImageOutput$ = ({recipe, reads}) => operation$({recipe, describes: true, reads})
    const completeDependencies$ = ({recipe, reads}) => operation$({recipe, describes: false, reads})

    // Reads the records again, as storage holds them now. What a recipe withdrawn from the listing needed was to be
    // read, so reading it is enough; a copy the session caches is replaced where it is present, closed and older.
    const refreshRecords$ = ({records}) => new Observable(subscriber => {
        const settle = envelope => {
            subscriber.next({error: null, diagnostics: [], dependencyValidity: null, basis: [], ...envelope})
            subscriber.complete()
        }
        const request = loadRecipesById$({ids: records.map(({id}) => id), concurrency: closureLimits.requestConcurrency})
            .subscribe({
                next: loaded => {
                    const readAgain = new Set(records.filter(({withdrawn}) => withdrawn).map(({id}) => id))
                    updateRecipeListing(({listingState}) => ({
                        listingState: {...listingState, withdrawn: (listingState.withdrawn || []).filter(id => !readAgain.has(id))}
                    }))
                    loaded.forEach(record => replaceCachedRecipe(record))
                    settle({status: 'COMPLETE'})
                },
                error: error => settle({status: 'UNAVAILABLE', error})
            })
        return () => request.unsubscribe()
    })

    const listing = new ListingRefresh({
        session,
        sessionChanges$,
        updateListing: updateRecipeListing,
        ...(loadRecipeListing$ && {loadListing$: loadRecipeListing$}),
        ...(wakeups$ && {wakeups$}),
        policy: listingPolicy,
        ...(clock && {clock})
    })
    const refreshRecipeListing = () => listing.refresh({maxAgeMs: listingPolicy.openMaxAgeMs})
    const outputs = new OutputRegistry({
        session,
        sessionChanges$,
        acquisitionOf: outputLoading,
        operationOf: ({kind, recipe, key, reads}) => ({
            [DESCRIBE]: () => resolveImageOutput$({recipe, reads}),
            [DEPENDENCIES]: () => completeDependencies$({recipe, reads}),
            [REFRESH]: () => refreshRecords$(key)
        })[kind](),
        isCompatible: compatibleBasis,
        currencyOf: recordCurrency,
        onActive: active => listing.watch(active),
        retention,
        ...(clock && {clock})
    })

    return {
        resolveImageOutput$,
        completeDependencies$,
        watchOutput$: question => defer(() => {
            refreshRecipeListing()
            return outputs.watchOutput$(question)
        }),
        heldFor: key => outputs.heldFor(key),
        // A retry reaches a listing that failed as well: authority waits on it as much as on the answer.
        retryOutput: question => {
            if (session().listingState?.failure) {
                listing.refresh()
            }
            outputs.retryOutput(question)
        },
        refreshRecipeListing,
        close: () => {
            outputs.close()
            listing.close()
            observations.clear()
        }
    }
}

const NO_SESSION = Object.freeze({catalogue: {}, credentials: null, closed: false})

const NO_READS = Object.freeze({read: () => {}, unread: () => {}})

// What Earth Engine never reads of a recipe it is sent.
const NOT_EXECUTED = ['ui', 'layers', 'title', 'revision']

const EVIDENCE = ['id', 'revision', 'listed', 'agreement']

// Credential tokens are opaque and equal by value, so an observation names them by identity.
const CREDENTIAL_IDS = new WeakMap()
let credentialIds = 0

const credentialId = token => {
    if (!token || typeof token !== 'object') {
        return 0
    }
    if (!CREDENTIAL_IDS.has(token)) {
        CREDENTIAL_IDS.set(token, ++credentialIds)
    }
    return CREDENTIAL_IDS.get(token)
}

// The records and assets Earth Engine reads itself for the observed reference: everything its recipe reaches, but not
// the recipe, which is sent. `missing` is a reference the graph does not hold.
const closureOf = (reference, graph) => {
    if (reference.type !== 'RECIPE_REF') {
        return {records: [], assets: [reference.id], missing: false}
    }
    const byId = new Map(graph.recipes.map(record => [record.id, record]))
    const reached = new Set([reference.id])
    const assets = new Set()
    let missing = false
    const visit = id => graph.edges
        .filter(({sourceRecipeId}) => sourceRecipeId === id)
        .forEach(({reference: {type, id: target}}) => {
            if (type !== 'RECIPE_REF') {
                assets.add(target)
            } else if (!reached.has(target)) {
                reached.add(target)
                byId.has(target) ? visit(target) : missing = true
            }
        })
    visit(reference.id)
    return {
        records: [...reached].filter(id => id !== reference.id && byId.has(id)).sort().map(id => byId.get(id)),
        assets: [...assets].sort(),
        missing
    }
}

// The session's records, reporting each one a closure takes.
class ReportedSeeds extends Map {
    #report

    constructor(entries, report) {
        super(entries)
        this.#report = report
    }

    get(id) {
        const record = super.get(id)
        record && this.#report(record)
        return record
    }
}

// Loads, reporting every record as it arrives and every id that could not be read.
const reported = (loadRecipesById$, reads) => request => loadRecipesById$(request).pipe(
    tap({
        next: records => records.forEach(record => reads.read(record, PRIVATE)),
        error: () => request.ids.forEach(id => reads.unread(id, PRIVATE))
    })
)

const basisOf = graph => graph.recipes.map(record => ({id: record.id, content: recipeContent(record)}))
