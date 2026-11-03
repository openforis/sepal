import {canonicalJson} from './canonicalJson.js'

// Whether a result is still about its inputs, judged from the evidence persisted with it and the current evidence of
// the same dependencies. Pure and synchronous: acquiring and digesting evidence is the caller's
// (docs/design/recipes/source-freshness.md#persisted-derived-result-evidence).
//
// Dependency evidence, the shape every producer returns and every result persists:
//
//   {dependency, contractVersion, question, digest, provenance: {recipes: [{id, revision}], assets: [{id, version}]},
//    unversioned: [assetId]}
//
// `question` is what the dependency was asked as - a consumer's own settings, compared as they are. `digest` is of
// their meaning: the question with what each recipe in its closure means for its product, as that product's owner
// projects it, and each asset's token. `provenance` is what was read, at which revisions and tokens. It tells a reader
// when to acquire again, never whether inputs are equal: a revision changing only a title leaves the digest as it was.
// An asset's token detects changes observed; it does not pin the pixels Earth Engine reads. `unversioned` names the
// assets read without a token, whose change nothing can report.
//
// A calculation persists {resource: {id, contractVersion}, question, dependencies: {[id]: dependency evidence}}.
//
//   CURRENT      the same question, every dependency at the same digest
//   STALE        a different question, or a dependency read at another digest: recalculating repairs it
//   UNKNOWN      no evidence was persisted: recalculating repairs it
//   UNVERSIONED  a dependency reads a source without a token: only selecting another source repairs it
//   null         not established yet: current evidence is still to be acquired for this question

export const CURRENT = 'CURRENT'
export const STALE = 'STALE'
export const UNKNOWN = 'UNKNOWN'
export const UNVERSIONED = 'UNVERSIONED'

// `contractVersion` is the dependency's as declared now, and `current` the evidence acquired for it now, or null while
// none is.
export const dependencyState = ({recorded, contractVersion, question, current}) => {
    const currentFor = current && same(current.question, question) ? current : null
    if (currentFor?.unversioned?.length) {
        return UNVERSIONED
    }
    if (!recorded) {
        return UNKNOWN
    }
    if (recorded.contractVersion !== contractVersion || !same(recorded.question, question)) {
        return STALE
    }
    if (recorded.unversioned?.length) {
        return UNVERSIONED
    }
    if (!currentFor) {
        return null
    }
    return recorded.digest === currentFor.digest ? CURRENT : STALE
}

// `dependencies` is {[id]: {contractVersion, question, current}}, every dependency the calculation reads now.
export const calculationState = ({recorded, resource, question, dependencies}) => {
    const states = Object.entries(dependencies).map(([id, dependency]) =>
        dependencyState({...dependency, recorded: recorded?.dependencies?.[id]})
    )
    if (!recorded) {
        return worst(states)
    }
    const asked = recorded.resource?.id === resource.id
        && recorded.resource?.contractVersion === resource.contractVersion
        && same(recorded.question, question)
    return worst(asked ? states : [STALE, ...states])
}

// Whether dependency evidence answers the question asked now.
export const answersQuestion = (evidence, question) => Boolean(evidence) && same(evidence.question, question)

// What can be repaired by recalculating is said after what cannot, and what is known before what is not.
const ORDER = [UNVERSIONED, STALE, UNKNOWN, null, CURRENT]

const worst = states => {
    const index = ORDER.findIndex(state => states.includes(state))
    return index < 0 ? CURRENT : ORDER[index]
}

const same = (a, b) => canonicalJson(a ?? null) === canonicalJson(b ?? null)
