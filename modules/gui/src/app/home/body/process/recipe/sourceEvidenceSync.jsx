import PropTypes from 'prop-types'
import React from 'react'
import {filter, map, of, Subject, switchMap, take, takeUntil, tap} from 'rxjs'

import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {ASSET} from '#sepal/recipe/source/reference'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {getLogger} from '~/log'

import {isDraft} from '../draftAgreement'
import {recipeAccess} from '../recipeAccess'
import {withRecipe} from '../recipeContext'
import {DEFAULT_ASSET_POLICY} from '../sourceRuntime/assetEvidence'
import {createLoadRecipesById$} from '../sourceRuntime/recipeClosureLoader'
import {withSourceRuntime} from '../sourceRuntime/sourceRuntimeContext'
import {declaredSelections, OBSERVED, sourceKeyOf, UNAVAILABLE} from './sourceEvidence'
import {
    assetRefreshes,
    assetVersion,
    earthEngineGeneration,
    evidenceSession,
    isUnversionedAsset,
    outdatedBasis,
    publishedRevision,
    recipeRefreshes
} from './sourceEvidenceBasis'

const log = getLogger('sourceEvidence')

const EMPTY_GRAPH = {recipes: [], edges: [], diagnostics: []}

// Keeps a recipe's evidence about its source current while the recipe is open.
//
// The lifecycle is shared; what is observed is not. A recipe mounts this with an `observation` that names
// the source it depends on and says how to read evidence about it - Masking reads the presets it inherits, CCDC
// Slice reads the segment description it transforms - and this component owns everything
// around that call: when to read, what the reading was based on, whether an answer may still be published,
// and what happens when it cannot be had. Nothing here knows what a source is for.
//
// Resolve the selected source's closure so obsolete consumer dependencies cannot block a new selection.
// The shared completion boundary owns traversal, cycle detection, missing sources, loading and limits.
//
// WHEN it observes again turns on one idea: an answer is about the sources it was ACTUALLY read from, so one
// basis records those and every decision is made against it. The basis is captured from the resolved closure
// - the records that went into the answer, not whatever the session happened to hold when the answer
// arrived - and it is captured even when the closure resolves to a broken graph, because repairing one of
// those records is what would make it answerable again.
//
// The same basis decides both questions: whether to look again, and whether an answer may still be
// published. A source the answer was read from that has since become something else fails both
// (sourceEvidenceBasis.js).
//
// The assets it reads are claimed from the source runtime for as long as it is mounted, which keeps what is known of
// them recent: a new token, an explicit refresh of an asset or of this recipe, and the age of evidence read from a
// source without a token each read it again - presets, segments and prefill included - without any band request.

const mapStateToProps = state => {
    const {catalogue, openRecipeIds, saves, assetEvidence, sourceRefreshes} = evidenceSession(state)
    return {earthEngineGeneration: earthEngineGeneration(state), catalogue, openRecipeIds, saves, assetEvidence, sourceRefreshes}
}

const mapRecipeToProps = recipe => ({recipe})

class _SourceEvidenceSync extends React.Component {
    cancel$ = new Subject()
    basis = null

    render() {
        return null
    }

    componentDidMount() {
        this.update()
    }

    componentDidUpdate() {
        this.update()
    }

    componentWillUnmount() {
        this.cancel$.next()
        this.release?.()
        clearTimeout(this.expiry)
    }

    // The assets the basis names are claimed before those it no longer names are released.
    claim(basis) {
        const {sourceRuntime} = this.props
        const ids = basis.dependencies.filter(({assetId}) => assetId).map(({assetId}) => assetId)
        const previous = this.release
        this.release = ids.length ? sourceRuntime?.claimAssets(ids) : null
        previous?.()
    }

    // A token first learned after the basis was taken is no change: the evidence was read from what it describes, so
    // the basis takes it, and the next token that differs is one.
    adoptFirstVersions() {
        const session = this.sessionSnapshot()
        const unknown = dependency => dependency.assetId && dependency.version === undefined
            && assetVersion(session, dependency.assetId) !== undefined
        if (this.basis?.dependencies.some(unknown)) {
            this.basis = {
                ...this.basis,
                dependencies: this.basis.dependencies.map(dependency => unknown(dependency)
                    ? {...dependency, version: assetVersion(session, dependency.assetId)}
                    : dependency)
            }
        }
    }

    // Evidence read from a source without a token is read again once it is too old.
    expireAt(basis) {
        clearTimeout(this.expiry)
        if (Number.isFinite(basis.expiresAt)) {
            this.expiry = setTimeout(() => this.update(), Math.max(0, basis.expiresAt - Date.now()))
        }
    }

    update() {
        if (!this.sourceKey()) {
            this.basis = null
            return this.cancel$.next()
        }
        this.adoptFirstVersions()
        if (this.basis && !this.outdated(this.basis)) {
            return
        }
        this.observe()
    }

    sourceReference() {
        const {recipe, observation} = this.props
        return observation.sourceReference(recipe)
    }

    sourceKey() {
        return sourceKeyOf(this.sourceReference())
    }

