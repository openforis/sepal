import _ from 'lodash'

import {SAVING} from './saveCoordinator'

// The recipe listing (`process.recipes`) is this session's evidence of which recipes storage holds, at which
// revision. `process.recipeListing` says how current that evidence is:
//
//   checkedAt   when the request behind the evidence STARTED, so a late response cannot pass for a recent check
//   expired     the evidence is older than Retrieve's authority allows, published when it lapses
//   refreshing  a refresh is in flight, since `refreshingSince`
//   failure     the last refresh failed, with its message and when; cleared by the next success
//   epoch       a counter stamped on local changes to which recipes are listed
//   touched     {id: epoch} of those changes: one per recipe, kept, since any response that started before one can still
//               arrive - a refresh, a move and a project removal can each be in flight
//   withdrawn   ids a successful refresh stopped listing, which says only that they are unlisted, not deleted
//
// A response is merged, never swapped in - whether a refresh's, the session's first listing's, or the one a move or a
// project removal answers with. Revisions only advance, and an entry's fields stay with its newest revision. An id
// changed here after the request started (created, deleted or moved), with a save outstanding, or whose saves moved on
// while the request was in flight keeps what this session did with it; fields only this session sets on an entry, such
// as a selection, are kept. A response whose request started before the evidence already merged says nothing newer
// about which recipes exist, so it only brings entries up to newer revisions.

export const LISTING_STATE_PATH = 'process.recipeListing'

export const DEFAULT_AUTHORITY_MAX_AGE_MS = 300000

// A local change to which recipes are listed.
export const touchedListing = (listingState = {}, ids) => {
    const epoch = (listingState.epoch || 0) + 1
    return {
        ...listingState,
        epoch,
        touched: {...listingState.touched, ...Object.fromEntries(ids.map(id => [id, epoch]))}
    }
}

export const refreshingListing = (listingState = {}, startedAt) =>
    ({...listingState, refreshing: true, refreshingSince: startedAt})

export const failedListing = (listingState = {}, error, at = Date.now()) =>
    ({...listingState, refreshing: false, refreshingSince: null, failure: {message: error?.message || String(error), at}})

export const expiredListing = (listingState = {}) =>
    ({...listingState, expired: true})

// A refresh settled with its response merged.
export const refreshedListing = (listingState = {}) =>
    ({...listingState, refreshing: false, refreshingSince: null, failure: null})

// What a request must remember from when it started, for its response to be merged.
export const listingRequest = ({listingState = {}, saves = {}, now}) =>
    ({startedAt: now, startedEpoch: listingState.epoch || 0, savesAtStart: saves})

export const mergedListing = ({
    recipes = [], listingState = {}, saves = {}, response, startedAt, startedEpoch, savesAtStart = saves, now,
    authorityMaxAgeMs = DEFAULT_AUTHORITY_MAX_AGE_MS
}) => {
    const touched = listingState.touched || {}
    const changedHere = id => (touched[id] || 0) > startedEpoch || saves[id]?.status === SAVING
        || saves[id] !== savesAtStart[id]
    const superseded = startedAt < (listingState.checkedAt ?? -Infinity)
    const membershipKept = id => superseded || changedHere(id)
    const local = new Map(recipes.map(entry => [entry.id, entry]))
    const listed = new Set(response.map(({id}) => id))
    const merged = [
        ...response
            .filter(({id}) => local.has(id) || !membershipKept(id))
            .map(entry => mergedEntry(local.get(entry.id), entry, changedHere(entry.id))),
        ...recipes.filter(({id}) => !listed.has(id) && membershipKept(id))
    ]
    const dropped = recipes.filter(({id}) => !listed.has(id) && !membershipKept(id)).map(({id}) => id)
    const checkedAt = Math.max(listingState.checkedAt ?? -Infinity, startedAt)
    return {
        recipes: merged,
        listingState: {
            ...listingState,
            checkedAt,
            expired: now - checkedAt >= authorityMaxAgeMs,
            touched,
            withdrawn: superseded
                ? listingState.withdrawn || []
                : _.uniq([...listingState.withdrawn || [], ...dropped]).filter(id => !listed.has(id))
        }
    }
}

// Whether the listing is recent enough to authorize a Retrieve: CURRENT, WAITING for a first listing still loading,
// or EXPIRED and UNAVAILABLE - which say whether the refresh that should have renewed it failed.
export const CURRENT = 'CURRENT'
export const WAITING = 'WAITING'
export const EXPIRED = 'EXPIRED'
export const UNAVAILABLE = 'UNAVAILABLE'

export const listingAuthority = ({listingState, now, authorityMaxAgeMs = DEFAULT_AUTHORITY_MAX_AGE_MS}) => {
    const {checkedAt, expired, refreshing, failure} = listingState || {}
    if (!Number.isFinite(checkedAt)) {
        return refreshing ? WAITING : UNAVAILABLE
    }
    if (!expired && now - checkedAt < authorityMaxAgeMs) {
        return CURRENT
    }
    return failure ? UNAVAILABLE : EXPIRED
}

const mergedEntry = (local, entry, keptLocally) => {
    if (!local) {
        return entry
    }
    const revision = newest(local.revision, entry.revision)
    return keptLocally || isNewer(local.revision, entry.revision)
        ? {...entry, ...local, revision}
        : {...local, ...entry, revision}
}

const isNewer = (a, b) => Number.isInteger(a) && (!Number.isInteger(b) || a > b)

const newest = (a, b) =>
    Number.isInteger(a) && Number.isInteger(b) ? Math.max(a, b) : Number.isInteger(a) ? a : b
