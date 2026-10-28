import {ASSET} from '../source/reference.js'
import {MALFORMED, PRESERVES, PRODUCES, providerStep, UNSUPPORTED} from './providerStep.js'

// Which record or asset a selected source stands for, for one capability, over records already held - and the way
// there. Discovery says where to look, not what is there: an asset-backed producer names an asset whose contents are
// still to be read, and whether what is found satisfies a consumer is that consumer's to decide from evidence about it.
//
//   {status: FOUND, provider, chain}     provider: {record, declared} | {assetId}
//   {status: UNRESOLVED, chain, at}      a record on the way the records do not hold; reading it may decide
//   {status: UNSUPPORTED, chain, at}     a record that neither produces nor preserves it
//   {status: MALFORMED, chain, at}       a preserving record whose model does not fill its role exactly once
//   {status: CYCLIC, chain, at}          a reference reached twice
//   {status: NOT_A_SOURCE, chain}        a selection that is not a reference at all
//
// `chain` is every record followed, from the selected one on: [{reference, record, role}], `role` being the input it
// was followed through. `at` is where the walk stopped: {reference, record?, role?}.
//
// Over records alone: nothing here loads, caches or watches.

export const FOUND = 'FOUND'
export const UNRESOLVED = 'UNRESOLVED'
export const CYCLIC = 'CYCLIC'
export const NOT_A_SOURCE = 'NOT_A_SOURCE'

export {MALFORMED, UNSUPPORTED}

export const discoverProvider = (selected, recordsById, capability) => {
    const chain = []
    const seen = new Set()
    let current = selected
    while (current) {
        if (current.type === ASSET) {
            return {status: FOUND, provider: {assetId: current.id}, chain}
        }
        // The closure that produced these records rejected cycles already; this only stops rather than loops.
        if (seen.has(current.id)) {
            return {status: CYCLIC, chain, at: {reference: current}}
        }
        seen.add(current.id)
        const record = recordsById.get(current.id)
        if (!record) {
            return {status: UNRESOLVED, chain, at: {reference: current}}
        }
        const {status, declared, reference, role} = providerStep(record, capability)
        if (status === PRODUCES) {
            return {status: FOUND, provider: {record, declared}, chain}
        }
        if (status !== PRESERVES) {
            return {status, chain, at: {reference: current, record, ...(role && {role})}}
        }
        chain.push({reference: current, record, role})
        current = reference
    }
    return {status: NOT_A_SOURCE, chain}
}
