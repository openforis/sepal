import {AGREED} from '~/app/home/body/process/recipeSession/draftAgreement'

import {assetAuthority, CURRENT as ASSET_CURRENT} from './assetEvidence'
import {PRIVATE} from './recordCurrency'
import {sourceCurrency} from './sourceCurrency'

// Whether dependency evidence an operation answered with (#sepal/recipe/calculation/freshness) still holds, judged
// against what the session knows of the sources it read (sourceCurrency.js), as every other runtime answer is.
//
// Evidence is taken as acquired: under the credentials its request was asked with, when it arrived, and with a ledger of
// what it read - each recipe at the revision it was read at, with whether the listing listed it when it was asked or
// answered, and each recipe and asset with how often it had been explicitly refreshed when it was asked, so a refresh
// made while it runs supersedes it.
//
//   CURRENT       none of the below
//   SUPERSEDED    other credentials, older than `maxAgeMs`, or an entry superseded: a newer revision known, a recipe
//                 listed then no longer listed, a refresh since, another token for an asset or that asset found missing
//   DRAFTED       a recipe it read is open as a draft storage does not hold (draftAgreement.js): nothing storage answers
//                 settles it before the draft's saves do
//   UNAUTHORIZED  an asset it read has no current authority (assetEvidence.js): not read yet, its check expired or
//                 failing, or a mutation the session knows of still unsettled - which a matching old token does not settle

export const CURRENT = 'CURRENT'
export const SUPERSEDED = 'SUPERSEDED'
export const DRAFTED = 'DRAFTED'
export const UNAUTHORIZED = 'UNAUTHORIZED'

// What a request is asked under, taken as it starts.
export const askedUnder = (session, now) =>
    ({credentials: session.credentials, listed: listedIn(session), currency: sourceCurrency(session), at: now})

export const acquisitionOf = ({id, evidence, asked, session, now}) => {
    const listed = listedIn(session)
    const {recipes, assets} = evidence.provenance
    return {
        id,
        evidence,
        credentials: asked.credentials,
        observedAt: now,
        ledger: [
            ...recipes.flatMap(({id, revision}) => [
                {id, revision, listed: asked.listed.has(id) || listed.has(id)},
                asked.currency.refreshEvidence(id)
            ]),
            ...assets.map(({id, version}) => ({...asked.currency.assetEvidence(id, asked.at), version, unversioned: version === null}))
        ]
    }
}

export const standingOf = (acquisition, session, {now, maxAgeMs}) => {
    const currency = sourceCurrency(session)
    if (acquisition.credentials !== session.credentials || now - acquisition.observedAt >= maxAgeMs
        || acquisition.ledger.some(entry => currency.superseded(entry))) {
        return SUPERSEDED
    }
    const {recipes, assets} = acquisition.evidence.provenance
    const drafted = recipes.some(({id}) => {
        const record = session.catalogue?.[id]
        return record && currency.evidence(record, PRIVATE).agreement !== AGREED
    })
    if (drafted) {
        return DRAFTED
    }
    const authorized = assets.every(({id}) => assetAuthority(session.assetEvidence?.[id], {now}) === ASSET_CURRENT)
    return authorized ? CURRENT : UNAUTHORIZED
}

const listedIn = session => new Set((session.listing || []).map(({id}) => id))
