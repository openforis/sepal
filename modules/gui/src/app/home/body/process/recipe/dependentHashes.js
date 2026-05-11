import {getHash} from '~/hash'
import {selectFrom} from '~/stateUtils'

import {getRecipeType} from '../recipeTypeRegistry'

// Walk a recipe's transitive dependents (per-recipe-type
// `getDependentRecipeIds`) and return a `{<id>: <model hash>}` map for each
// loaded one. Unloaded dependents are omitted; `recipeImageLayer.shouldRecreateLayer`
// and `aoi.componentDidUpdate` treat missing-on-one-side ids as no-ops, so a
// dependent transitioning from loaded ↔ unloaded does not by itself trigger
// reload work.
//
// `getHash(model)` is auto-bumped by path-based mutations (the form save flow)
// and explicitly bumped by chat-save handlers via `stampedForSave` in
// `chatActions/recipeActions.js`. Layout/title/ui changes do NOT bump it,
// because they live as siblings of `model` and the mutator clones shallowly.
export const collectDependentHashes = (state, recipe, visited = new Set(), out = {}) => {
    if (!recipe || visited.has(recipe.id)) return out
    visited.add(recipe.id)
    const recipeType = getRecipeType(recipe.type)
    if (!recipeType) return out
    for (const id of recipeType.getDependentRecipeIds(recipe) || []) {
        const loaded = selectFrom(state, ['process.loadedRecipes', id])
        if (loaded) {
            out[id] = getHash(loaded.model) ?? null
            collectDependentHashes(state, loaded, visited, out)
        }
    }
    return out
}

// Per-id smart diff. Reload only when an id present in BOTH maps has a
// different hash. New ids (dep first-loaded into store) and dropped ids
// (dep unloaded from store) are no-ops — gee resolves dependents from disk
// regardless of GUI cache state.
export const dependentHashesChanged = (prev, next) => {
    if (!prev) return true
    for (const id of Object.keys(next)) {
        if (id in prev && prev[id] !== next[id]) return true
    }
    return false
}
