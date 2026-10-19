import _ from 'lodash'

import {select} from '~/store'

import {assetEvidenceOfState} from '../sourceRuntime/assetEvidence'
import {recordStalenessOfState} from '../sourceRuntime/recordCurrency'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {OutputWatch} from './outputWatch'
import {IMAGE_OUTPUT, readRecipeOutput} from './recipeOutput'
import {readOutputRequirements, recipeNamesOf} from './sourceRequirements'

// What a requirement its output read judges (sourceRequirements.js) says of a panel's values before they are applied:
// the recipe its declaration's editor builds from the one item the panel edits (`editor.candidate`), read as its output
// is read, by a question of its own (outputRegistry.js). The candidate's reads are watched, cancelled and kept apart from
// the recipe's, sharing only what the runtime observes of the same sources; what they find is never published as the
// recipe's, whose own output is read as it was applied. Pending or failed, the candidate refuses nothing.
export class OutputCandidate {
    #recipeId
    #declaration
    #valuesToModel
    #sourceRuntime
    #watch
    #candidate = null
    #read = null

    constructor({sourceRuntime, recipeId, declaration, valuesToModel, onChange}) {
        this.#recipeId = recipeId
        this.#declaration = declaration
        this.#valuesToModel = valuesToModel
        this.#sourceRuntime = sourceRuntime
        this.#watch = new OutputWatch({sourceRuntime, onChange})
    }

    update(values) {
        const recipe = select(['process.loadedRecipes', this.#recipeId])
        const model = recipe && this.#valuesToModel(values)
        const candidate = model ? this.#declaration.editor.candidate(recipe, model) : null
        if (!_.isEqual(candidate, this.#candidate)) {
            this.#candidate = candidate
            this.#watch.update(candidate && {recipeId: this.#recipeId, product: {name: IMAGE_OUTPUT}, candidate, explain: this.#declaration.editor.explain})
        }
    }

    // What the candidate's output read refuses that the declaration states: the diagnostics, and what they say.
    findings() {
        const read = this.#reads()[0]
        return read
            ? {diagnostics: read.ownVerdict.diagnostic.diagnostics, ...this.#declaration.requirement.describe(read.ownVerdict.diagnostic)}
            : null
    }

    refused() {
        return this.#reads().length > 0
    }

    diagnostics() {
        return this.#reads().flatMap(read => read.ownVerdict.diagnostic.diagnostics)
    }

    stop() {
        this.#watch.stop()
    }

    // Read once for each state of the session and candidate: the panel's feedback and its Apply ask the same. A settled
    // answer reaches the session (reduxSourceEnvironment.js), so a new one is read again.
    #reads() {
        const candidate = this.#candidate
        if (!candidate) {
            return []
        }
        const state = select()
        if (this.#read?.state !== state || this.#read.candidate !== candidate) {
            this.#read = {state, candidate, reads: this.#readsOf(candidate, state)}
        }
        return this.#read.reads
    }

    // Only what it establishes of the item: a candidate still being read refuses nothing.
    #readsOf(candidate, state) {
        const output = readRecipeOutput({
            recipe: candidate,
            product: {name: IMAGE_OUTPUT},
            graph: buildMapDependencyGraph({recipe: candidate, loadedRecipes: state.process?.loadedRecipes || {}}),
            heldFor: key => this.#sourceRuntime.heldFor(key),
            currency: recordStalenessOfState(state),
            assetEvidence: assetEvidenceOfState(state),
            explain: this.#declaration.editor.explain
        })
        return readOutputRequirements({recipe: candidate, output, recipeNames: recipeNamesOf(state)})
            .filter(read => read.declaration === this.#declaration && read.item)
    }
}
