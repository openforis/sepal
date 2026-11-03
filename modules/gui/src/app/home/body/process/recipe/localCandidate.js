import _ from 'lodash'

import {select} from '~/store'

import {itemStatusesOf, localStatusOf} from './selectedSourceStatus'
import {readLocalRequirements, UNSUPPORTED} from './sourceRequirements'

// What requirements over a recipe's own configuration (`localFacts`, sourceRequirements.js) say of a form panel's values
// before they are applied, for the requirements naming the panel as their editor (`editor.panel`). The panel's values
// become the recipe's model at its path, over the recipe as the session holds it now - the candidate - which is read as
// the recipe is: every local requirement of its type, each prerequisite resolved over the candidate's reads, nothing
// acquired. Nothing it finds is published as the recipe's, whose own requirements judge what was applied.
//
// A requirement's editor - {panel, input, blocksApply} - names the form input its findings are told to: a finding about
// an item of the section as that item's status ({items: {[itemId]: status}}, selectedSourceStatus.js), any other as the
// input's error, unless it is set-up not yet done (`incomplete`), which the form's own fields say. What a requirement
// finds itself holds Apply back, unless its editor says otherwise: `blocksApply` false, or a function of the read saying
// whether it does - some findings permit saving a configuration that still needs repair. A finding waiting on another
// section holds nothing back: that section says what it needs.
export class LocalCandidate {
    #recipeId
    #path
    #declarations
    #valuesToModel
    #model = UNEDITED
    #read = null

    // `declarations` the local requirements naming the panel as their editor, `path` where its values are the model.
    constructor({recipeId, path, declarations, valuesToModel}) {
        this.#recipeId = recipeId
        this.#path = path
        this.#declarations = declarations
        this.#valuesToModel = valuesToModel
    }

    // Follows the values being edited.
    update(values) {
        const model = this.#valuesToModel(values)
        if (!_.isEqual(model, this.#model)) {
            this.#model = model
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
        if (!recipe || this.#model === UNEDITED) {
            return NO_READS
        }
        if (this.#read?.recipe !== recipe || this.#read.model !== this.#model) {
            const candidate = {...recipe, model: {...recipe.model, [this.#path]: this.#model}}
            this.#read = {
                recipe,
                model: this.#model,
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
