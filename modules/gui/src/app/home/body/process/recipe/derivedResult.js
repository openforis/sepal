import _ from 'lodash'

import {select} from '~/store'

// A result a form panel derives synchronously from the recipe as its values would leave it, declared by the recipe's type
// (`derivedResults`):
//
//   {id, panel, candidate?(recipe, model), current(model), derive(model)}
//
// `panel` is the form panel editing it, `candidate` the recipe's model as the panel's values would leave it - by default
// the recipe's model with the panel's section replaced - `current` whether that model holds the result derived from it,
// and `derive` the values deriving it gives the panel's draft. While the panel is open, whenever the edit - or the recipe
// it is edited over - leaves the draft not current, the binding derives it again into the draft: Apply takes it with the
// rest of the edit, and Cancel leaves the recipe as it was. A
// result a person has to approve keeps, in what `derive` gives, a record of what it was derived from, which `current`
// compares with what the model reads now: the record is captured as the result is derived, never as it is applied.
//
// Nothing is acquired, polled or cached: a derivation reads the model alone. A submission whose values are not current -
// the recipe changed under the panel, or the edit landed after the last render - is refused, and the draft derived again
// for the panel to show (recipeFormPanel.jsx).
export class DerivedResult {
    #recipeId
    #declaration
    #valuesToModel
    #setValues
    #derivedFor = null

    // `setValues` gives the draft the values of a derivation, {[field]: value}.
    constructor({recipeId, declaration, valuesToModel, setValues}) {
        this.#recipeId = recipeId
        this.#declaration = {candidate: (recipe, model) => ({...recipe.model, [declaration.panel]: model}), ...declaration}
        this.#valuesToModel = valuesToModel
        this.#setValues = setValues
    }

    update(values) {
        const model = this.#candidate(values)
        if (model && !this.#declaration.current(model)) {
            this.#derive(model)
        }
    }

    // Whether submitted values hold the result derived from the recipe as it stands now: if not, the draft is derived again
    // for them, and they are refused.
    accepts(values) {
        const model = this.#candidate(values)
        if (!model || this.#declaration.current(model)) {
            return true
        }
        this.#derivedFor = null
        this.#derive(model)
        return false
    }

    // Once for each model: what a derivation gives lands in the draft over the next render, which asks again.
    #derive(model) {
        if (!_.isEqual(model, this.#derivedFor)) {
            this.#derivedFor = model
            this.#setValues(this.#declaration.derive(model))
        }
    }

    #candidate(values) {
        const recipe = select(['process.loadedRecipes', this.#recipeId])
        return recipe ? this.#declaration.candidate(recipe, this.#valuesToModel(values)) : null
    }
}
