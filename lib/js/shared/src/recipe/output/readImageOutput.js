// What can be said about a recipe's IMAGE_OUTPUT from what is held right now, without acquiring anything.
//
// Resolution over the records and observations a caller holds, classified by what would change the answer:
//
//   READY           every read was satisfied
//   NEEDS_EVIDENCE  a read reached a recipe that is not held or an observation that was not supplied, and
//                   `needs` names them; holding them may change the answer
//   INVALID         a definitive diagnosis on the read path, which no evidence repairs - including an output
//                   nothing declares, which is the caller's to answer some other way or not at all
//
// A definitive diagnosis outranks missing evidence: loading the rest cannot make it describable. What a missing
// record means is the caller's to say. Over a session's loaded records it is ordinary lazy loading; over a
// closure already completed it is a recipe that could not be had.

import {MISSING_SOURCE} from '../source/diagnostic.js'
import {UNAVAILABLE_DESCRIPTION} from './diagnostic.js'
import {resolveImageOutput} from './resolveImageOutput.js'

export const READY = 'READY'
export const NEEDS_EVIDENCE = 'NEEDS_EVIDENCE'
export const INVALID = 'INVALID'

export const referenceKey = ({type, id}) => `${type}:${id}`

// `product`, where given, names one of the root's map products to describe instead of its canonical output, and
// `productFor(recipe, name)` finds its declaration.
export const readImageOutput = ({graph, declarationFor, observationFor = () => undefined, product, productFor}) => {
    const {description, diagnostics} = resolveImageOutput({graph, declarationFor, observationFor, product, productFor})
    if (description) {
        return {status: READY, description, diagnostics, needs: {records: [], observations: []}}
    }
    const needs = neededEvidence(diagnostics)
    return {
        status: diagnostics.some(isDefinitive) || !(needs.records.length || needs.observations.length)
            ? INVALID
            : NEEDS_EVIDENCE,
        description: null,
        diagnostics,
        needs
    }
}

// Evidence still missing settles nothing; any other diagnosis does, whatever the rest of the read is waiting for.
const isDefinitive = ({code}) =>
    code !== MISSING_SOURCE && code !== UNAVAILABLE_DESCRIPTION

// The graph records an absent recipe's id as the tail of its path; an unanswered observation names its reference.
const neededEvidence = diagnostics => {
    const records = new Set()
    const observations = new Map()
    diagnostics.forEach(({code, recipePath, reference}) => {
        if (code === MISSING_SOURCE) {
            records.add(recipePath[recipePath.length - 1])
        } else if (code === UNAVAILABLE_DESCRIPTION) {
            observations.set(referenceKey(reference), reference)
        }
    })
    return {records: [...records], observations: [...observations.values()]}
}
