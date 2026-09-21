import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {filter, map, of, Subject, switchMap, take, takeUntil} from 'rxjs'

import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {ASSET} from '#sepal/recipe/source/reference'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {getLogger} from '~/log'
import {selectFrom} from '~/stateUtils'

import {recipeAccess} from '../recipeAccess'
import {withRecipe} from '../recipeContext'
import {createLoadRecipesById$} from '../sourceRuntime/recipeClosureLoader'
import {declaredSelections, OBSERVED, sourceKeyOf, UNAVAILABLE} from './sourceEvidence'

const log = getLogger('sourceEvidence')

const EMPTY_GRAPH = {recipes: [], edges: [], diagnostics: []}

let observations = 0

// Keeps a recipe's evidence about its source current while the recipe is open.
//
// The lifecycle is shared; what is observed is not. A recipe mounts this with an `observation` that names
// the source it depends on and says how to read evidence about it - Masking reads the bands and presets it
// inherits, CCDC Slice reads the segment description it transforms - and this component owns everything
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
// published. A source the answer was read from that has since become something else fails both.

const mapStateToProps = state => ({
    // The container is replaced when Google credentials change, so its identity is an invalidation epoch.
    // Its contents are never read, compared or published.
    earthEngineGeneration: selectFrom(state, ['user', 'currentUser', 'googleTokens']),
    catalogue: selectFrom(state, 'process.recipes'),
    // A recipe with a tab is being edited. Its cached record is a draft, and no dependency read may replace
    // it with what happens to be persisted.
    openRecipeIds: (selectFrom(state, 'process.tabs') || []).map(({id}) => id),
    assetVersions: [...(selectFrom(state, 'assets.user') || []), ...(selectFrom(state, 'assets.other') || [])]
})

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
    }

    update() {
        if (!this.sourceKey()) {
            this.basis = null
            return this.cancel$.next()
        }
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
        const {loadedRecipes, catalogue, assetVersions, openRecipeIds} = this.props
        return {
            loadedRecipes: loadedRecipes || {},
            catalogue: catalogue || [],
            assetVersions: assetVersions || [],
            openRecipeIds: openRecipeIds || []
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
        return {
            ...this.operationState(),
            dependencies: [
                ...graph.recipes
                    .filter(({id}) => id !== recipe.id)
                    .map(({id}) => this.dependency({id, used: recipesById.get(id)}, session)),
                ...[...assetIds].map(assetId => this.dependency({assetId}, session))
            ]
        }
    }

    operationState() {
        const {recipe, earthEngineGeneration} = this.props
        return {
            key: this.sourceKey(),
            selections: declaredSelections(recipe),
            earthEngineGeneration
        }
    }

    dependency({id, assetId, used}, session) {
        return assetId
            ? {assetId, version: assetVersion(session, assetId)}
            : {id, used, seeded: session.loadedRecipes[id], version: publishedRevision(session, id)}
    }

    // Only what was actually observed can be seen to change. A record or version that was unknown when the
    // answer was read says nothing about it now, and a record the session has released says only that.
    outdated(basis) {
        const {recipe, earthEngineGeneration} = this.props
        return basis.key !== this.sourceKey()
            || !sameSelections(declaredSelections(recipe), basis.selections)
            || basis.earthEngineGeneration !== earthEngineGeneration
            || basis.dependencies.some(dependency => this.dependencyChanged(dependency))
    }

    dependencyChanged({id, assetId, used, seeded, version}) {
        const now = this.sessionSnapshot()
        if (assetId) {
            return moved(version, assetVersion(now, assetId))
        }
        const record = now.loadedRecipes[id]
        const observed = used !== undefined || seeded !== undefined
        return (observed && record !== undefined && !sameSourceRecord(record, used) && !sameSourceRecord(record, seeded))
            || moved(version, publishedRevision(now, id))
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
            observation: ++observations,
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

const sameSourceRecord = (current, previous) =>
    current === previous || (previous !== undefined && _.isEqual(sourceInputs(current), sourceInputs(previous)))

// Keep persisted inputs conservative: equal bands do not imply equal pixels. Runtime evidence and restored
// style provenance also affect descriptions; panel values, dirtiness and chart state do not.
const sourceInputs = recipe => ({
    ..._.omit(recipe, 'ui'),
    sourceEvidence: recipe.ui?.sourceEvidence,
    savedLayerSource: recipe.ui?.savedLayerSource
})

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

const assetVersion = ({assetVersions}, assetId) =>
    assetVersions.find(({id}) => id === assetId)?.updateTime

const publishedRevision = ({catalogue}, id) =>
    catalogue.find(summary => summary.id === id)?.revision

const isBehind = (session, id) => {
    // A recipe open for editing is a draft, not a copy of what is persisted. The cache boundary refuses to
    // overwrite one; not asking for it in the first place saves a read that could only be discarded.
    if (session.openRecipeIds.includes(id)) {
        return false
    }
    const record = session.loadedRecipes[id]
    const published = publishedRevision(session, id)
    // Strictly behind, never merely different. A record read after the catalogue listing is NEWER than the
    // summary, and reloading it would fetch the same revision again on every render.
    return Number.isInteger(record?.revision) && Number.isInteger(published)
        && record.revision < published
}

const sameSelections = (current, basis) =>
    current.length === basis.length && current.every((selection, index) => selection === basis[index])

// A version that was unknown on either side is no evidence of movement.
const moved = (before, after) =>
    before !== undefined && after !== undefined && before !== after

// Observed band descriptions as evidence carries them: a name, with dimensionality and encoding where reported.
export const observedBands = bands => (bands || []).map(band => _.isString(band)
    ? {name: band}
    : {
        name: band.name,
        ...(Number.isInteger(band.arrayDimensions) && {dataType: {arrayDimensions: band.arrayDimensions}}),
        ...(band.encoding && {encoding: band.encoding})
    })

export const SourceEvidenceSync = compose(
    _SourceEvidenceSync,
    withRecipe(mapRecipeToProps),
    connect(mapStateToProps),
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
