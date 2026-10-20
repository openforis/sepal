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
//
// Given `readinessFor` (a recipe's type definition), the canonical output is also read for whether running it is
// possible (`readiness`, output/readiness.js): READY, NEEDS_EVIDENCE or NOT_READY, its findings kept beside what it
// still needs. What it needs joins `needs`, so whoever acquires for the read acquires for it too.

import {MISSING_SOURCE} from '../source/diagnostic.js'
import {UNAVAILABLE_DESCRIPTION} from './diagnostic.js'
import {NOT_READY} from './readiness.js'
import {resolveImageOutput, resolveReadiness} from './resolveImageOutput.js'

export const READY = 'READY'
export const NEEDS_EVIDENCE = 'NEEDS_EVIDENCE'
export const INVALID = 'INVALID'

export const referenceKey = ({type, id}) => `${type}:${id}`

// `product`, where given, names one of the root's map products to describe instead of its canonical output, and
// `productFor(recipe, name)` finds its declaration.
export const readImageOutput = ({graph, declarationFor, observationFor = () => undefined, product, productFor, readinessFor}) => {
    const resolution = resolveImageOutput({graph, declarationFor, observationFor, product, productFor, readinessFor})
    const {description, diagnostics} = resolution
    const readiness = resolution.readiness ? readinessOf(resolution.readiness) : null
    const withReadiness = read => readiness
        ? {...read, readiness, needs: joinedNeeds(read.needs, readiness.needs)}
        : read
    if (description) {
        return withReadiness({status: READY, description, diagnostics, needs: NO_NEEDS})
    }
    const needs = neededEvidence(diagnostics)
    return withReadiness({
        status: diagnostics.some(isDefinitive) || !(needs.records.length || needs.observations.length)
            ? INVALID
            : NEEDS_EVIDENCE,
        description: null,
        diagnostics,
        needs
    })
}

// Whether `operation` over the root can run, from what is held right now, its own description never read. In the shape
// of a read whose description is settled, so that what it needs is acquired as any read's is (observeImageOutput.js):
// the answer is its `readiness`.
export const readReadiness = ({graph, operation, declarationFor, observationFor = () => undefined, readinessFor}) => {
    const readiness = readinessOf(resolveReadiness({graph, operation, declarationFor, observationFor, readinessFor}))
    return {status: READY, description: null, diagnostics: [], readiness, needs: readiness.needs}
}

const NO_NEEDS = Object.freeze({records: [], observations: []})

// Findings are the definitive diagnoses; what is missing is needed, and changes nothing found.
const readinessOf = diagnostics => {
    const findings = diagnostics.filter(isDefinitive)
    const needs = neededEvidence(diagnostics)
    return {
        status: findings.length
            ? NOT_READY
            : needs.records.length || needs.observations.length ? NEEDS_EVIDENCE : READY,
        findings,
        needs
    }
}

const joinedNeeds = (needs, more) => ({
    records: [...new Set([...needs.records, ...more.records])],
    observations: [...new Map([...needs.observations, ...more.observations]
        .map(reference => [referenceKey(reference), reference])).values()]
})

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
