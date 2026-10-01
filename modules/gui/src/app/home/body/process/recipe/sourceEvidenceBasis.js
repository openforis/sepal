import _ from 'lodash'

import {selectFrom} from '~/stateUtils'

import {assetEvidenceOfState} from '../sourceRuntime/assetEvidence'
import {declaredSelections} from './sourceEvidence'

// When evidence about a source is still about the source as the session holds it now.
//
// Evidence is read from particular records, assets and credentials: its basis. The evidence lifecycle
// (sourceEvidenceSync.jsx) records that basis, and decides by this rule whether to read again and whether an answer
// may still be published.
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
