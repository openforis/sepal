import {isDefinitiveFailure} from './assetEvidence'
import {recordCurrency} from './recordCurrency'

// What this session knows of every source an answer read: the recipe records (recordCurrency.js) and the Earth Engine
// assets (assetEvidence.js). A work keeps a ledger of both, and is withdrawn as soon as an entry is superseded.
//
// An asset entry records the token known when its closure was read: {asset, version, unversioned, readAt}. It is
// superseded by
//
//   - a read finding the asset missing or unreadable, for these credentials;
//   - a different token than the one recorded;
//   - for an entry recorded before any token was known, a token change seen after it was read;
//   - for an unversioned source, which nothing can report changed, a token appearing. How old what was read from it
//     may grow before it authorizes nothing is Retrieve's to decide (retrieveOutput.js); age alone withdraws nothing
//     here, so it never makes a preview draw again.
//
// Evidence released since says nothing, and neither does a matching token: it is evidence, not proof, so pixels keep
// their own age elsewhere.
//
// An explicit refresh (`sourceRefreshes`) supersedes what was read before it: a work records how often its root recipe
// and each asset had been refreshed, and is withdrawn once either is refreshed again.

export const sourceCurrency = session => {
    const records = recordCurrency(session)
    const assets = session.assetEvidence || NO_ASSETS
    const refreshes = session.sourceRefreshes || NO_ASSETS
    if (latest && latest.records === records && latest.assets === assets && latest.refreshes === refreshes) {
        return latest.currency
    }
    const recipeRefreshes = id => refreshes.recipes?.[id] || 0
    const assetRefreshes = id => refreshes.assets?.[id] || 0
    const currency = {
        ...records,
        assetEvidence: (id, readAt) => {
            const entry = assets[id]
            return {
                asset: id, version: entry?.version ?? null, unversioned: Boolean(entry?.unversioned), readAt,
                refreshed: assetRefreshes(id)
            }
        },
        refreshEvidence: recipeId => ({refreshOf: recipeId, refreshed: recipeRefreshes(recipeId)}),
        superseded: entry => {
            if (entry.refreshOf) {
                return entry.refreshed !== recipeRefreshes(entry.refreshOf)
            }
            return entry.asset
                ? entry.refreshed !== assetRefreshes(entry.asset) || assetSuperseded(assets[entry.asset], entry)
                : records.superseded(entry)
        }
    }
    latest = {records, assets, refreshes, currency}
    return currency
}

let latest = null

const NO_ASSETS = Object.freeze({})

const assetSuperseded = (evidence, {version, unversioned, readAt}) => {
    if (!evidence) {
        return false
    }
    if (isDefinitiveFailure(evidence)) {
        return true
    }
    if (unversioned) {
        return evidence.checkedAt !== null && !evidence.unversioned
    }
    if (version !== null) {
        return evidence.checkedAt !== null && evidence.version !== version
    }
    // A change seen by a request started as it was read may have preceded the read or not; it is taken to have.
    return evidence.changedAt !== null && evidence.changedAt >= readAt
}
