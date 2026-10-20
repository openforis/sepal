import {selectFrom} from '~/stateUtils'

import {AGREED, draftAgreement, isDraft} from '../draftAgreement'

// What this session knows of each recipe record's persisted state, from the parts of the session that say so: the
// records it holds, the recipe listing and how current it is (recipeListing.js), the open recipes, and what their
// saves have made persistent (saveCoordinator.js).
//
// A record is a draft while it is open or its saves are unsettled (draftAgreement.js). The newest revision known of a recipe is the newest the listing, its
// acknowledged saves or a cached copy that is not a draft says.
//
// A revision here is the best evidence this session has, not what Earth Engine read: storage can move between the
// listing, the browser's load and Earth Engine's own load, and nothing reports what Earth Engine read. So an answer
// is withdrawn when evidence arrives that supersedes what it was read from, and the race no evidence reports remains.
//
//   evidence(record, origin)  what an answer read from a record is known to depend on:
//                             {id, origin, revision, listed, agreement}. A draft is recorded at the newest revision
//                             known, with whether it agrees with it; every other record at its own revision.
//   unread(id)                the same for a record that could not be read: the revision known when it failed, so a
//                             revision known later - its recipe listed again - is newer evidence
//   superseded(entry)         a newer revision is known than the one recorded, or a recipe listed when it was read is
//                             listed no longer - which does not say it was deleted, only that it must be read again.
//                             One that was never listed says nothing by staying unlisted.
//   staleness(record)         why a record the session caches must be read before anything is answered from it: a
//                             newer revision is known, or its recipe was withdrawn from the listing and has not been
//                             read since. Null for a current record and for any draft.

export const SESSION = 'SESSION'
export const PRIVATE = 'PRIVATE'
export const DRAFT = 'DRAFT'

export const recordCurrency = ({catalogue = {}, listing = [], listingState = {}, tabs = [], saves = {}} = {}) => {
    const cached = latest
    if (cached && cached.catalogue === catalogue && cached.listing === listing && cached.listingState === listingState
        && cached.tabs === tabs && cached.saves === saves) {
        return cached.currency
    }
    const currency = currencyOf({catalogue, listing, listingState, tabs, saves})
    latest = {catalogue, listing, listingState, tabs, saves, currency}
    return currency
}

export const knownRevisionOf = ({listed, saveState, cached}) => newest(newest(listed, saveState?.revision), cached)

// Staleness alone, for a reader rendering from the session: it changes only with the listing, the open recipes and
// which closed recipes are still saving - not with every record, or with each save of an open one.
export const recordStalenessOfState = state => {
    const listing = selectFrom(state, 'process.recipes') || NONE
    const listingState = selectFrom(state, 'process.recipeListing') || EMPTY
    const tabs = selectFrom(state, 'process.tabs') || NONE
    const saves = selectFrom(state, 'process.saveStates') || EMPTY
    const open = new Set(tabs.map(({id}) => id))
    const unsettled = Object.keys(saves).filter(id => !open.has(id) && isDraft({saveState: saves[id]})).sort().join()
    const cached = latestStaleness
    if (cached && cached.listing === listing && cached.listingState === listingState && cached.tabs === tabs
        && cached.unsettled === unsettled) {
        return cached.staleness
    }
    const staleness = {staleness: stalenessOf({listing, listingState, tabs, saves})}
    latestStaleness = {listing, listingState, tabs, unsettled, staleness}
    return staleness
}

const EMPTY = Object.freeze({})
const NONE = Object.freeze([])

let latest = null
let latestStaleness = null

const stalenessOf = ({listing, listingState, tabs, saves}) => {
    const listed = new Map(listing.map(({id, revision}) => [id, revision]))
    const withdrawn = new Set(listingState.withdrawn || [])
    const open = new Set(tabs.map(({id}) => id))
    return record => {
        const {id} = record
        if (isDraft({open: open.has(id), saveState: saves[id]})) {
            return null
        }
        if (withdrawn.has(id)) {
            return {id, withdrawn: true}
        }
        const known = listed.get(id)
        return isRevision(known) && isRevision(record.revision) && known > record.revision
            ? {id, revision: known}
            : null
    }
}

const currencyOf = ({catalogue, listing, listingState, tabs, saves}) => {
    const listed = new Map(listing.map(({id, revision}) => [id, revision]))
    const open = new Set(tabs.map(({id}) => id))
    const draft = id => isDraft({open: open.has(id), saveState: saves[id]})
    const knownRevision = id => knownRevisionOf({
        listed: listed.get(id), saveState: saves[id], cached: draft(id) ? undefined : catalogue[id]?.revision
    })
    return {
        evidence: (record, origin) => {
            const {id} = record
            if (draft(id)) {
                const known = knownRevision(id)
                return {
                    id, origin: DRAFT, revision: revisionOf(newest(known, record.revision)), listed: listed.has(id),
                    agreement: draftAgreement({draft: record, saveState: saves[id], knownRevision: known})
                }
            }
            return {id, origin, revision: revisionOf(record.revision), listed: listed.has(id), agreement: AGREED}
        },
        unread: (id, origin) =>
            ({id, origin, revision: revisionOf(knownRevision(id)), listed: listed.has(id), agreement: AGREED, unread: true}),
        superseded: ({id, revision, listed: wasListed}) => {
            const known = knownRevision(id)
            return (isRevision(known) && (!isRevision(revision) || known > revision)) || (wasListed && !listed.has(id))
        },
        staleness: stalenessOf({listing, listingState, tabs, saves})
    }
}

const isRevision = value => Number.isInteger(value)

const revisionOf = value => isRevision(value) ? value : null

const newest = (a, b) => isRevision(a) && isRevision(b) ? Math.max(a, b) : isRevision(a) ? a : isRevision(b) ? b : undefined
