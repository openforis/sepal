import {PRESERVES, PRODUCES, providerStep, UNSUPPORTED} from '#sepal/recipe/capability/providerStep'
import {ASSET} from '#sepal/recipe/source/reference'

// A referenced recipe that is not among the records the closure resolved.
export const UNRESOLVED = 'UNRESOLVED'
// A reference reached twice on one path.
export const CYCLIC = 'CYCLIC'
// Nothing to follow: the selection is not a reference at all.
export const NOT_A_SOURCE = 'NOT_A_SOURCE'

export {UNSUPPORTED}

export class SourceProviderError extends Error {
    constructor(reason, message, {id, record} = {}) {
        super(message)
        this.name = 'SourceProviderError'
        this.reason = reason
        this.id = id
        this.record = record
    }
}

// Which record or asset a reference stands for, over records the closure already resolved, by taking one
// capability's step until it arrives somewhere or cannot go on.
//
//   {record, declared}  the record that produces it, with the terms it declared - an asset-backed recipe is
//                       one of these, so a consumer keeps both the record and where it says to look
//   {assetId}           a bare asset; what it holds is the asset's own to answer
//   {error}             the walk arrived nowhere, diagnosed
//
// Over records alone: nothing here loads, caches or watches. What a failure is CALLED where a consumer
// reports it is that consumer's, which is why the error carries the reason and the record it stopped at.
export const resolveProvider = (reference, recipesById, capability) => {
    const seen = new Set()
    let current = reference
    while (current) {
        if (current.type === ASSET) {
            return {assetId: current.id}
        }
        // The closure that produced these records rejected cycles already; this only stops rather than loops.
        if (seen.has(current.id)) {
            return failure(CYCLIC, `Source references itself: ${current.id}`, {id: current.id})
        }
        seen.add(current.id)
        const record = recipesById.get(current.id)
        if (!record) {
            return failure(UNRESOLVED, `Source recipe ${current.id} was not resolved`, {id: current.id})
        }
        const {status, declared, reference: preserved} = providerStep(record, capability)
        if (status === PRODUCES) {
            return {record, declared}
        }
        if (status !== PRESERVES) {
            return failure(status, `${record.type} recipe ${record.id} provides no ${capability.name}`, {record})
        }
        current = preserved
    }
    return failure(NOT_A_SOURCE, `Not a source ${capability.name} can be read from`)
}

const failure = (reason, message, context) =>
    ({error: new SourceProviderError(reason, message, context)})
