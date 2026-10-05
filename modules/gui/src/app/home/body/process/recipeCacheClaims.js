import {map, of} from 'rxjs'

import api from '~/apiRegistry'
import {uuid} from '~/uuid'

import {isDraft} from './draftAgreement'
import {cacheAcceptance, DRAFT, initializeRecipe, KEEP} from './recipeCache'

// Who retains each entry of the session's recipe cache (`process.loadedRecipes`), and the reads that add one.
//
// An entry is kept while any claimant uses it and removed when the last one releases it - unless it is a draft, open
// or closed with its saves unsettled (draftAgreement.js), which is no copy of storage: the session's is the only one.
// Components claim through recipeAccess; the source runtime's evidence watches claim the same way, so neither can take
// an entry away from the other. A response is judged when it arrives, against what the session holds then (recipeCache.js), and a claimant
// released before its response arrived writes nothing: it would add an entry nobody releases.
//
// `cache` is the session the claimant reads and writes: {held(id), open(id), saveState(id), write(record), remove(id)}.

const claimantsByRecipeId = new Map()

export class RecipeCacheClaimant {
    #id = uuid()
    #cache
    #released = false

    constructor(cache) {
        this.#cache = cache
    }

    use(recipeId) {
        if (this.#released) {
            return
        }
        claimantsByRecipeId.set(recipeId, new Set([...claimantsByRecipeId.get(recipeId) || [], this.#id]))
    }

    // What the session holds, or what storage holds where the session holds nothing.
    load$(recipeId) {
        this.use(recipeId)
        const held = this.#cache.held(recipeId)
        return held ? of(held) : this.#read$(recipeId)
    }

    // What storage holds, even where the session holds a copy. For a caller that has learned the copy is behind.
    reload$(recipeId) {
        this.use(recipeId)
        return this.#read$(recipeId)
    }

    release() {
        if (this.#released) {
            return
        }
        this.#released = true
        ;[...claimantsByRecipeId].forEach(([recipeId, claimants]) => {
            if (!claimants.has(this.#id)) {
                return
            }
            const remaining = new Set([...claimants].filter(id => id !== this.#id))
            if (remaining.size) {
                claimantsByRecipeId.set(recipeId, remaining)
            } else {
                claimantsByRecipeId.delete(recipeId)
                this.#evict(recipeId)
            }
        })
    }

    #evict(recipeId) {
        if (!isDraft({open: this.#cache.open(recipeId), saveState: this.#cache.saveState(recipeId)})) {
            this.#cache.remove(recipeId)
        }
    }

    #read$(recipeId) {
        return api.recipe.load$(recipeId).pipe(
            map(recipe => this.#accepted(initializeRecipe(recipe)))
        )
    }

    // A draft - open, or closed with its saves unsettled - is not replaced, nor a copy as new or newer; the caller is
    // handed what the session holds instead, so it goes on reading what the session is actually using.
    #accepted(record) {
        const {id} = record
        const held = this.#cache.held(id)
        if (this.#released) {
            return held || record
        }
        switch (cacheAcceptance({record, cached: held, open: this.#cache.open(id), saveState: this.#cache.saveState(id)})) {
            case DRAFT:
                return held || record
            case KEEP:
                return held
            default:
                this.use(id)
                this.#cache.write(record)
                return record
        }
    }
}
