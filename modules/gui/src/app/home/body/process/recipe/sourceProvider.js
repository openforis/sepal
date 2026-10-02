import {CYCLIC, discoverProvider, FOUND, NOT_A_SOURCE, UNRESOLVED, UNSUPPORTED} from '#sepal/recipe/capability/discoverProvider'

export {CYCLIC, NOT_A_SOURCE, UNRESOLVED, UNSUPPORTED}

export class SourceProviderError extends Error {
    constructor(reason, message, {id, record} = {}) {
        super(message)
        this.name = 'SourceProviderError'
        this.reason = reason
        this.id = id
        this.record = record
    }
}

// Which record or asset a reference stands for, by the shared discovery (discoverProvider.js), for a caller that
// treats every way the walk can end without a provider as a failure.
//
//   {record, declared}  the record that produces it, with the terms it declared - an asset-backed recipe is
//                       one of these, so a consumer keeps both the record and where it says to look
//   {assetId}           a bare asset; what it holds is the asset's own to answer
//   {error}             the walk arrived nowhere, diagnosed
//
// What a failure is CALLED where a consumer reports it is that consumer's, which is why the error carries the reason
// and the record it stopped at.
export const resolveProvider = (reference, recipesById, capability) => {
    const discovery = discoverProvider(reference, recipesById, capability)
    return discovery.status === FOUND
        ? discovery.provider
        : {error: providerError(discovery, capability)}
}

const providerError = ({status, at}, capability) => {
    switch (status) {
        case CYCLIC:
            return new SourceProviderError(status, `Source references itself: ${at.reference.id}`, {id: at.reference.id})
        case UNRESOLVED:
            return new SourceProviderError(status, `Source recipe ${at.reference.id} was not resolved`, {id: at.reference.id})
        case NOT_A_SOURCE:
            return new SourceProviderError(status, `Not a source ${capability.name} can be read from`)
        default:
            return new SourceProviderError(
                status, `${at.record.type} recipe ${at.record.id} provides no ${capability.name}`, {record: at.record}
            )
    }
}
