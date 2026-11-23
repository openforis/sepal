import {map, of} from 'rxjs'

import api from '~/apiRegistry'

import {isDraft} from './draftAgreement'
import {cacheAcceptance, DRAFT, initializeRecipe, KEEP} from './recipeCache'

// Who retains each entry of a session's recipe cache (`process.loadedRecipes`), and the reads that add one.
//
// An entry is kept while any claimant uses it and removed when the last one releases it - unless it is a draft, open
// or closed with its saves unsettled (draftAgreement.js), which is no copy of storage: the session's is the only one.
// Components claim through recipeAccess; the source runtime's evidence watches claim the same way, so neither can take
// an entry away from the other. A response is judged when it arrives, against what the session holds then
// (recipeCache.js), and a claimant released before its response arrived writes nothing: it would add an entry nobody
// releases.
//
// Claims are counted by the session's own registry (`RecipeCacheClaims`, one per session, recipeSession.js): its
// claimants share them whatever cache adapter each reads and writes through, and another session's claim on the same
// recipe is another session's. `cache` is the adapter a claimant reads and writes the session through: {held(id),
// open(id), saveState(id), write(record), remove(id)}.

export class RecipeCacheClaims {
    #claimantsByRecipeId = new Map()

    use(recipeId, claimant) {
        this.#claimantsByRecipeId.set(recipeId, new Set([...this.#claimantsByRecipeId.get(recipeId) || [], claimant]))
    }

    // The recipes the claimant was the last to use.
    release(claimant) {
        return [...this.#claimantsByRecipeId].flatMap(([recipeId, claimants]) => {
            if (!claimants.has(claimant)) {
                return []
            }
            const remaining = new Set([...claimants].filter(other => other !== claimant))
            if (remaining.size) {
                this.#claimantsByRecipeId.set(recipeId, remaining)
                return []
            }
            this.#claimantsByRecipeId.delete(recipeId)
            return [recipeId]
        })
    }

    // An entry every claimant released while it was a draft is removed once its saves settle, unless it is claimed
    // again.
    releaseSettled(recipeId, cache) {
        if (!this.#claimantsByRecipeId.has(recipeId) && cache.held(recipeId)) {
            evict(recipeId, cache)
        }
    }
}

export class RecipeCacheClaimant {
    #claims
    #cache
    #released = false

    constructor({claims, cache}) {
        this.#claims = claims
        this.#cache = cache
    }

    use(recipeId) {
        if (this.#released) {
            return
        }
        this.#claims.use(recipeId, this)
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
        this.#claims.release(this).forEach(recipeId => evict(recipeId, this.#cache))
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

const evict = (recipeId, cache) => {
    if (!isDraft({open: cache.open(recipeId), saveState: cache.saveState(recipeId)})) {
        cache.remove(recipeId)
    }
}
