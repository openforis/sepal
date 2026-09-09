import _ from 'lodash'
import React from 'react'
import {filter, forkJoin, map, of, Subject, switchMap, take, takeUntil} from 'rxjs'

import {INHERITED, inheritedSchemaSource} from '#sepal/recipe/output/inheritedSchemaSource'
import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {ASSET} from '#sepal/recipe/source/reference'
import api from '~/apiRegistry'
import {toVisualizations} from '~/app/home/map/imageLayerSource/assetVisualizationParser'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {getLogger} from '~/log'
import {selectFrom} from '~/stateUtils'

import {recipeAccess} from '../recipeAccess'
import {withRecipe} from '../recipeContext'
import {createLoadRecipesById$} from '../sourceRuntime/recipeClosureLoader'
import {declaredSelections, inheritedSourceKey, inheritedSourceReference, OBSERVED, UNAVAILABLE} from './sourceEvidence'
import {outputOwnedVisualizations, sourceVisualizations} from './visualizations'

const log = getLogger('sourceEvidence')

// Keeps a recipe's inherited source evidence current while its recipe is open.
//
// Mounted by any recipe whose shared definition declares that it preserves an input's band mapping and
// values; it reads that declaration rather than the recipe type, so a second such recipe mounts the same
// component and no consumer changes. A recipe that declares nothing renders nothing and observes nothing.
//
// The closure comes from the shared completion boundary, which owns traversal, cycle detection, missing
// sources, deduplicated loading and its own limits - so there is no second walk of the graph here and no
// depth number of this component's choosing. What remains is reading one declared edge at a time over
// records that boundary already resolved, which is the question this component exists to answer.
//
// Bands come from the IMMEDIATE source, whose running image is what this recipe outputs however deep the
// wrapping goes. Presets do not: a wrapper has none of its own, and the ones it copied are the stale
// snapshot this mechanism replaces, so they come from wherever the declared chain stops inheriting.
//
// WHEN it observes again is the rest of the lifecycle, and it turns on one idea: an answer is about the
// sources it was ACTUALLY read from, so one basis records those and every decision is made against it. The
// basis is captured from the resolved closure - the records that went into the answer, not whatever the
// session happened to hold when the answer arrived - and it is captured even when the closure resolves to a
// broken graph, because repairing one of those records is what would make it answerable again.
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
        const {recipe} = this.props
        if (!inheritedSourceKey(recipe)) {
            this.basis = null
            return this.cancel$.next()
        }
        if (this.basis && !this.outdated(this.basis)) {
            return
        }
        this.observe()
    }

    observe() {
        const {recipe, stream} = this.props
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
                log.debug(() => `Could not observe source ${inheritedSourceKey(recipe)}: ${error.message}`)
                this.publish({status: UNAVAILABLE, bands: [], visualizations: []})
            }
        )
    }

    observe$(session) {
        const {recipe} = this.props
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
                const {immediate, terminal, wrappers} = inheritanceChain(graph, recipe)
                return forkJoin({
                    bands: this.bands$(immediate),
                    visualizations: this.presets$(terminal).pipe(
                        map(inherited => [...wrappers.flatMap(outputOwnedVisualizations), ...inherited])
                    )
                })
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
        const {recipe} = this.props
        const reference = inheritedSourceReference(recipe)
        return {
            ...this.operationState(),
            dependencies: [
                this.dependency(reference.type === ASSET ? {assetId: reference.id} : {id: reference.id}, session)
            ]
        }
    }

    // What the operation actually read: every record the closure resolved, and every asset its edges named.
    // `used` is the record that went into the answer and `seeded` the one the session held when the
    // operation STARTED - both, because a record this operation refreshed is briefly one and then the other,
    // and neither is a change. Reading `seeded` here from the session as it is now would defeat the check:
    // a record edited while some other dependency was still loading would be recorded as what the answer was
    // read from, and an answer read from the version before it would publish as current.
    resolvedBasis(graph, recipesById, session) {
        const {recipe} = this.props
        const assetIds = new Set(graph.edges
            .filter(({reference}) => reference.type === ASSET)
            .map(({reference}) => reference.id))
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
            key: inheritedSourceKey(recipe),
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
        return basis.key !== inheritedSourceKey(recipe)
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
        return (observed && record !== undefined && record !== used && record !== seeded)
            || moved(version, publishedRevision(now, id))
    }

    closure$(session) {
        const {recipe, loadRecipe$, reloadRecipe$} = this.props
        return completeRecipeClosure$({
            rootRecipe: recipe,
            seedRecipesById: this.currentRecords(session),
            // The session's own reference-counted load, so records the closure completes are visible to the
            // catalogue this component watches, and are released with the components using them. A record
            // the catalogue has moved past is read again rather than answered from the cache.
            loadRecipesById$: createLoadRecipesById$({
                loadRecipe$: id => isBehind(session, id) ? reloadRecipe$(id) : loadRecipe$(id)
            }),
            limits: DEFAULT_RECIPE_CLOSURE_LIMITS
        }).pipe(
            filter(({status}) => status === 'COMPLETE'),
            take(1)
        )
    }

    // Seeded with what the session holds, minus anything the catalogue has moved past: leaving a stale record
    // in the seed means the closure never asks for it, and the observation reads the version it was already
    // reading. An open recipe is never dropped - that entry is a draft, not a copy of what is persisted.
    currentRecords(session) {
        return new Map(Object.entries(session.loadedRecipes)
            .filter(([id]) => !isBehind(session, id)))
    }

    bands$({kind, id, record}) {
        return kind === ASSET
            ? api.gee.bands$({asset: id, includeDataTypes: true}).pipe(map(observedBands))
            : api.gee.bands$({recipe: record, includeDataTypes: true}).pipe(map(observedBands))
    }

    presets$({kind, id, record}) {
        if (kind === ASSET) {
            // Presentation only. The physical schema is observed through `/bands` like any other image, so an
            // asset's properties are never asked what bands exist.
            return api.gee.assetMetadata$({asset: id}).pipe(
                map(metadata => toVisualizations(metadata.properties, metadata.bandNames || []))
            )
        }
        return of(record ? sourceVisualizations(record) : [])
    }

    publish(evidence) {
        const {recipeActionBuilder} = this.props
        const basis = this.basis
        if (!basis || this.outdated(basis)) {
            return
        }
        recipeActionBuilder('SET_SOURCE_EVIDENCE', {sourceKey: basis.key})
            .set('ui.sourceEvidence', {sourceKey: basis.key, ...evidence})
            .dispatch()
    }
}