    observe() {
        const {stream} = this.props
        this.cancel$.next()
        // One snapshot of the session, taken before anything is read and used for the whole operation. Every
        // later question - what to seed the closure with, what was in effect when it started, whether the
        // answer is still about that - is asked of this and not of whatever the session has become since.
        const session = this.sessionSnapshot()
        // Held from the moment the request starts and replaced once the closure says what it actually read.
        // Kept whatever the outcome: a failure that cleared it would be retried by the next render, turning
        // one unreachable source into a request per render.
        this.basis = this.startingBasis(session)
        this.claim(this.basis)
        stream('OBSERVE_SOURCE_EVIDENCE',
            this.observe$(session).pipe(takeUntil(this.cancel$)),
            evidence => this.publish({status: OBSERVED, ...evidence}),
            error => {
                log.debug(() => `Could not observe source ${this.sourceKey()}: ${error.message}`)
                this.publish({status: UNAVAILABLE}, error)
            }
        )
    }

    observe$(session) {
        const {recipe, observation} = this.props
        return this.closure$(session).pipe(
            switchMap(({graph, recipesById}) => {
                // Recorded before anything is decided about the graph. A graph that cannot run was still
                // read from records, and those records are what a repair would change.
                this.basis = this.resolvedBasis(graph, recipesById, session)
                this.claim(this.basis)
                this.expireAt(this.basis)
                // COMPLETE carries either no diagnostics or definitive ones - a cycle, a malformed
                // declaration. There is no answer to give about a graph that cannot run.
                if (graph.diagnostics.length) {
                    throw new Error(`Unresolved dependencies: ${graph.diagnostics[0].code}`)
                }
                return observation.observe$({recipe, graph, recipesById})
            })
        )
    }

    sessionSnapshot() {
        const {loadedRecipes, catalogue, assetEvidence, sourceRefreshes, openRecipeIds, saves} = this.props
        return {
            loadedRecipes: loadedRecipes || {},
            catalogue: catalogue || [],
            assetEvidence: assetEvidence || {},
            sourceRefreshes: sourceRefreshes || {},
            openRecipeIds: openRecipeIds || [],
            saves: saves || {},
            now: Date.now()
        }
    }

    // Before anything has been resolved, all that is known is the source this recipe names.
    startingBasis(session) {
        const reference = this.sourceReference()
        return {
            ...this.operationState(),
            dependencies: [
                this.dependency(reference.type === ASSET ? {assetId: reference.id} : {id: reference.id}, session)
            ]
        }
    }

    // What the operation actually read: every record the closure resolved, the asset it was rooted at where
    // the selection is one, and every asset the resolved edges named.
    // `used` is the record that went into the answer and `seeded` the one the session held when the
    // operation STARTED - both, because a record this operation refreshed is briefly one and then the other,
    // and neither is a change. Reading `seeded` here from the session as it is now would defeat the check:
    // a record edited while some other dependency was still loading would be recorded as what the answer was
    // read from, and an answer read from the version before it would publish as current.
    resolvedBasis(graph, recipesById, session) {
        const {recipe} = this.props
        const selected = this.sourceReference()
        const assetIds = new Set([
            ...(selected.type === ASSET ? [selected.id] : []),
            ...graph.edges
                .filter(edge => edge.reference.type === ASSET)
                .map(edge => edge.reference.id)
        ])
        const unversioned = [...assetIds].some(assetId => isUnversionedAsset(session, assetId))
        return {
            ...this.operationState(),
            dependencies: [
                ...graph.recipes
                    .filter(({id}) => id !== recipe.id)
                    .map(({id}) => this.dependency({id, used: recipesById.get(id)}, session)),
                ...[...assetIds].map(assetId => this.dependency({assetId}, session))
            ],
            ...(unversioned && {expiresAt: session.now + DEFAULT_ASSET_POLICY.unversionedMaxAgeMs})
        }
    }

    operationState() {
        const {recipe, earthEngineGeneration, sourceRefreshes} = this.props
        return {
            key: this.sourceKey(),
            selections: declaredSelections(recipe),
            earthEngineGeneration,
            refreshed: recipeRefreshes({sourceRefreshes}, recipe?.id)
        }
    }

    dependency({id, assetId, used}, session) {
        return assetId
            ? {assetId, version: assetVersion(session, assetId), refreshed: assetRefreshes(session, assetId)}
            : {id, used, seeded: session.loadedRecipes[id], version: publishedRevision(session, id)}
    }

    outdated(basis) {
        const {recipe, earthEngineGeneration} = this.props
        return outdatedBasis(basis, {
            recipe,
            sourceKey: this.sourceKey(),
            session: {...this.sessionSnapshot(), earthEngineGeneration}
        })
    }

