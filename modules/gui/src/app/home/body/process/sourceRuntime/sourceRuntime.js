import _ from 'lodash'
import {defer, finalize, map, NEVER, Observable, Subscriber, Subscription, tap} from 'rxjs'

import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {dependencyValidity} from '#sepal/recipe/source/dependencyValidity'
import api from '~/apiRegistry'

import {AGREED} from '../draftAgreement'
import {createRecipeImageOutputObserver, explainRecipeImageOutput$, observeImageBands$} from '../recipe/imageOutputObserver'
import {buildMapDependencyGraph} from '../recipe/mapDependencyGraph'
import {recipeContent} from '../recipe/recipeContent'
import {compatibleBasis, DEPENDENCIES, DESCRIBE, EXPLAIN, graphAssets, outputLoading, REFRESH} from '../recipe/recipeOutput'
import {initializeRecipe} from '../recipeCache'
import {getRecipeType} from '../recipeTypeRegistry'
import {DEFAULT_ASSET_POLICY, isDefinitiveFailure} from './assetEvidence'
import {assetsFailedBy} from './assetFailure'
import {AssetInterest} from './assetInterest'
import {AssetRefresh} from './assetRefresh'
import {EvidenceRegistry} from './evidenceRegistry'
import {DEFAULT_LISTING_POLICY, ListingRefresh} from './listingRefresh'
import {DEFAULT_OBSERVATION_RETENTION, ObservationRegistry} from './observationRegistry'
import {DEFAULT_OUTPUT_RETENTION, OutputRegistry} from './outputRegistry'
import {createLoadRecipesById$} from './recipeClosureLoader'
import {PRIVATE, SESSION} from './recordCurrency'
import {sourceCurrency} from './sourceCurrency'
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
// `explainOutput$` is the same operation explaining a refusal instead of describing: once its closure is complete it
// observes, once, what the refusal still names, each observation failing on its own, and settles COMPLETE with the
// diagnoses that evidence establishes beside the refusal's (`diagnostics`) and the observations that failed
// (`failures`) - even where it establishes nothing more. It settles UNAVAILABLE where its closure or its environment
// failed, or every observation did, so it is retried and never retained as an answer. Every record and asset it read
// is reported before it settles, as a description's are.
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
// about every record Earth Engine reads for it itself, the assets it reads with their tokens, and the credentials.
//
// A terminal names the assets its closure read (`assets`) and when it read them (`observedAt`), so what authorizes an
// export can be held to their evidence.
//
// While anything is watched the runtime keeps the recipe listing - its evidence of recipe revisions - recent
// (listingRefresh.js). A consumer opening a watch refreshes evidence older than a minute; `refreshRecipeListing` does
// the same for one that opens without watching.
//
// It keeps the evidence about every asset a watched question reads recent too (assetRefresh.js), whether or not the
// question's answer needs loading (assetInterest.js). A consumer reading assets without watching an output claims them
// with `claimAssets`. `invalidateAssets` tells it of a mutation this session made, and `reportFailure` of an
// operation that failed over an asset; both read the assets they name again.
//
// A description that fails over an asset - one Earth Engine could not find or read, or one whose bands are not those
// described - has that asset read again (assetFailure.js), at most once per interval while its token is unchanged; a
// changed token withdraws the failure with the rest, so it recovers by itself. Other failures read nothing again. So
// does an observation that failed beside a definitive diagnosis, which the description is settled on instead
// (`failures`, observeImageOutput.js).
//
// `refreshOutput` is an explicit refresh of a question, successful answers included: the metadata of every asset it
// reads is read at once, then what was observed for it is observed again and its presentation evidence read again,
// unchanged tokens notwithstanding, and its preview is drawn again. `refreshAsset` does the same for one asset and
// everything reading it. A refresh already running for the same question or asset is joined.
//
// It keeps the evidence a recipe's consumers need about its source current while they watch it (evidenceRegistry.js),
// one observation shared between them: a watched output acquires what the type's declared requirements hold that
// product to, `watchEvidence$` what a chart's operation needs or what an editor presents, and a synchronous read judges
// the published evidence against the basis it was read on (`evidenceOwnerOf`). `watchCandidate$` observes a selection
// being edited, holding its evidence for the form rather than publishing it. Without `evidenceSession` nothing is
// observed.

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
    updateAssetEvidence = () => {},
    refreshSources = () => {},
    loadAssetVersions$,
    wakeups$,
    visible,
    evidenceSession = () => null,
    recipeCacheClaimant = privateClaimant,
    writeRecipe = () => false,
    listingPolicy = DEFAULT_LISTING_POLICY,
    assetPolicy = DEFAULT_ASSET_POLICY,
    clock
}) => {
    const currencyOf = current => sourceCurrency(current)
    const now = () => clock ? clock.now() : Date.now()
    const observations = new ObservationRegistry({
        observeBands$,
        isCurrent: key => {
            const current = session()
            const currency = currencyOf(current)
            return key.credentials === credentialId(current.credentials)
                && !key.dependencies.some(dependency => currency.superseded(dependency))
                && key.assets.every(asset => observedAssetCurrent(asset, current.assetEvidence, current.sourceRefreshes))
        },
        retention: observationRetention,
        ...(clock && {clock})
    })

    // What identifies an observation of `request`, made while describing `graph` for `rootId`.
    const observationOf = (request, graph, rootId) => {
        const current = session()
        const currency = currencyOf(current)
        const {records, assets, missing} = closureOf(request.reference, graph)
        const dependencies = records.map(record => _.pick(currency.evidence(record, PRIVATE), EVIDENCE))
        return {
            key: {
                observes: request.observes ?? null,
                reference: request.reference,
                submitted: request.recipe ? _.omit(request.recipe, NOT_EXECUTED) : null,
                dependencies,
                assets: assets.map(id => observedAsset(id, current.assetEvidence, current.sourceRefreshes)),
                refreshed: explicitRefresh(current.sourceRefreshes, rootId),
                credentials: credentialId(current.credentials)
            },
            complete: !missing && dependencies.every(({revision, agreement}) => revision !== null && agreement === AGREED)
        }
    }

    const operation$ = ({recipe, describes, explains = false, reads = NO_READS}) => new Observable(subscriber => {
        // Ownership is established before anything can publish. A synchronous LOADING, or an invalidation raised
        // from inside a subscriber reacting to it, both re-enter here while setup is still running; without this
        // the operation would be publishing before it owned the work it was publishing about.
        let settled = false
        let observer = null
        let captured = null
        let closureOutcome = null
        let observedAt = null
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
                basis: closureOutcome ? basisOf(closureOutcome.graph) : [],
                assets: closureOutcome ? graphAssets(closureOutcome.graph) : [],
                observedAt
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
                observeBands$: request => observations.observe$(request, observationOf(request, graph, recipe.id))
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

        const explain = graph => {
            const explanation = new Subscriber({
                next: ({diagnostics, failures, observed}) => terminate(failures.length && !observed
                    ? {status: 'UNAVAILABLE', description: null, diagnostics: [], failures, error: failures[0]}
                    : {status: 'COMPLETE', description: null, diagnostics, failures, error: null}),
                error: unavailable
            })
            work.add(explanation)
            explainRecipeImageOutput$({
                graph,
                observeBands$: request => observations.observe$(request, observationOf(request, graph, recipe.id))
            }).subscribe(explanation)
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
                            if (describes) {
                                observedAt = now()
                                reads.assets(graphAssets(state.graph))
                                explains ? explain(state.graph) : observe(state.graph)
                            } else {
                                terminate({status: 'COMPLETE', error: null})
                            }
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
    const explainOutput$ = ({recipe, reads}) => operation$({recipe, describes: true, explains: true, reads})

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
    const assets = new AssetRefresh({
        session,
        sessionChanges$,
        updateEvidence: updateAssetEvidence,
        ...(loadAssetVersions$ && {loadVersions$: loadAssetVersions$}),
        ...(wakeups$ && {wakeups$}),
        ...(visible && {visible}),
        policy: assetPolicy,
        ...(clock && {clock})
    })
    const reportAssetFailure = ids => ids.length ? assets.reportFailure(ids) : Promise.resolve()

    // Refreshes in progress, by what they refresh, so a second request joins the first. One settling after close
    // publishes nothing.
    let closed = false
    const refreshing = new Map()
    const evidence = new EvidenceRegistry({
        session: evidenceSession,
        sessionChanges$,
        claimRecords: recipeCacheClaimant,
        claimAssets: ids => assets.claim(ids),
        write: writeRecipe,
        observationOf: recipe => getRecipeType(recipe.type)?.sourceObservation || null,
        // Only requirements over a selected source need its evidence.
        requirementsOf: recipe => (getRecipeType(recipe.type)?.sourceRequirements || []).filter(({role}) => role),
        ...(clock && {clock})
    })
    const joined = (key, refresh) => {
        if (!refreshing.has(key)) {
            refreshing.set(key, refresh().finally(() => refreshing.delete(key)))
        }
        return refreshing.get(key)
    }
    const interest = new AssetInterest({
        claim: ids => assets.claim(ids),
        assetsOf: question => [...sessionAssetsOf(session().catalogue, question.recipeId), ...outputs.assetsRead(question)],
        sessionChanges$
    })
    const outputs = new OutputRegistry({
        session,
        sessionChanges$,
        acquisitionOf: outputLoading,
        operationOf: ({kind, recipe, key, reads}) => ({
            [DESCRIBE]: () => resolveImageOutput$({recipe, reads}).pipe(
                tap(terminal => reportAssetFailure(_.uniq(failuresOf(terminal).flatMap(error => assetsFailedBy(error, terminal.assets)))))
            ),
            [EXPLAIN]: () => explainOutput$({recipe, reads}).pipe(
                tap(terminal => reportAssetFailure(_.uniq(failuresOf(terminal).flatMap(error => assetsFailedBy(error, terminal.assets)))))
            ),
            [DEPENDENCIES]: () => completeDependencies$({recipe, reads}),
            [REFRESH]: () => refreshRecords$(key)
        })[kind](),
        isCompatible: compatibleBasis,
        currencyOf,
        onActive: active => listing.watch(active),
        retention,
        ...(clock && {clock})
    })

    return {
        resolveImageOutput$,
        completeDependencies$,
        watchOutput$: question => defer(() => {
            refreshRecipeListing()
            const reads = interest.watch(question)
            const sourceEvidence = evidence.watch$({recipeId: question.recipeId, operation: question.product?.name}).subscribe()
            return outputs.watchOutput$(question).pipe(
                tap(() => reads.update()),
                finalize(() => {
                    sourceEvidence.unsubscribe()
                    reads.release()
                })
            )
        }),
        watchEvidence$: watch => evidence.watch$(watch),
        watchCandidate$: candidate => evidence.watchCandidate$(candidate),
        heldFor: key => outputs.heldFor(key),
        // A retry reaches a listing that failed as well: authority waits on it as much as on the answer.
        retryOutput: question => {
            if (session().listingState?.failure) {
                listing.refresh()
            }
            outputs.retryOutput(question)
        },
        refreshRecipeListing,
        refreshOutput: question => joined(`output:${question.recipeId}:${JSON.stringify(question.product)}:${Boolean(question.explain)}`, () => {
            const ids = [...sessionAssetsOf(session().catalogue, question.recipeId), ...outputs.assetsRead(question)]
            return assets.refresh(ids, {force: true})
                .then(() => closed || refreshSources({recipes: [question.recipeId]}))
        }),
        refreshAsset: id => joined(`asset:${id}`, () =>
            assets.refresh([id], {force: true}).then(() => closed || refreshSources({assets: [id]}))
        ),
        claimAssets: ids => assets.claim(ids),
        evidenceOwnerOf: recipeId => evidence.ownerOf(recipeId),
        invalidateAssets: ids => assets.invalidate(ids),
        // A failure of something drawn or read from these assets, which may be about any of them (assetFailure.js).
        reportFailure: ({error, assets: read}) => reportAssetFailure(assetsFailedBy(error, read)),
        close: () => {
            closed = true
            outputs.close()
            listing.close()
            interest.close()
            assets.close()
            observations.clear()
            evidence.close()
        }
    }
}

const NO_SESSION = Object.freeze({catalogue: {}, credentials: null, closed: false})

// Records read for evidence without a session cache to claim them in.
const privateClaimant = () => ({
    load$: id => api.recipe.load$(id).pipe(map(initializeRecipe)),
    reload$: id => api.recipe.load$(id).pipe(map(initializeRecipe)),
    release: () => {}
})

const NO_READS = Object.freeze({read: () => {}, unread: () => {}, assets: () => {}})

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

// The assets the session graph of a recipe reaches, computed once per catalogue.
const SESSION_ASSETS = new WeakMap()

const sessionAssetsOf = (catalogue, recipeId) => {
    const recipe = catalogue?.[recipeId]
    if (!recipe) {
        return NONE
    }
    if (!SESSION_ASSETS.has(catalogue)) {
        SESSION_ASSETS.set(catalogue, new Map())
    }
    const known = SESSION_ASSETS.get(catalogue)
    if (!known.has(recipeId)) {
        known.set(recipeId, graphAssets(buildMapDependencyGraph({recipe, loadedRecipes: catalogue})))
    }
    return known.get(recipeId)
}

const NONE = Object.freeze([])

// What a description failed over: the failures it is unavailable for, or the observations that failed beside the
// diagnosis it settled on instead.
const failuresOf = ({status, error, failures = []}) =>
    status === 'UNAVAILABLE' ? _.uniq([error, ...failures]) : failures

// Which explicit refresh of its question an observation was made after, if any. Counts are kept per recipe, so the
// recipe is part of it: the first refresh of one recipe is not the first refresh of another.
const explicitRefresh = (refreshes, rootId) => {
    const count = refreshes?.recipes?.[rootId] || 0
    return count ? {recipeId: rootId, count} : null
}

// An asset as an observation was made of it: the token known then, if any, and how often it had been refreshed.
const observedAsset = (id, evidence = {}, refreshes = {}) => {
    const entry = evidence[id]
    return {id, version: entry?.version ?? null, unversioned: Boolean(entry?.unversioned), refreshed: refreshes.assets?.[id] || 0}
}

// Whether a kept observation is still about the asset: not found missing since, and not read at another token. One made
// before any token was known is not reused once one is; one of a source without a token is bounded by its age alone.
const observedAssetCurrent = ({id, version, unversioned, refreshed}, evidence = {}, refreshes = {}) => {
    const entry = evidence[id]
    if (refreshed !== (refreshes.assets?.[id] || 0) || isDefinitiveFailure(entry)) {
        return false
    }
    if (!entry || entry.checkedAt === null) {
        return true
    }
    return unversioned ? entry.unversioned : version !== null && entry.version === version
}

const basisOf = graph => graph.recipes.map(record => ({id: record.id, content: recipeContent(record)}))
