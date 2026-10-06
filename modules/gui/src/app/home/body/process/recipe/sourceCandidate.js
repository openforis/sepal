import _ from 'lodash'
import {Subscription} from 'rxjs'

import {select, subscribe} from '~/store'

import {getRecipeType} from '../recipeTypeRegistry'
import {IMAGE_OUTPUT} from './recipeOutput'
import {sectionStatusOf} from './selectedSourceStatus'
import {sourceKeyOf} from './sourceEvidence'
import {evidenceSession, outdatedBasis} from './sourceEvidenceBasis'
import {readSourceRequirements} from './sourceRequirements'

// A recipe form panel's values, judged by the source requirements its recipe's type declares for the panel's section
// before they are applied (sourceRequirements.js, selectedSourceStatus.js). The panel is the section its id names, and
// its values become the recipe's model at its path (recipeFormPanel.jsx).
//
// The values are judged over the recipe as it would be with them applied - the candidate - by the same reads as the
// recipe itself. Where the observation keeping the recipe's own evidence current holds for the candidate too - its live
// basis passes for the candidate, as when the edit leaves the selection alone - that evidence answers, and a changed
// setting is judged anew from it without reading anything. Otherwise the candidate is observed on its own while the
// panel is open (`watchCandidate$`, evidenceRegistry.js): its evidence is held by the source runtime, never published,
// and is let go once the edit changes or the panel closes.
//
// One object stands for an edit for as long as it is the edit, and the recipe's own where the edit is what the recipe
// holds, so its selection compares by identity, as the basis compares it.
export class SourceCandidate {
    #sourceRuntime
    #recipeId
    #section
    #path
    #valuesToModel
    #onChange
    #model = UNEDITED
    #watch = null
    #candidate = null
    #seen = null
    #unsubscribe

    // `section` the panel's id, `path` where its values are the recipe's model.
    constructor({sourceRuntime, recipeId, section, path, valuesToModel, onChange}) {
        this.#sourceRuntime = sourceRuntime
        this.#recipeId = recipeId
        this.#section = section
        this.#path = path
        this.#valuesToModel = valuesToModel
        this.#onChange = onChange
        this.#unsubscribe = subscribe([], () => this.#follow())
    }

    // Follows the values being edited.
    update(values) {
        const model = this.#valuesToModel(values)
        if (!sameValue(model, this.#model)) {
            this.#model = model
            this.#unwatch()
        }
        this.#follow()
    }

    // The section's status for the edit (selectedSourceStatus.js), from the session as it stands.
    status() {
        return sectionStatusOf(select(), this.#reads(), this.#section)
    }

    // Whether the section holds the edit back, read at the moment of asking.
    refused() {
        return Boolean(this.status()?.state)
    }

    // Reads the edit's source again. Where the recipe's observation holds for it, that is the recipe's own source, read
    // again as Refresh reads it anywhere else. Otherwise only what the edit's own observation reads: its assets, read again
    // explicitly - which has the observation read anew - and the edit observed anew where that did not.
    refresh() {
        if (!this.#watch) {
            return this.#sourceRuntime?.refreshOutput({recipeId: this.#recipeId, product: {name: IMAGE_OUTPUT}})
        }
        const watch = this.#watch
        const observationId = this.#candidate?.owner?.observationId
        const assetIds = (this.#candidate?.owner?.basis.dependencies || [])
            .filter(({assetId}) => assetId)
            .map(({assetId}) => assetId)
        return Promise.all(assetIds.map(id => this.#sourceRuntime.refreshAsset(id))).then(() => {
            if (this.#watch === watch && this.#candidate?.owner?.observationId === observationId) {
                this.#unwatch()
                this.#follow()
            }
        })
    }

    stop() {
        this.#unsubscribe()
        this.#unwatch()
    }

    #reads() {
        const state = select()
        const recipe = this.#recipe(state)
        if (!recipe) {
            return []
        }
        const candidate = this.#overlay(recipe)
        const now = Date.now()
        return this.#watch
            ? readSourceRequirements({
                state,
                recipe: {...candidate, ui: {...candidate.ui, sourceEvidence: this.#candidate?.evidence || undefined}},
                evidenceOwnerOf: () => this.#candidate?.owner || null,
                now
            })
            : readSourceRequirements({state, recipe: candidate, evidenceOwnerOf: id => this.#sourceRuntime?.evidenceOwnerOf(id), now})
    }

    // Observes the candidate on its own only where the recipe's observation does not hold for it, and tells the panel
    // whenever what it would say changes.
    #follow() {
        const state = select()
        const recipe = this.#recipe(state)
        const held = !recipe || this.#heldByRecipe(state, recipe)
        if (held && this.#watch) {
            this.#unwatch()
        } else if (!held && !this.#watch && this.#sourceRuntime) {
            this.#observe()
        }
        const seen = JSON.stringify([Boolean(this.#watch), this.status()])
        if (seen !== this.#seen) {
            this.#seen = seen
            this.#onChange()
        }
    }

    #heldByRecipe(state, recipe) {
        const candidate = this.#overlay(recipe)
        const reference = getRecipeType(recipe.type)?.sourceObservation?.sourceReference(candidate)
        if (candidate === recipe || !reference) {
            return true
        }
        const owner = this.#sourceRuntime?.evidenceOwnerOf(this.#recipeId)
        return Boolean(owner?.observes)
            && !outdatedBasis(owner.basis, {recipe: candidate, sourceKey: sourceKeyOf(reference), session: {...evidenceSession(state), now: Date.now()}})
    }

    // Installed before it is subscribed: the first answer can arrive while subscribing, and must find it in place.
    #observe() {
        const model = this.#model
        const watch = new Subscription()
        this.#watch = watch
        watch.add(this.#sourceRuntime?.watchCandidate$({
            recipeId: this.#recipeId,
            overlay: recipe => this.#overlay(recipe, model)
        }).subscribe(candidate => {
            if (this.#watch === watch) {
                this.#candidate = candidate
                this.#follow()
            }
        }))
    }

    #unwatch() {
        this.#watch?.unsubscribe()
        this.#watch = null
        this.#candidate = null
    }

    #recipe(state) {
        return state?.process?.loadedRecipes?.[this.#recipeId] || null
    }

    #overlay(recipe, model = this.#model) {
        return model === UNEDITED || sameValue(model, recipe.model?.[this.#path])
            ? recipe
            : {...recipe, model: {...recipe.model, [this.#path]: model}}
    }
}

const UNEDITED = Symbol('unedited')

// Equal, an absent value and a null one alike: a form reads a field it never set as either.
const sameValue = (a, b) => _.isEqual(withoutNils(a), withoutNils(b))

const withoutNils = value => _.isPlainObject(value)
    ? _.omitBy(_.mapValues(value, withoutNils), _.isNil)
    : value