    closure$(session) {
        const reference = this.sourceReference()
        // A directly selected asset has no recipe edges; resolvedBasis tracks its version explicitly.
        return reference.type === ASSET
            ? of({graph: EMPTY_GRAPH, recipesById: new Map()})
            : this.sourceRecord$(reference.id, session).pipe(
                switchMap(rootRecipe => completeRecipeClosure$({
                    rootRecipe,
                    seedRecipesById: this.currentRecords(session),
                    loadRecipesById$: this.loadRecipesById$(session),
                    limits: DEFAULT_RECIPE_CLOSURE_LIMITS
                }).pipe(
                    // A closure that fails still read records before it stopped, and repairing one of those is
                    // what would let it succeed - so they become the basis, as a completed closure's do.
                    tap(({status, graph, recipesById}) => {
                        if (status === 'FAILED') {
                            this.basis = this.resolvedBasis(graph, recipesById, session)
                        }
                    }),
                    filter(({status}) => status === 'COMPLETE'),
                    take(1)
                ))
            )
    }

    sourceRecord$(id, session) {
        const seeded = this.currentRecords(session).get(id)
        return seeded
            ? of(seeded)
            : this.loadRecipesById$(session)({ids: [id], concurrency: 1}).pipe(map(([record]) => record))
    }

    // The session's own reference-counted load, so records the closure completes are visible to the catalogue
    // this component watches, and are released with the components using them. A record the catalogue has
    // moved past is read again rather than answered from the cache.
    loadRecipesById$(session) {
        const {loadRecipe$, reloadRecipe$} = this.props
        return createLoadRecipesById$({
            loadRecipe$: id => isBehind(session, id) ? reloadRecipe$(id) : loadRecipe$(id)
        })
    }

    // Seeded with what the session holds, minus anything the catalogue has moved past: leaving a stale record
    // in the seed means the closure never asks for it, and the observation reads the version it was already
    // reading. An open recipe is never dropped - that entry is a draft, not a copy of what is persisted.
    currentRecords(session) {
        return new Map(Object.entries(session.loadedRecipes)
            .filter(([id]) => !isBehind(session, id)))
    }

    publish(evidence, error) {
        const {recipe, recipeActionBuilder} = this.props
        const basis = this.basis
        if (!basis || this.outdated(basis)) {
            return
        }
        const published = {
            sourceKey: basis.key,
            ...evidence,
            ...retainedObservation(recipe, evidence)
        }
        this.applied(
            recipeActionBuilder('SET_SOURCE_EVIDENCE', {sourceKey: basis.key})
                .set('ui.sourceEvidence', published),
            published
        ).dispatch()
        this.reported(published, error)
    }

    // Withholding an answer is the whole of what this does about a failure. Whether that is visible is the
    // consumer's: one presenting the withheld state needs nothing, while one whose panels go on showing what
    // they held would otherwise fail silently. Reported after acceptance, so a superseded read is not
    // announced, and the error is passed rather than published - it is not evidence about the source.
    reported(evidence, error) {
        const {recipe, observation} = this.props
        if (evidence.status === UNAVAILABLE && observation.reportUnavailable) {
            observation.reportUnavailable({recipe, error})
        }
    }

    // Apply consumer settings atomically with accepted evidence. Failures never seed settings or replace
    // the successful observation used to detect producer changes.
    applied(builder, evidence) {
        const {recipe, observation} = this.props
        if (evidence.status !== OBSERVED || !observation.applyAccepted) {
            return builder
        }
        return observation
            .applyAccepted({recipe, evidence, previous: lastObserved(recipe)})
            .reduce(
                (applied, {path, value, merge}) => merge ? applied.assign(path, value) : applied.set(path, value),
                builder
            )
    }
}

// A read that failed says the source could not be reached. It does not unsay what the last successful read
// found, or which source that was - and which source an answer was about is what a consumer needs to know
// whether an answer coming back now is about the one it last had an answer for. Availability is the status;
// this is provenance, and the two must not be read off each other.
const retainedObservation = (recipe, evidence) => {
    if (evidence.status === OBSERVED) {
        return {}
    }
    const observed = lastObserved(recipe)
    return observed ? {lastObserved: observed} : {}
}

const lastObserved = recipe => {
    const evidence = recipe?.ui?.sourceEvidence
    return evidence?.status === OBSERVED ? evidence : evidence?.lastObserved
}

const isBehind = (session, id) => {
    // A draft - open, or closed with its saves unsettled - is not a copy of what is persisted. The cache boundary
    // refuses to overwrite one; not asking for it in the first place saves a read that could only be discarded.
    if (isDraft({open: session.openRecipeIds.includes(id), saveState: session.saves[id]})) {
        return false
    }
    const record = session.loadedRecipes[id]
    const published = publishedRevision(session, id)
    // Strictly behind, never merely different. A record read after the catalogue listing is NEWER than the
    // summary, and reloading it would fetch the same revision again on every render.
    return Number.isInteger(record?.revision) && Number.isInteger(published)
        && record.revision < published
}

export const SourceEvidenceSync = compose(
    _SourceEvidenceSync,
    withRecipe(mapRecipeToProps),
    connect(mapStateToProps),
    withSourceRuntime(),
    recipeAccess()
)

SourceEvidenceSync.propTypes = {
    // {
    //     sourceReference: recipe => reference | null,
    //     observe$: ({recipe, graph, recipesById}) => Observable,
    //     applyAccepted?: ({recipe, evidence, previous}) => [{path, value, merge?}],
    //     reportUnavailable?: ({recipe, error}) => void
    // }
    observation: PropTypes.object.isRequired
}
