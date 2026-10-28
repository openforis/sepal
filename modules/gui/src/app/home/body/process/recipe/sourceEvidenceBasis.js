import _ from 'lodash'

import {ASSET} from '#sepal/recipe/source/reference'
import {selectFrom} from '~/stateUtils'

import {isDraft} from '../draftAgreement'
import {assetEvidenceOfState, DEFAULT_ASSET_POLICY} from '../sourceRuntime/assetEvidence'
import {declaredSelections, sourceKeyOf} from './sourceEvidence'

// When evidence about a source is still about the source as the session holds it now.
//
// Evidence is read from particular records, assets and credentials: its basis, built here from what an operation read
// and the session it started in. The evidence lifecycle (evidenceRegistry.js) records it, and decides by this rule
// whether to read again and whether an answer may still be published.
//
// An asset is judged by what the source runtime knows of it (assetEvidence.js): its token and how often it was
// explicitly refreshed. Evidence read from a source without a token is read again once it is too old (`expiresAt`), and
// all of it once the consuming recipe is refreshed.

// The session a basis is judged against, read from the store the way the lifecycle reads it.
export const evidenceSession = state => ({
    loadedRecipes: selectFrom(state, 'process.loadedRecipes') || {},
    catalogue: selectFrom(state, 'process.recipes') || [],
    // A recipe with a tab is being edited, and one closed while its saves are unsettled still holds its edit. Its cached
    // record is a draft, and no dependency read may replace it with what happens to be persisted (draftAgreement.js).
    openRecipeIds: (selectFrom(state, 'process.tabs') || []).map(({id}) => id),
    saves: selectFrom(state, 'process.saveStates') || {},
    assetEvidence: assetEvidenceOfState(state),
    sourceRefreshes: selectFrom(state, 'process.sourceRefreshes') || NO_REFRESHES,
    earthEngineGeneration: earthEngineGeneration(state)
})

const NO_REFRESHES = Object.freeze({})

// The credential container is replaced when Google credentials change, so its identity is an invalidation epoch. It is
// numbered by identity, so nothing compares, retains or publishes what it contains.
export const earthEngineGeneration = state => {
    const credentials = selectFrom(state, ['user', 'currentUser', 'googleTokens'])
    if (!credentials || typeof credentials !== 'object') {
        return 0
    }
    if (!GENERATIONS.has(credentials)) {
        GENERATIONS.set(credentials, ++generations)
    }
    return GENERATIONS.get(credentials)
}

// Before anything has been resolved, all that is known is the source the recipe names.
export const startingBasis = ({reference, recipe, session}) => ({
    ...operationState({reference, recipe, session}),
    dependencies: [dependency(reference.type === ASSET ? {assetId: reference.id} : {id: reference.id}, session)]
})

// What an operation actually read: every record its closure resolved and, where `assets`, the asset it was rooted at
// where the selection is one and every asset the resolved edges named. `used` is the record that went into the answer
// and `seeded` the one the session held when the operation STARTED - both, because a record the operation refreshed is
// briefly one and then the other, and neither is a change.
export const resolvedBasis = ({reference, recipe, graph, recipesById, session, assets}) => {
    const assetIds = assets
        ? new Set([
            ...(reference.type === ASSET ? [reference.id] : []),
            ...graph.edges.filter(edge => edge.reference.type === ASSET).map(edge => edge.reference.id)
        ])
        : new Set()
    const unversioned = [...assetIds].some(assetId => isUnversionedAsset(session, assetId))
    return {
        ...operationState({reference, recipe, session}),
        dependencies: [
            ...graph.recipes
                .filter(({id}) => id !== recipe.id)
                .map(({id}) => dependency({id, used: recipesById.get(id)}, session)),
            ...[...assetIds].map(assetId => dependency({assetId}, session))
        ],
        ...(unversioned && {expiresAt: session.now + DEFAULT_ASSET_POLICY.unversionedMaxAgeMs})
    }
}

// What the session holds, minus anything the catalogue has moved past: leaving a stale record in a closure's seed means
// it never asks for it, and an observation reads the version it was already reading. An open recipe is never dropped -
// that entry is a draft, not a copy of what is persisted.
export const currentRecords = session =>
    new Map(Object.entries(session.loadedRecipes).filter(([id]) => !isBehind(session, id)))

