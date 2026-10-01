import {selectFrom} from '~/stateUtils'

import {earthEngineGeneration} from '../recipe/sourceEvidenceBasis'

// What this session knows of the Earth Engine assets its consumers read: each asset's change token, how recently it was
// read, and whether the latest read failed. Held in the session (`process.assetEvidence`) for the credentials it was
// read under, so everything reading it decides synchronously from one state.
//
// The token is the asset's metadata `updateTime`, opaque and compared only for equality (modules/gee/src/jobs/ee/asset/
// versions.js). A change is any difference. A matching token is evidence, not proof, that nothing changed. A source with
// no token - a Cloud GeoTIFF, or an asset whose metadata carries none - is unversioned: nothing it reports can say it
// changed, so what was read from it is bounded by age instead (sourceCurrency.js).
//
// An entry:
//
//   version      the token the latest successful read reported, or null
//   unversioned  that read reported no token
//   type         the asset type it reported
//   checkedAt    when the request that established the current evidence started, so a slow response cannot make old
//                evidence look recent
//   changedAt    when the request that first saw the current token after a different one started; null while no
//                change has been seen
//   failure      {kind: DEFINITIVE | TRANSIENT, code, at} of the latest read, cleared by a successful one
//   checking     the request the next answer must come from: only the latest request issued for an asset is
//                accepted, whatever order the answers arrive in
//   expired      the evidence has outlived its authority (DEFAULT_ASSET_POLICY), published so readers re-render
//   stale        {at, version, missing}: a mutation known to this session made the evidence stale at `at`, when it
//                stood at that token, or missing. It authorizes nothing until a read answers differently, or the
//                follow-up reads that allow for Earth Engine's propagation delay end

export const DEFINITIVE = 'DEFINITIVE'
export const TRANSIENT = 'TRANSIENT'

export const CURRENT = 'CURRENT'
export const WAITING = 'WAITING'
export const EXPIRED = 'EXPIRED'
export const UNAVAILABLE = 'UNAVAILABLE'

export const DEFAULT_ASSET_POLICY = Object.freeze({
    openMaxAgeMs: 60000,
    authorityMaxAgeMs: 300000,
    refreshLeadMs: 30000,
    retentionMs: 60000,
    maxBatch: 50,
    // After a mutation, read again at these delays while the token is unchanged: a probe saw tokens take up to five
    // seconds to change, so an unchanged first answer must not settle the mutation.
    followUpDelaysMs: Object.freeze([3000, 10000, 30000]),
    // A failure naming an asset reads it once in this long, unless its token changes meanwhile.
    failureCheckIntervalMs: 300000,
    // What was observed of a source without a token is observed again after this long.
    unversionedMaxAgeMs: 1800000
})

export const ASSET_EVIDENCE_PATH = 'process.assetEvidence'

const NO_EVIDENCE = Object.freeze({})

// The evidence the session holds for the credentials in effect: none, when it was read under others.
export const assetEvidenceOfState = state => {
    const stored = selectFrom(state, ASSET_EVIDENCE_PATH)
    return stored && stored.generation === earthEngineGeneration(state) ? stored.assets : NO_EVIDENCE
}

const UNKNOWN = Object.freeze({version: null, unversioned: false, checkedAt: null, changedAt: null, failure: null})

export const checkingAssets = (assets, ids, requestId) => ({
    ...assets,
    ...Object.fromEntries(ids.map(id => [id, {...(assets[id] || UNKNOWN), checking: requestId}]))
})

// Answers to a request, applied only to the assets still waiting for it.
export const answeredAssets = (assets, {requestId, startedAt, answers, now}) => {
    const answered = answers.filter(({id}) => assets[id]?.checking === requestId)
    return answered.length
        ? {...assets, ...Object.fromEntries(answered.map(answer => [answer.id, answeredEntry(assets[answer.id], answer, startedAt, now)]))}
        : assets
}

// A request that failed as a whole: every asset still waiting for it failed, for now.
export const failedAssets = (assets, {requestId, ids, now}) =>
    answeredAssets(assets, {requestId, startedAt: null, now, answers: ids.map(id => ({id, failure: {kind: TRANSIENT, code: 'UNAVAILABLE'}}))})

export const expiredAsset = (assets, id, checkedAt) => {
    const entry = assets[id]
    return entry && entry.checkedAt === checkedAt && !entry.expired
        ? {...assets, [id]: {...entry, expired: true}}
        : assets
}

export const staleAssets = (assets, ids, at) => ({
    ...assets,
    ...Object.fromEntries(ids.map(id => {
        const entry = assets[id] || UNKNOWN
        return [id, {...entry, stale: {at, version: entry.version, missing: isDefinitiveFailure(entry)}}]
    }))
})

// The follow-up reads after a mutation ended without a different answer: what they read stands.
export const settledAssets = (assets, ids, at) => {
    const settled = ids.filter(id => assets[id]?.stale?.at === at)
    return settled.length
        ? {...assets, ...Object.fromEntries(settled.map(id => [id, {...assets[id], stale: null}]))}
        : assets
}

export const releasedAssets = (assets, ids) => {
    const released = ids.filter(id => assets[id])
    if (!released.length) {
        return assets
    }
    const remaining = {...assets}
    released.forEach(id => delete remaining[id])
    return remaining
}

// Whether an asset's evidence may authorize what was described from it now. An unversioned source has no metadata to
// authorize it; what was read from it is bounded by age where it was read.
export const assetAuthority = (entry, {now, authorityMaxAgeMs = DEFAULT_ASSET_POLICY.authorityMaxAgeMs} = {}) => {
    if (!entry) {
        return WAITING
    }
    if (entry.failure) {
        return entry.checking ? WAITING : UNAVAILABLE
    }
    if (entry.stale) {
        return WAITING
    }
    if (entry.unversioned) {
        return CURRENT
    }
    if (entry.checkedAt === null) {
        return WAITING
    }
    if (entry.expired || now - entry.checkedAt >= authorityMaxAgeMs) {
        return entry.checking ? WAITING : EXPIRED
    }
    return CURRENT
}

export const isDefinitiveFailure = entry => entry?.failure?.kind === DEFINITIVE

const answeredEntry = (entry, {failure, version = null, unversioned = false, type}, startedAt, now) => {
    if (failure) {
        const missing = failure.kind === DEFINITIVE
        return {...entry, failure: {...failure, at: now}, checking: null, stale: missing && !entry.stale?.missing ? null : entry.stale}
    }
    const changed = entry.checkedAt !== null && entry.version !== version
    const answeredDifferently = entry.stale && (entry.stale.missing || entry.stale.version !== version)
    return {
        ...entry,
        version,
        unversioned: Boolean(unversioned),
        ...(type && {type}),
        checkedAt: startedAt,
        changedAt: changed ? startedAt : entry.changedAt,
        failure: null,
        checking: null,
        expired: false,
        stale: answeredDifferently ? null : entry.stale || null
    }
}