// The declared chain, read over records the shared closure already resolved. One edge per recipe, so it
// terminates with the graph rather than with a limit of its own; the visited set only declines to loop on a
// graph that reported no cycle. `immediate` is what this recipe outputs, `terminal` is what owns the
// presets, and `wrappers` are the recipes passed through on the way - each of which can carry styles the
// user made for ITS output, while the presets it copied when its own source was selected are the stale
// snapshot this mechanism exists to replace. What the answer was read from is the operation basis, not
// this walk.
const inheritanceChain = (graph, root) => {
    const recipesById = new Map(graph.recipes.map(recipe => [recipe.id, recipe]))
    const wrappers = []
    const visited = new Set([root.id])
    let immediate = null
    let record = root
    for (;;) {
        const {status, reference} = inheritedSchemaSource(record)
        if (status !== INHERITED) {
            return {immediate, wrappers, terminal: {kind: 'RECIPE', record}}
        }
        // Every recipe that inherits and is not the root is passed THROUGH. The root's own styles are the
        // consumer's locals, and the terminal's arrive with its presets.
        if (record !== root) {
            wrappers.push(record)
        }
        const next = reference.type === ASSET ? null : recipesById.get(reference.id)
        const step = reference.type === ASSET
            ? {kind: ASSET, id: reference.id}
            : {kind: 'RECIPE', id: reference.id, record: next}
        immediate = immediate || step
        if (reference.type === ASSET) {
            return {immediate, wrappers, terminal: step}
        }
        if (!next || visited.has(reference.id)) {
            return {immediate, wrappers, terminal: {kind: 'RECIPE'}}
        }
        visited.add(reference.id)
        record = next
    }
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

const observedBands = bands => (bands || []).map(band => _.isString(band)
    ? {name: band}
    : {
        name: band.name,
        ...(Number.isInteger(band.arrayDimensions) && {dataType: {arrayDimensions: band.arrayDimensions}})
    })

export const SourceEvidenceSync = compose(
    _SourceEvidenceSync,
    withRecipe(mapRecipeToProps),
    connect(mapStateToProps),
    recipeAccess()
)