export const isBehind = (session, id) => {
    // A draft - open, or closed with its saves unsettled - is not a copy of what is persisted. The cache refuses to
    // overwrite one; not asking for it in the first place saves a read that could only be discarded.
    if (isDraft({open: session.openRecipeIds.includes(id), saveState: session.saves[id]})) {
        return false
    }
    const record = session.loadedRecipes[id]
    const published = publishedRevision(session, id)
    // Strictly behind, never merely different. A record read after the catalogue listing is NEWER than the summary, and
    // reloading it would fetch the same revision again on every update.
    return Number.isInteger(record?.revision) && Number.isInteger(published)
        && record.revision < published
}

// Only what was actually observed can be seen to change. A record or version that was unknown when the answer was
// read says nothing about it now, and a record the session has released says only that.
export const outdatedBasis = (basis, {recipe, sourceKey, session}) =>
    basis.key !== sourceKey
    || !sameSelections(declaredSelections(recipe), basis.selections)
    || basis.earthEngineGeneration !== session.earthEngineGeneration
    || basis.refreshed !== recipeRefreshes(session, recipe?.id)
    || (Number.isFinite(basis.expiresAt) && session.now >= basis.expiresAt)
    || basis.dependencies.some(dependency => dependencyChanged(dependency, session))

// The token the session knows for an asset: undefined before any read answered, null for a source without one.
export const assetVersion = ({assetEvidence = {}}, assetId) => {
    const entry = assetEvidence[assetId]
    return !entry || entry.checkedAt === null ? undefined : entry.version
}

export const isUnversionedAsset = ({assetEvidence = {}}, assetId) => Boolean(assetEvidence[assetId]?.unversioned)

export const assetRefreshes = ({sourceRefreshes = {}}, assetId) => sourceRefreshes.assets?.[assetId] || 0

export const recipeRefreshes = ({sourceRefreshes = {}}, recipeId) => sourceRefreshes.recipes?.[recipeId] || 0

export const publishedRevision = ({catalogue}, id) =>
    catalogue.find(summary => summary.id === id)?.revision

const GENERATIONS = new WeakMap()
let generations = 0

const operationState = ({reference, recipe, session}) => ({
    key: sourceKeyOf(reference),
    selections: declaredSelections(recipe),
    earthEngineGeneration: session.earthEngineGeneration,
    refreshed: recipeRefreshes(session, recipe.id)
})

const dependency = ({id, assetId, used}, session) =>
    assetId
        ? {assetId, version: assetVersion(session, assetId), refreshed: assetRefreshes(session, assetId)}
        : {id, used, seeded: session.loadedRecipes[id], version: publishedRevision(session, id)}

const dependencyChanged = ({id, assetId, used, seeded, version, refreshed}, session) => {
    if (assetId) {
        return moved(version, assetVersion(session, assetId)) || refreshed !== assetRefreshes(session, assetId)
    }
    const record = session.loadedRecipes[id]
    const observed = used !== undefined || seeded !== undefined
    return (observed && record !== undefined && !sameSourceRecord(record, used) && !sameSourceRecord(record, seeded))
        || moved(version, publishedRevision(session, id))
}

const sameSourceRecord = (current, previous) =>
    current === previous || (previous !== undefined && _.isEqual(sourceInputs(current), sourceInputs(previous)))

// Keep persisted inputs conservative: equal bands do not imply equal pixels. Runtime evidence and restored style
// provenance also affect descriptions; panel values, dirtiness and chart state do not.
const sourceInputs = recipe => ({
    ..._.omit(recipe, 'ui'),
    sourceEvidence: recipe.ui?.sourceEvidence,
    savedLayerSource: recipe.ui?.savedLayerSource
})

const sameSelections = (current, basis) =>
    current.length === basis.length && current.every((selection, index) => selection === basis[index])

// A version that was unknown on either side is no evidence of movement.
const moved = (before, after) =>
    before !== undefined && after !== undefined && before !== after
