import {uuid} from '~/uuid'

// Runtime access to the evidence owners mounted now (sourceEvidenceSync.jsx), for synchronous reads: each owner's live
// basis and the observation it belongs to, by the recipe whose evidence it keeps.
//
// The owner loads, cancels and publishes; this only makes what it is working from readable without a copy - a basis
// holds the very records and selections it was read from, which Redux would clone. Nothing here loads, retains past
// its owner or decides currency: a reader applies the owner's own rule (sourceEvidenceBasis.js) to what it finds.
//
// An observation is identified when it starts, uniquely across runtimes: evidence published in Redux can outlive the
// runtime that numbered it. The owner publishes its evidence under that identity, so a reader matches
// evidence to the basis it was read on: evidence of another number is not this basis's answer, whether that observation
// is still running or has been replaced, and a newer basis never vouches for older evidence.
//
// A registration is its owner's alone: releasing it removes nothing a later owner of the same recipe registered, and
// once released or closed, nothing it reports is kept.
//
//   register(recipeId)  → {observe(basis) → observationId, update(observationId, basis), release()}
//   ownerOf(recipeId)   → {observationId, basis} | null
//   close()             forgets every registration
export class EvidenceOwners {
    #owners = new Map()
    #runtime = uuid()
    #observations = 0
    #closed = false

    register(recipeId) {
        const registration = {state: null}
        const current = () => this.#owners.get(recipeId) === registration
        if (!this.#closed) {
            this.#owners.set(recipeId, registration)
        }
        return {
            observe: basis => {
                const observationId = `${this.#runtime}:${++this.#observations}`
                if (current()) {
                    registration.state = {observationId, basis}
                }
                return observationId
            },
            update: (observationId, basis) => {
                if (current() && registration.state?.observationId === observationId) {
                    registration.state = {observationId, basis}
                }
            },
            release: () => {
                if (current()) {
                    this.#owners.delete(recipeId)
                }
            }
        }
    }

    ownerOf(recipeId) {
        return this.#owners.get(recipeId)?.state || null
    }

    close() {
        this.#closed = true
        this.#owners.clear()
    }
}
