import _ from 'lodash'

import {select} from '~/store'

import {itemStatusesOf, localStatusOf} from '../requirements/selectedSourceStatus'
import {readLocalRequirements, UNSUPPORTED} from '../requirements/sourceRequirements'
import {committedRecipe} from './derivedResult'
import {submittedRecipe} from './formSubmission'

// What requirements over a recipe's own configuration (`localFacts`, sourceRequirements.js) say of a form panel's values
// before they are applied, for the requirements naming the panel as their editor (`editor.panel`). The recipe as the
// session holds it now, as submitting the values would leave it (`submission`, formSubmission.js), with what committing
// them derives (commitRecipe) - the candidate - is read as the recipe is: every local requirement of its type, each
// prerequisite resolved over the candidate's reads, nothing acquired. Nothing it finds is published as the recipe's, whose own requirements judge what was applied.
//
// A requirement's editor - {panel, input, blocksApply} - names the form input its findings are told to: a finding about
// an item of the section as that item's status ({items: {[itemId]: status}}, selectedSourceStatus.js), any other as the
// input's error, unless it is set-up not yet done (`incomplete`), which the form's own fields say. What a requirement
// finds itself holds Apply back, unless its editor says otherwise: `blocksApply` false, or a function of the read saying
// whether it does - some findings permit saving a configuration that still needs repair. A finding waiting on another
// section holds nothing back: that section says what it needs.
export class LocalCandidate {
    #recipeId
    #declarations
    #submission
    #edit = UNEDITED
    #read = null

    // `declarations` the local requirements naming the panel as their editor, `submission(values)` what submitting the
    // values commits: {path, model, updates}.
    constructor({recipeId, declarations, submission}) {
        this.#recipeId = recipeId
        this.#declarations = declarations
        this.#submission = submission
    }

    // Follows the values being edited.
    update(values) {
        const edit = this.#submission(values)
        if (!_.isEqual(edit, this.#edit)) {
            this.#edit = edit
        }
    }

    // What each input is told: {[input]: {error, items}}.
    feedback() {
        const byInput = _.groupBy(this.#reads(), ({declaration}) => declaration.editor.input)
        return _.mapValues(byInput, reads => {
            const items = itemStatusesOf(reads.filter(({item}) => item), reads[0].declaration.section.id)
            const errors = reads.filter(({item}) => !item).map(errorOf).filter(Boolean)
            return {
                ...(!_.isEmpty(items) && {items}),
                ...(errors.length && {error: errors.length > 1 ? errors : errors[0]})
            }
        })
    }

    // Whether what the requirements find of the values holds them back, read against the recipe as it stands now.
    refused() {
        return this.#reads().some(read => read.ownVerdict.status === UNSUPPORTED && blocks(read))
    }

    // Read once for each recipe and edit: the panel's feedback and its Apply ask the same.
    #reads() {
        const recipe = select(['process.loadedRecipes', this.#recipeId])
        if (!recipe || this.#edit === UNEDITED) {
            return NO_READS
        }
        if (this.#read?.recipe !== recipe || this.#read.edit !== this.#edit) {
            const candidate = committedRecipe(recipe, submittedRecipe(recipe, this.#edit))
            this.#read = {
                recipe,
                edit: this.#edit,
                reads: readLocalRequirements(candidate).filter(read => this.#declarations.includes(read.declaration))
            }
        }
        return this.#read.reads
    }
}

const UNEDITED = Symbol('unedited')

const NO_READS = Object.freeze([])

const blocks = read => {
    const {blocksApply = true} = read.declaration.editor
    return typeof blocksApply === 'function' ? blocksApply(read) : blocksApply
}

const errorOf = read => {
    const status = localStatusOf(read)
    return status && !status.incomplete ? status.message : null
}
