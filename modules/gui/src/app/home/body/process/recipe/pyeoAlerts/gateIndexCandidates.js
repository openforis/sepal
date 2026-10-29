import {GATE_INDEXES} from '#sepal/recipe/type/pyeoAlerts'

import {OutputCandidate} from '../outputCandidate'
import {GATE_INDEX_REQUIREMENT} from './sourcesRequirements'

// The indexes the gate offers that it can read, as the shared rule judges the gate (sourcesRequirements.js): the recipe
// as applied, with the gate on each index in turn, read as an editor's candidate is (outputCandidate.js) - by the
// evidence the runtime holds now, not by what a panel read before. An index still being judged, or one that cannot be
// for want of evidence, is not ruled out.
export class GateIndexCandidates {
    #candidates

    constructor({sourceRuntime, recipeId, onChange}) {
        this.#candidates = GATE_INDEXES.map(index => ({
            index,
            candidate: new OutputCandidate({
                sourceRuntime,
                recipeId,
                declaration: GATE_INDEX_REQUIREMENT,
                valuesToModel: options => ({...options, indexGate: {...options?.indexGate, index}}),
                onChange
            })
        }))
    }

    // `options`: the recipe's applied options, which the gate is turned on in.
    update(options) {
        this.#candidates.forEach(({candidate}) => candidate.update(options || {}))
    }

    readable() {
        return this.#candidates.filter(({candidate}) => !candidate.refused()).map(({index}) => index)
    }

    stop() {
        this.#candidates.forEach(({candidate}) => candidate.stop())
    }
}
