import _ from 'lodash'

import {selectFrom} from '~/stateUtils'

import {currentSourceEvidence, declaredSelections, inheritedSourceKey, OBSERVED, UNOBSERVED} from './sourceEvidence'

// When evidence about a source is still about the source as the session holds it now.
//
// Evidence is read from particular records, assets and credentials: its basis. The evidence lifecycle
// (sourceEvidenceSync.jsx) records that basis, decides by this rule whether to read again and whether an answer may
// still be published, and retains the basis of what it publishes with the source runtime it runs under
// (PublishedEvidenceBases). A consumer that authorizes an export from evidence asks the same rule, of the session as
// it stands at that moment - not of whether the lifecycle has yet reacted to a change, which happens only after the
// change has been rendered.

// The session a basis is judged against, read from the store the way the lifecycle reads it.
export const evidenceSession = state => ({
    loadedRecipes: selectFrom(state, 'process.loadedRecipes') || {},
    catalogue: selectFrom(state, 'process.recipes') || [],
    // A recipe with a tab is being edited. Its cached record is a draft, and no dependency read may replace it with
    // what happens to be persisted.
    openRecipeIds: (selectFrom(state, 'process.tabs') || []).map(({id}) => id),
    assetVersions: [...(selectFrom(state, 'assets.user') || []), ...(selectFrom(state, 'assets.other') || [])],
    earthEngineGeneration: earthEngineGeneration(state)
})

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
    || basis.dependencies.some(dependency => dependencyChanged(dependency, session))

// Physical facts about the inherited source that the evidence lifecycle vouches for right now: evidence it published
// for the source this recipe names, read from what the session holds now. Anything else - a snapshot, evidence read
// before the source or the credentials changed - is no observation, whatever the evidence says.
//
//   OBSERVED     `bands` as observed
//   UNAVAILABLE  the current source could not be observed
//   UNOBSERVED   nothing current yet
export const currentSourceFacts = (recipe, state, publishedEvidence) => {
    const evidence = currentSourceEvidence(recipe)
    const basis = evidence && publishedEvidence.basisOf(evidence.observation)
    const sourceKey = inheritedSourceKey(recipe)
    if (!evidence || !basis || outdatedBasis(basis, {recipe, sourceKey, session: evidenceSession(state)})) {
        return {status: UNOBSERVED, bands: []}
    }
    return evidence.status === OBSERVED
        ? {status: OBSERVED, bands: evidence.bands || []}
        : {status: evidence.status, bands: []}
}

// The bases of the evidence published under one source runtime, each retained by the lifecycle that published it and
// found by the observation it published, which no other publication shares.
//
// Held here rather than in the store, which copies what it is given: the rule compares a selection by identity, so
// that reapplying a source panel is a change, and a copy is never the selection it was read for. Each owner retains
// one basis, the last it published, before that evidence is dispatched; stopping releases its own and nothing else.
export class PublishedEvidenceBases {
    #retained = new Map()

    retain(owner, observation, basis) {
        this.#retained.set(owner, {observation, basis})
    }

    release(owner) {
        this.#retained.delete(owner)
    }

    basisOf(observation) {
        for (const retained of this.#retained.values()) {
            if (retained.observation === observation) {
                return retained.basis
            }
        }
        return null
    }
}

export const assetVersion = ({assetVersions}, assetId) =>
    assetVersions.find(({id}) => id === assetId)?.updateTime

export const publishedRevision = ({catalogue}, id) =>
    catalogue.find(summary => summary.id === id)?.revision

const GENERATIONS = new WeakMap()
let generations = 0

const dependencyChanged = ({id, assetId, used, seeded, version}, session) => {
    if (assetId) {
        return moved(version, assetVersion(session, assetId))
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
